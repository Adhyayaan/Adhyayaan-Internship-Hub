// Run only against the development preview and its matching development database.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const origin = "http://localhost:80";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tag = randomBytes(5).toString("hex");
const accounts = [];
let checks = 0;

async function request(path, { method = "GET", body, cookie, expected = 200 } = {}) {
  const res = await fetch(`${origin}/api${path}`, {
    method,
    redirect: "error",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(100_000),
  });
  assert.equal(res.status, expected, `${method} ${path}`);
  checks++;
  return { data: await res.json(), cookie: res.headers.get("set-cookie")?.split(";")[0] };
}
async function register(name) {
  const email = `assessment-${tag}-${name}@example.test`;
  const account = { email, password: randomBytes(18).toString("hex") };
  accounts.push(account);
  const { data, cookie } = await request("/auth/register", {
    method: "POST", expected: 201, body: {
      ...account, name: `Assessment test ${name} ${tag}`, college: "Test College", discipline: "Test Course",
      role: "admin", assessmentRequired: false,
    },
  });
  assert.equal(data.user.isAdmin, false);
  assert.equal(data.user.assessmentRequired, true);
  return Object.assign(account, { id: data.user.id, cookie });
}
async function answer(account, draft, questionId, choice, expected = 200) {
  return request(`/assessment/attempts/${draft.id}`, { method: "PATCH", cookie: account.cookie, body: { questionId, choice }, expected });
}
async function submit(account, draft, expected = 200) {
  return request(`/assessment/attempts/${draft.id}/submit`, { method: "POST", cookie: account.cookie, expected });
}
const questions = draft => draft.sections.flatMap(s => s.questions);
const weekMs = 7 * 24 * 60 * 60 * 1000;
const highKeys = { r1: 0, r2b: 3, r3b: 1, r4b: 2, r5b: 2, r6b: 1 };
const lowWrong = { r1: 2, r2a: 0, r3a: 0, r4a: 1, r5a: 1, r6a: 1 };
async function finishPath(account, draft, choose) {
  let current = draft;
  while (current.answers.length < 29) {
    const path = questions(current);
    assert.equal(path.length, current.answers.length + 1);
    assert(path.every(q => Object.keys(q).sort().join(",") === "id,options,prompt"));
    const next = path.at(-1);
    current = (await answer(account, current, next.id, choose(next.id))).data;
  }
  assert.equal(questions(current).length, 29);
  return questions(current).map(q => q.id);
}

try {
  await request("/assessment", { expected: 401 });
  await request("/assessment/attempts", { method: "POST", expected: 401 });
  await request("/admin/learners", { expected: 401 });
  const student = await register("student");
  const legacy = await register("legacy");
  const operator = await register("operator");
  // Make only the synthetic legacy fixture reflect the migration default.
  await pool.query("update learners set assessment_required = false where id = $1 and email = $2", [legacy.id, legacy.email]);
  await pool.query("update learners set role = 'admin' where id = $1 and email = $2", [operator.id, operator.email]);
  for (const path of ["/dashboard", "/enrollments", "/logs", "/practice", "/ai/messages", "/study/01", "/study-media/01/consent-pilot.mp4"]) {
    const { data } = await request(path, { cookie: student.cookie, expected: 403 });
    assert.equal(data.code, "ASSESSMENT_REQUIRED");
  }
  const { data: legacySession } = await request("/auth/me", legacy);
  assert.equal(legacySession.user.assessmentRequired, false);
  assert.equal(legacySession.user.assessmentCompletedAt, null);
  await request("/dashboard", legacy);
  const legacyDraftId = randomUUID();
  await pool.query("insert into learning_assessment_attempts (id, user_id, version, answers) values ($1, $2, 1, $3::jsonb)",
    [legacyDraftId, legacy.id, JSON.stringify([{ questionId: "r1", choice: 1 }])]);
  const { data: resumedLegacy } = await request("/assessment/attempts", { method: "POST", cookie: legacy.cookie });
  assert.equal(resumedLegacy.version, 1);
  assert.equal(resumedLegacy.id, legacyDraftId);
  assert.equal(questions(resumedLegacy).length, 23);
  assert.deepEqual(resumedLegacy.answers, [{ questionId: "r1", choice: 1 }]);
  await request("/admin/learners", { ...student, expected: 403 });
  await request(`/admin/learners/${legacy.id}`, { ...student, expected: 403 });
  const drafts = await Promise.all(Array.from({ length: 2 }, () => request("/assessment/attempts", { method: "POST", cookie: student.cookie })));
  const [draft, duplicate] = drafts.map(r => r.data);
  assert.equal(draft.id, duplicate.id);
  assert.equal(draft.version, 3);
  assert.deepEqual(questions(draft).map(q => q.id), ["r1"]);
  await answer(legacy, draft, "r1", 0, 404);
  await submit(legacy, draft, 404);
  await submit(student, draft, 400);
  await answer(student, draft, "r1", 4, 400);
  await answer(student, draft, "unknown", 0, 400);
  await answer(student, draft, "r2b", 0, 409);
  const attemptedOverride = await request(`/assessment/attempts/${draft.id}`, { method: "PATCH", cookie: student.cookie, body: { questionId: "r1", choice: 1, score: 100 } });
  assert.deepEqual(attemptedOverride.data.answers, [{ questionId: "r1", choice: 1 }]);
  assert.equal(questions(attemptedOverride.data).at(-1).id, "r2a");
  await answer(student, draft, "r2b", 0, 409);
  await answer(student, draft, "r2a", 2);
  const { data: confirmation } = await answer(student, draft, "r1", 0, 409);
  assert.equal(confirmation.code, "FOLLOW_UPS_CHANGED");
  assert.equal(confirmation.affectedAnswers, 1);
  const { data: unchanged } = await request("/assessment", student);
  assert.equal(unchanged.draft.answers.length, 2);
  const changed = await request(`/assessment/attempts/${draft.id}`, { method: "PATCH", cookie: student.cookie,
    body: { questionId: "r1", choice: 0, replaceFollowUps: true } });
  assert.deepEqual(changed.data.answers, [{ questionId: "r1", choice: 0 }]);
  assert.equal(questions(changed.data).at(-1).id, "r2b");
  const login = await request("/auth/login", { method: "POST", body: { email: student.email, password: student.password } });
  student.cookie = login.cookie;
  const { data: workspace } = await request("/assessment", student);
  assert.deepEqual(workspace.draft.answers, [{ questionId: "r1", choice: 0 }]);
  assert.equal(workspace.questionCount, 29);
  assert.equal(workspace.nextRetakeAt, null);
  assert.equal(questions(workspace.draft).at(-1).id, "r2b");
  const highPath = await finishPath(student, workspace.draft, id => highKeys[id] ?? (id.startsWith("sj") ? 2 : id === "h3b" ? 0 : 4));
  assert(highPath.includes("h2b") && highPath.includes("c2b") && highPath.includes("m2b") && highPath.includes("i2b"));
  assert(highPath.includes("sj2a") && highPath.includes("sj4a") && highPath.includes("sj6a"));
  const results = await Promise.all([submit(student, draft), submit(student, draft)]);
  const report = results[0].data;
  assert.deepEqual(results[1].data, report);
  assert.deepEqual(report.dimensions.map(d => [d.score, d.maxScore]), [[6, 6], [100, 100], [100, 100], [100, 100]]);
  assert(report.dimensions.filter(d => d.id !== "reasoning").every(d => d.evidence?.length === 3));
  assert(report.reasoning.every(item => typeof item.skill === "string"));
  assert.equal(report.careers.length, 4); // Ties are not treated as unique top matches.
  assert(report.careers.every(c => c.interestScore >= 0 && c.interestMax === 8));
  assert(report.methodology.includes("not an IQ test"));
  assert.deepEqual(report.reasoning.map(x => x.questionId), highPath.filter(id => id.startsWith("r")));
  assert(report.methodology.includes("Scenario choices are not scored"));
  assert.equal(report.scenarioInsights.length, 3);
  assert.equal(report.teachingPlan.length, 3); // Scenario choices are not sent to the AI tutor.
  const reflections = report.scenarioInsights;
  assert.equal(reflections.length, 3);
  assert(reflections.every(note => !note.includes("You chose to you chose to")));
  assert(reflections.some(note => note.includes("You chose to ask someone for focused help.")));
  await answer(student, draft, "r1", 0, 409);
  await request(`/assessment/reports/${report.id}`, { ...legacy, expected: 404 });
  await request(`/assessment/reports/${report.id}`, { expected: 401 });
  assert.deepEqual((await request(`/assessment/reports/${report.id}`, student)).data, report);
  const { data: dashboard } = await request("/dashboard", student);
  assert.equal(dashboard.user.assessmentCompletedAt, report.completedAt);
  await request("/practice", { method: "POST", cookie: student.cookie, expected: 403, body: { courseId: "01", language: "en" } });
  const { data: enrolled } = await request("/enrollments", { method: "POST", cookie: student.cookie, expected: 201, body: { courseId: "01", hours: 60 } });
  await request("/logs", { method: "POST", cookie: student.cookie, expected: 400, body: {} });
  await request("/logs", { method: "POST", cookie: student.cookie, expected: 201, body: {
    date: "2025-01-01", enrollmentId: enrolled.id, hours: 1.5,
    activity: "Synthetic work log for an automated check.", learning: "Checked the distinction between counts and proportions.",
  } });
  const { data: directory } = await request(`/admin/learners?search=${tag}&assessment=completed&page=1`, operator);
  assert.deepEqual(directory.students.map(x => x.id), [student.id]);
  assert.equal(directory.matchCount, 1);
  const { data: pending } = await request(`/admin/learners?search=${tag}&assessment=pending`, operator);
  assert.deepEqual(pending.students.map(x => x.id), [legacy.id]);
  // Old v1 saved reports must receive the clearer presentation from their stored answers.
  const { data: oldWorkspace } = await request("/assessment", legacy);
  const oldDraft = oldWorkspace.draft;
  for (const q of questions(oldDraft)) {
    if (!oldDraft.answers.some(a => a.questionId === q.id)) await answer(legacy, oldDraft, q.id, 0);
  }
  const { data: oldReport } = await submit(legacy, oldDraft);
  assert.equal(oldReport.version, 1);
  const { data: reopenedOldReport } = await request(`/assessment/reports/${oldReport.id}`, legacy);
  assert.equal(reopenedOldReport.version, 1);
  assert(reopenedOldReport.dimensions.filter(d => d.id !== "reasoning").every(d => d.evidence?.length === 3));
  assert(reopenedOldReport.reasoning.every(item => typeof item.skill === "string"));
  assert(reopenedOldReport.careers.every(c => c.interestMax === 8));
  const { data: adminOldReport } = await request(`/admin/learners/${legacy.id}/reports/${oldReport.id}`, operator);
  assert.deepEqual(adminOldReport, reopenedOldReport);
  const { data: detail } = await request(`/admin/learners/${student.id}`, operator);
  assert.equal(detail.courses.length, 1);
  assert.equal(detail.courses[0].targetHours, 60);
  assert.equal(detail.courses[0].loggedHours, 1.5);
  assert.equal(detail.courses[0].practiceAverage, null);
  assert.equal(detail.reports[0].id, report.id);
  assert(!/passwordHash|tokenHash|teachingPlan/.test(JSON.stringify(detail)));
  await request(`/admin/learners/${legacy.id}/reports/${report.id}`, { ...operator, expected: 404 });
  await request(`/admin/learners/${student.id}/reports/${report.id}`, { ...legacy, expected: 403 });
  assert.deepEqual((await request(`/admin/learners/${student.id}/reports/${report.id}`, operator)).data, report);
  const audit = await pool.query("select count(*)::int from learning_admin_report_access where admin_id = $1 and learner_id = $2 and report_id = $3", [operator.id, student.id, report.id]);
  assert.equal(audit.rows[0].count, 1);
  if (process.argv.includes("--ai")) {
    const { data: practice } = await request("/practice", { method: "POST", cookie: student.cookie, expected: 201, body: { courseId: "01", language: "en" } });
    assert.equal(practice.difficulty, 2);
    assert.match(practice.adaptationReason, /learning report/);
    assert.deepEqual([...new Set(practice.questions.map(q => q.cognitiveLevel))].sort(), ["analyze", "apply", "understand"]);
    assert.equal(practice.questions.length, 5);
  }
  const start = (expected = 200) => request("/assessment/attempts", { method: "POST", cookie: student.cookie, expected });
  const expectedAt = new Date(Date.parse(report.completedAt) + weekMs).toISOString();
  const { data: wait } = await start(429);
  assert.equal(wait.code, "ASSESSMENT_RETAKE_WAIT");
  assert.equal(wait.nextRetakeAt, expectedAt);
  const { data: locked } = await request("/assessment", student);
  assert.equal(locked.draft, null);
  assert.equal(locked.nextRetakeAt, expectedAt);
  // A draft created before the policy changed must not bypass the wait.
  const early = { id: randomUUID() };
  await pool.query("insert into learning_assessment_attempts (id, user_id, version) values ($1, $2, 2)", [early.id, student.id]);
  assert.equal((await start(429)).data.nextRetakeAt, expectedAt);
  await answer(student, early, "r1", 0, 429);
  await submit(student, early, 429);
  // Advance the last-completion time only for this synthetic student, without changing the saved report.
  await pool.query("update learning_assessment_attempts set completed_at = $1 where id = $2 and user_id = $3",
    [new Date(Date.now() - weekMs - 1000), report.id, student.id]);
  assert.equal((await request("/assessment", student)).data.nextRetakeAt, null);
  const { data: retake } = await start();
  assert.equal(retake.id, early.id);
  assert.notEqual(retake.id, report.id);
  await request("/dashboard", student);
  const lowPath = await finishPath(student, retake, id => lowWrong[id] ?? (id.startsWith("sj") ? 3 : id === "h3a" ? 4 : 0));
  assert(lowPath.includes("r2a") && lowPath.includes("h2a") && lowPath.includes("c2a") && lowPath.includes("m2a") && lowPath.includes("i2a"));
  assert(lowPath.includes("sj2b") && lowPath.includes("sj4b") && lowPath.includes("sj6b"));
  const { data: second } = await submit(student, retake);
  assert(second.dimensions.every(d => d.score === 0));
  assert.deepEqual((await request(`/assessment/reports/${report.id}`, student)).data, report);
  const { data: history } = await request("/assessment", student);
  assert.deepEqual(history.reports.map(r => r.id), [second.id, report.id]);
  assert.equal(history.draft, null);
  assert.equal(history.nextRetakeAt, new Date(Date.parse(second.completedAt) + weekMs).toISOString());
  await pool.query("update learners set role = 'student' where id = $1 and email = $2", [operator.id, operator.email]);
  await request("/admin/learners", { ...operator, expected: 403 });
  process.stdout.write(`Passed ${checks} HTTP checks and report, scoring, enrolment, access and audit assertions.\n`);
} finally {
  const ids = accounts.flatMap(a => a.id ? [a.id] : []);
  if (ids.length) await pool.query("delete from learning_admin_report_access where admin_id = any($1::text[])", [ids]);
  for (const account of accounts) {
    await pool.query("delete from learners where email = $1 and id = $2", [account.email, account.id ?? ""]);
  }
  await pool.end();
}
