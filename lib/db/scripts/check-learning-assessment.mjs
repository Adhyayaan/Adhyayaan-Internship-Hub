// Run only against the development preview and its matching development database.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
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
  await request("/admin/learners", { ...student, expected: 403 });
  await request(`/admin/learners/${legacy.id}`, { ...student, expected: 403 });
  const drafts = await Promise.all(Array.from({ length: 2 }, () => request("/assessment/attempts", { method: "POST", cookie: student.cookie })));
  const [draft, duplicate] = drafts.map(r => r.data);
  assert.equal(draft.id, duplicate.id);
  await answer(legacy, draft, "r1", 0, 404);
  await submit(legacy, draft, 404);
  await submit(student, draft, 400);
  await answer(student, draft, "r1", 4, 400);
  await answer(student, draft, "unknown", 0, 400);
  const attemptedOverride = await request(`/assessment/attempts/${draft.id}`, { method: "PATCH", cookie: student.cookie, body: { questionId: "r1", choice: 1, score: 100 } });
  assert.deepEqual(attemptedOverride.data.answers, [{ questionId: "r1", choice: 1 }]);
  const login = await request("/auth/login", { method: "POST", body: { email: student.email, password: student.password } });
  student.cookie = login.cookie;
  const { data: workspace } = await request("/assessment", student);
  assert.deepEqual(workspace.draft.answers, [{ questionId: "r1", choice: 1 }]);
  const qs = workspace.sections.flatMap(s => s.questions);
  assert.equal(qs.length, 23);
  assert(qs.every(q => Object.keys(q).sort().join(",") === "id,options,prompt"));
  const reasoning = [1, 2, 0, 3, 1, 2];
  for (const q of qs.slice(1)) {
    await answer(student, draft, q.id, q.id.startsWith("r") ? reasoning[Number(q.id.slice(1)) - 1] : q.id === "h3" ? 0 : 4);
  }
  const results = await Promise.all([submit(student, draft), submit(student, draft)]);
  const report = results[0].data;
  assert.deepEqual(results[1].data, report);
  assert.deepEqual(report.dimensions.map(d => [d.score, d.maxScore]), [[6, 6], [100, 100], [100, 100], [100, 100]]);
  assert.equal(report.careers.length, 4); // Ties are not treated as unique top matches.
  assert(report.methodology.includes("not an IQ test"));
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
  const { data: retake } = await request("/assessment/attempts", { method: "POST", cookie: student.cookie });
  assert.notEqual(retake.id, report.id);
  await request("/dashboard", student);
  for (const q of qs) await answer(student, retake, q.id, q.id === "h3" ? 4 : q.id.startsWith("r") ? (reasoning[Number(q.id.slice(1)) - 1] + 1) % 4 : 0);
  const { data: second } = await submit(student, retake);
  assert(second.dimensions.every(d => d.score === 0));
  assert.deepEqual((await request(`/assessment/reports/${report.id}`, student)).data, report);
  const { data: history } = await request("/assessment", student);
  assert.deepEqual(history.reports.map(r => r.id), [second.id, report.id]);
  assert.equal(history.draft, null);
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
