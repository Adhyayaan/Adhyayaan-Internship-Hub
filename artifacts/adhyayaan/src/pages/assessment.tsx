import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Link, useLocation, useParams, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, CloudOff, Loader2, LogOut, RotateCcw, ShieldCheck } from 'lucide-react';
import {
  useGetAssessment,
  useStartAssessment,
  useSaveAssessmentAnswer,
  useSubmitAssessment,
  useGetLearningReport,
  useLogout,
  getGetAssessmentQueryKey,
  getGetDashboardQueryKey,
  getGetLearningReportQueryKey,
  getGetSessionQueryKey,
  type AssessmentDraft,
  type AssessmentChoice,
  type AssessmentWorkspace,
  type Session,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { authHref, errMsg, safeNext, useAuth, useResetForSession, useTitle } from '@/lib/app';
import { EmptyPanel, ErrorPanel, FocusHeader, PageSkeleton, ReportHeading, ReportHistory, ReportView, SharingNote, fmtDate, fmtRetakeTime } from '@/components/assessment/parts';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
const assessmentKey = getGetAssessmentQueryKey();
function assessmentError(e: unknown) {
  return (e as { data?: { code?: string; affectedAnswers?: number } } | null)?.data;
}

function useNextParam() {
  const search = useSearch();
  const raw = new URLSearchParams(search).get('next');
  return safeNext(raw, '/');
}

function withNext(path: string, next: string) {
  return next && next !== '/' ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/* ------------------------------------------------------------------ */
/* Assessment (main)                                                   */
/* ------------------------------------------------------------------ */

export default function Assessment() {
  useTitle('Learning assessment');
  const { user, isLoading } = useAuth();
  const next = useNextParam();
  const [, nav] = useLocation();
  const logout = useLogout();
  const reset = useResetForSession();
  const required = !!user && user.assessmentRequired && !user.assessmentCompletedAt;

  const q = useGetAssessment({ query: { enabled: !!user, queryKey: assessmentKey } });
  const { refetch } = q;
  const nextRetakeAt = q.data?.nextRetakeAt;
  useEffect(() => {
    if (!nextRetakeAt) return;
    const timer = window.setTimeout(() => { void refetch(); }, Math.max(1000, Date.parse(nextRetakeAt) - Date.now() + 500));
    return () => window.clearTimeout(timer);
  }, [nextRetakeAt, refetch]);
  const [running, setRunning] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  const signOut = async () => {
    if (pendingRef.current && !window.confirm('Some answers are not saved yet. Sign out anyway?')) return;
    setSignOutError(null);
    try { await logout.mutateAsync(); reset({ user: null }); nav('/'); }
    catch (error) { setSignOutError(errMsg(error)); }
  };

  const header = (
    <FocusHeader
      right={user ? (
        <>
          {!required && (
            <Button variant="ghost" size="sm" onClick={() => { if (!pendingRef.current || window.confirm('Some answers are not saved yet. Leave anyway?')) nav('/profile'); }} data-testid="button-exit">
              <ArrowLeft className="mr-1.5 h-4 w-4" />Profile
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={signOut} disabled={logout.isPending} data-testid="button-signout">
            {logout.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LogOut className="mr-1.5 h-4 w-4" />}Sign out
          </Button>
        </>
      ) : !isLoading ? (
        <Button asChild size="sm"><Link href={authHref('login', withNext('/assessment', next))} data-testid="link-login">Sign in</Link></Button>
      ) : null}
    />
  );

  let body;
  if (isLoading) body = <PageSkeleton />;
  else if (!user) body = (
    <EmptyPanel title="Sign in to start your learning assessment" icon={<ShieldCheck className="h-6 w-6" />}>
      <p>Your answers save to your account.</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button asChild><Link href={authHref('login', withNext('/assessment', next))} data-testid="link-login-body">Sign in</Link></Button>
        <Button asChild variant="outline"><Link href="/assessment/guide" data-testid="link-guide">Read the guide</Link></Button>
      </div>
    </EmptyPanel>
  );
  else if (q.isLoading) body = <PageSkeleton />;
  else if (!q.data) body = <ErrorPanel title="We could not load the assessment" message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  else if (running && q.data.draft && !q.data.nextRetakeAt) body = (
    <Runner key={q.data.draft.id} userId={user.id} workspace={q.data} draft={q.data.draft} required={required} next={next} pendingRef={pendingRef} onPause={() => setRunning(false)} />
  );
  else body = <Intro userId={user.id} workspace={q.data} required={required} next={next} onRun={() => setRunning(true)} />;

  return (
    <div className="min-h-[100dvh] bg-background">
      {header}
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {signOutError && <p role="alert" className="mb-4 text-sm text-destructive">{signOutError}</p>}
        {body}
      </main>
    </div>
  );
}

function Intro({ userId, workspace, required, next, onRun }: { userId: string; workspace: AssessmentWorkspace; required: boolean; next: string; onRun: () => void }) {
  const qc = useQueryClient();
  const start = useStartAssessment();
  const [err, setErr] = useState<string | null>(null);
  const total = workspace.questionCount;
  const draft = workspace.draft;
  const hasReports = workspace.reports.length > 0;
  const wait = workspace.nextRetakeAt;

  const begin = async () => {
    setErr(null);
    try {
      const d = await start.mutateAsync();
      await qc.cancelQueries({ queryKey: assessmentKey });
      if (qc.getQueryData<Session>(getGetSessionQueryKey())?.user?.id !== userId) return;
      qc.setQueryData<AssessmentWorkspace>(assessmentKey, (old) => (old ? { ...old, version: d.version, draft: d, nextRetakeAt: null } : old));
      onRun();
    } catch (e) {
      setErr(errMsg(e));
      if (assessmentError(e)?.code === 'ASSESSMENT_RETAKE_WAIT') void qc.invalidateQueries({ queryKey: assessmentKey });
    }
  };

  return (
    <div className="space-y-8">
      <div className="rise relative">
        <div className="alpona-dots pointer-events-none absolute -right-4 -top-6 h-28 w-40 opacity-60" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{required ? 'Required for new students' : 'Your study profile'}</p>
        <h1 className="font-display mt-2 text-3xl font-black leading-tight text-primary sm:text-5xl">Learning assessment</h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">Check your reasoning and study habits. Get study tips and career ideas. This is not an exam.</p>
      </div>

      <div className="ink-card rise grid gap-4 p-5 sm:grid-cols-3 sm:p-6" style={{ animationDelay: '60ms' }}>
        <Fact n={String(total)} label="short questions" />
        <Fact n={String(workspace.partCount)} label="parts" />
        <Fact n="Auto-save" label="for each answer" />
      </div>

      <ol className="rise space-y-2 text-[0.95rem]" style={{ animationDelay: '100ms' }}>
        <li className="flex gap-3"><Step n={1} />{workspace.version === 1 ? 'Finish the original version of your saved assessment.' : 'Read each question. Your answers help choose the questions that follow.'}</li>
        <li className="flex gap-3"><Step n={2} />Choose the best answer for reasoning questions. For the other questions, choose what fits you.</li>
        <li className="flex gap-3"><Step n={3} />Review your answers. Then submit.</li>
      </ol>

      {err && !wait && <ErrorPanel title="We could not start" message={err} onRetry={begin} />}

      {wait && (
        <div className="ink-card p-4 text-sm" data-testid="text-retake-wait">
          <p className="font-bold text-primary">You can retake the assessment on <time dateTime={wait}>{fmtRetakeTime(wait)}</time>.</p>
          <p className="mt-1 text-muted-foreground">Wait seven days after your last submission. Your saved reports are still available.</p>
        </div>
      )}

      <div className="rise flex flex-wrap items-center gap-3" style={{ animationDelay: '140ms' }}>
        {wait ? <Button size="lg" disabled data-testid="button-start">Retake not available yet</Button> : draft ? (
          <>
            <Button size="lg" onClick={begin} disabled={start.isPending} data-testid="button-resume">
              {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue where you stopped<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground" data-testid="text-draft-progress">{draft.answers.length} of {total} answered · saved {fmtDate(draft.updatedAt)}</span>
          </>
        ) : (
          <Button size="lg" onClick={begin} disabled={start.isPending} data-testid="button-start">
            {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasReports ? 'Start a retake' : 'Start assessment'}<ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
        <Link href="/assessment/guide" className="text-sm font-semibold text-accent underline-offset-4 hover:underline" data-testid="link-guide">How it works</Link>
      </div>

      <SharingNote />

      <section>
        <h2 className="mb-3 text-lg font-black text-primary">Your saved reports</h2>
        <ReportHistory reports={workspace.reports} hrefFor={(r) => withNext(`/profile/reports/${r.id}`, next)} emptyText="You have no saved reports yet. Your first report shows here after you submit." />
      </section>
    </div>
  );
}

function Fact({ n, label }: { n: string; label: string }) {
  return <div><div className="text-3xl font-black text-primary">{n}</div><div className="text-sm text-muted-foreground">{label}</div></div>;
}
function Step({ n }: { n: number }) {
  return <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{n}</span>;
}

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

function Runner({ userId, workspace, draft, required, next, pendingRef, onPause }: {
  userId: string;
  workspace: AssessmentWorkspace; draft: AssessmentDraft; required: boolean; next: string;
  pendingRef: MutableRefObject<boolean>; onPause: () => void;
}) {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const save = useSaveAssessmentAnswer();
  const submit = useSubmitAssessment();

  const flat = useMemo(() => draft.sections.flatMap((s, si) => s.questions.map((q, qi) => ({ q, section: s, si, qi }))), [draft.sections]);
  const total = workspace.questionCount;

  const answers = useMemo<Record<string, number>>(() => Object.fromEntries(draft.answers.map(a => [a.questionId, a.choice])), [draft.answers]);
  const [index, setIndex] = useState(() => { const i = flat.findIndex((f) => !draft.answers.some((a) => a.questionId === f.q.id)); return i === -1 ? total : i; });
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const [pendingChoice, setPendingChoice] = useState<AssessmentChoice | null>(null);
  const [replaceCount, setReplaceCount] = useState(0);
  const [mustReload, setMustReload] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const draftId = draft.id;

  const choose = async (selection: AssessmentChoice, replaceFollowUps = false) => {
    if (inFlight.current || submit.isPending) return;
    setPendingChoice(selection);
    setReplaceCount(0);
    setMustReload(false);
    inFlight.current = true; pendingRef.current = true; setStatus('saving'); setSaveErr(null);
    try {
      const d = await save.mutateAsync({ id: draftId, data: { ...selection, replaceFollowUps } });
      await qc.cancelQueries({ queryKey: assessmentKey });
      if (qc.getQueryData<Session>(getGetSessionQueryKey())?.user?.id !== userId) return;
      qc.setQueryData<AssessmentWorkspace>(assessmentKey, (old) => old?.draft?.id === draftId ? { ...old, draft: d } : old);
      if (mounted.current) {
        setPendingChoice(null);
        pendingRef.current = false;
        setStatus('saved');
      }
    } catch (e) {
      if (mounted.current) {
        const conflict = assessmentError(e);
        setStatus('error');
        setSaveErr(errMsg(e));
        if (conflict?.code === 'FOLLOW_UPS_CHANGED') setReplaceCount(conflict.affectedAnswers ?? 0);
        if (conflict?.code === 'QUESTION_CHANGED' || conflict?.code === 'ASSESSMENT_SUBMITTED' || conflict?.code === 'ASSESSMENT_RETAKE_WAIT') setMustReload(true);
      }
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    mounted.current = true;
    const h = (e: BeforeUnloadEvent) => { if (pendingRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => {
      mounted.current = false;
      pendingRef.current = false;
      window.removeEventListener('beforeunload', h);
    };
  }, [pendingRef]);

  const cancelChange = () => {
    setPendingChoice(null); setSaveErr(null); setReplaceCount(0); setStatus('saved');
    pendingRef.current = false;
  };

  const answered = draft.answers.length;
  const reviewing = index >= total && answered === total;
  const shownIndex = Math.min(index, flat.length - 1);
  const current = flat[shownIndex]!;
  const unsaved = pendingChoice !== null;

  const doSubmit = async () => {
    setSubmitErr(null);
    if (answered < total) { setSubmitErr('Some questions have no answer. Answer them first.'); return; }
    if (unsaved) { setSubmitErr('Some answers are not saved yet. Wait, or select Retry.'); return; }
    try {
      const report = await submit.mutateAsync({ id: draftId });
      if (qc.getQueryData<Session>(getGetSessionQueryKey())?.user?.id !== userId) return;
      qc.setQueryData<Session>(getGetSessionQueryKey(), (old) => (old?.user ? { ...old, user: { ...old.user, assessmentCompletedAt: report.completedAt } } : old));
      qc.setQueryData(getGetLearningReportQueryKey(report.id), report);
      pendingRef.current = false;
      void qc.invalidateQueries({ queryKey: getGetSessionQueryKey() });
      void qc.invalidateQueries({ queryKey: assessmentKey });
      void qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      if (mounted.current) nav(withNext(`/profile/reports/${report.id}`, required ? next : next === '/' ? '/profile' : next));
    } catch (e) {
      setSubmitErr(errMsg(e));
      if (assessmentError(e)?.code === 'ASSESSMENT_RETAKE_WAIT') void qc.invalidateQueries({ queryKey: assessmentKey });
    }
  };

  const pause = () => {
    if (unsaved && !window.confirm('Some answers are not saved yet. Leave this screen anyway?')) return;
    onPause();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={pause} className="text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="button-pause">
          <ArrowLeft className="mr-1 inline h-4 w-4" />Overview
        </button>
        <SaveBadge status={status} onRetry={pendingChoice && !replaceCount && !mustReload ? () => void choose(pendingChoice) : undefined} />
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-xs font-semibold text-muted-foreground">
          <span data-testid="text-progress">{answered} of {total} answered</span>
          <span>{reviewing ? 'Review' : `Question ${index + 1}`}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full origin-left rounded-full bg-accent motion-safe:transition-transform motion-safe:duration-500" style={{ transform: `scaleX(${total ? answered / total : 0})` }} />
        </div>
      </div>
      {saveErr && (
        <div className="ink-card space-y-3 p-4 text-sm">
          <p role="alert" data-testid="text-save-error">{saveErr}{replaceCount > 0 && ` Saved answers to redo: ${replaceCount}.`}</p>
          {pendingChoice && replaceCount > 0 && <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={cancelChange} data-testid="button-keep-answer">Keep saved answer</Button>
            <Button size="sm" onClick={() => void choose(pendingChoice, true)} data-testid="button-change-answer">Change answer</Button>
          </div>}
          {mustReload && <Button size="sm" onClick={() => { cancelChange(); onPause(); void qc.invalidateQueries({ queryKey: assessmentKey }); }} data-testid="button-reload-answers">Reload saved answers</Button>}
        </div>
      )}

      {!reviewing && current ? (
        <div key={current.q.id} className="page-in space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Part {current.si + 1} of {workspace.partCount} · {current.section.title}</p>
            {current.qi === 0 && <p className="mt-2 rounded-xl bg-secondary/70 p-3 text-sm">{current.section.instructions}</p>}
            <h1 className="font-display mt-4 text-2xl font-black leading-snug text-primary sm:text-3xl" data-testid="text-question">{current.q.prompt}</h1>
          </div>
          <div role="radiogroup" aria-label={current.q.prompt} className="grid gap-2.5">
            {current.q.options.map((opt, oi) => {
              const on = (pendingChoice?.questionId === current.q.id && !replaceCount && !mustReload ? pendingChoice.choice : answers[current.q.id]) === oi;
              return (
                <button key={oi} role="radio" aria-checked={on}
                  disabled={status === 'saving' || replaceCount > 0 || mustReload}
                  onClick={() => void choose({ questionId: current.q.id, choice: oi })}
                  className={`group flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-colors motion-safe:active:scale-[0.99] motion-safe:transition-[colors,transform] ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-accent/60'}`}
                  data-testid={`button-option-${oi}`}>
                  <span className={`grid h-6 w-6 flex-none place-items-center rounded-full border-2 ${on ? 'border-primary-foreground bg-primary-foreground text-primary' : 'border-input'}`}>
                    {on && <Check className="h-3.5 w-3.5 motion-safe:animate-in motion-safe:zoom-in-50" />}
                  </span>
                  <span className="font-semibold">{opt}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 pt-2">
            <Button variant="outline" onClick={() => setIndex(shownIndex - 1)} disabled={shownIndex === 0 || unsaved} data-testid="button-previous"><ArrowLeft className="mr-2 h-4 w-4" />Previous</Button>
            <Button onClick={() => setIndex(shownIndex + 1)} disabled={unsaved || answers[current.q.id] === undefined || (shownIndex + 1 >= flat.length && answered < total)} data-testid="button-next">
              {shownIndex === total - 1 ? 'Review answers' : 'Next'}<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="page-in space-y-5">
          <h1 className="font-display text-3xl font-black text-primary">Review your answers</h1>
          <p className="text-muted-foreground">Select a question to change your answer. A change may give you new follow-up questions.</p>
          {draft.sections.map((s) => (
            <section key={s.id} className="ink-card p-4">
              <h2 className="mb-2 font-black text-primary">{s.title}</h2>
              <ol className="divide-y divide-border">
                {s.questions.map((qq) => {
                  const fi = flat.findIndex((f) => f.q.id === qq.id);
                  const a = answers[qq.id];
                  return (
                    <li key={qq.id}>
                      <button onClick={() => setIndex(fi)} className="grid w-full min-w-0 gap-1.5 py-2.5 text-left text-sm hover:text-accent sm:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)] sm:gap-4" data-testid={`button-review-${qq.id}`}>
                        <span className="min-w-0 break-words">{fi + 1}. {qq.prompt}</span>
                        <span className={`min-w-0 break-words font-semibold ${a === undefined ? 'text-destructive' : 'text-[hsl(var(--ledger))]'}`}>{a === undefined ? 'No answer' : qq.options[a]}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {submitErr && <ErrorPanel title="We could not submit" message={submitErr} />}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setIndex(total - 1)} data-testid="button-back-last"><ArrowLeft className="mr-2 h-4 w-4" />Previous</Button>
            <Button size="lg" onClick={doSubmit} disabled={submit.isPending || unsaved || answered < total} data-testid="button-submit">
              {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit and see my report
            </Button>
          </div>
          <SharingNote compact />
        </div>
      )}
    </div>
  );
}

function SaveBadge({ status, onRetry }: { status: SaveStatus; onRetry?: () => void }) {
  return (
    <div aria-live="polite" className="flex items-center gap-2 text-xs font-semibold" data-testid="status-save">
      {status === 'saving' && <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving</span>}
      {status === 'saved' && <span className="flex items-center gap-1.5 text-[hsl(var(--ledger))]"><Check className="h-3.5 w-3.5" />Saved</span>}
      {status === 'idle' && <span className="text-muted-foreground">Each choice saves</span>}
      {status === 'error' && (
        <span className="flex items-center gap-2 text-destructive"><CloudOff className="h-3.5 w-3.5" />Not saved
          {onRetry && <button onClick={onRetry} className="rounded-full border border-destructive px-2 py-0.5 hover:bg-destructive hover:text-destructive-foreground" data-testid="button-retry-save"><RotateCcw className="mr-1 inline h-3 w-3" />Retry</button>}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Guide                                                               */
/* ------------------------------------------------------------------ */

export function AssessmentGuide() {
  useTitle('How the learning assessment works');
  const { user } = useAuth();
  const rows: [string, string][] = [
    ['Reasoning', 'These questions have one correct answer. We count how many are right. You see each explanation.'],
    ['Study habits', 'You rate how often you use each habit. Each study score uses three answers. We show the average on a scale of 0 to 100.'],
    ['Last-day review', 'Reviewing only at the last minute reduces the study habits score. It does not increase it.'],
    ['Interests', 'Interest groups suggest careers to explore. They do not decide what you can study or do.'],
    ['Follow-up questions', 'Your answers guide which follow-up questions you see. A score describes your answers on that path. Do not use it to compare students or attempts with different questions.'],
    ['Retakes', 'You can start another assessment seven days after you submit. Your profile shows when you can start.'],
  ];
  return (
    <div className="min-h-[100dvh] bg-background">
      <FocusHeader right={user
        ? <Button asChild size="sm"><Link href="/assessment" data-testid="link-assessment">Open assessment</Link></Button>
        : <Button asChild size="sm"><Link href={authHref('login', '/assessment')} data-testid="link-login">Sign in</Link></Button>} />
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
        <div className="rise">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Guide</p>
          <h1 className="font-display mt-2 text-3xl font-black text-primary sm:text-5xl">How the learning assessment works</h1>
          <p className="mt-4 text-lg text-muted-foreground">This assessment helps us guide your study. It does not measure IQ, diagnose health conditions, or count towards your grade.</p>
        </div>
        <div className="ink-card rise divide-y divide-border" style={{ animationDelay: '60ms' }}>
          {rows.map(([t, d]) => (
            <div key={t} className="grid gap-1 p-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <h2 className="font-black text-primary">{t}</h2>
              <p className="text-[0.95rem]">{d}</p>
            </div>
          ))}
        </div>
        <section className="rise space-y-2" style={{ animationDelay: '100ms' }}>
          <h2 className="text-lg font-black text-primary">Your answers and your privacy</h2>
          <p>Each choice saves to your account. You can stop and continue later.</p>
          <p>When you submit, we save a report. You can open old reports from your profile.</p>
          <SharingNote />
        </section>
        <section className="rise space-y-2" style={{ animationDelay: '140ms' }}>
          <h2 className="text-lg font-black text-primary">How to use your report</h2>
          <p>Read your strengths first. Pick one growth area. Try one next step this week.</p>
          <p>Talk to a teacher or counsellor about career ideas.</p>
        </section>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Own report                                                          */
/* ------------------------------------------------------------------ */

export function LearningReportPage() {
  const { id = '' } = useParams<{ id: string }>();
  const next = useNextParam();
  const { user, isLoading } = useAuth();
  useTitle('Learning report');
  const q = useGetLearningReport(id, { query: { enabled: !!user && !!id, queryKey: getGetLearningReportQueryKey(id) } });
  const cont = next === '/' ? 'Continue to Today' : 'Continue';

  if (isLoading) return <div className="mx-auto max-w-4xl p-4 sm:p-8"><PageSkeleton /></div>;
  if (!user) return (
    <div className="mx-auto max-w-xl p-4 sm:p-8">
      <EmptyPanel title="Sign in to see this report"><Button asChild className="mt-3"><Link href={authHref('login', `/profile/reports/${id}`)} data-testid="link-login">Sign in</Link></Button></EmptyPanel>
    </div>
  );
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      {q.isLoading ? <PageSkeleton /> : q.isError || !q.data ? (
        <ErrorPanel title="We could not open this report" message={errMsg(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <ReportHeading report={q.data} kicker="Your report" />
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link href="/assessment" data-testid="link-history">All reports</Link></Button>
              <Button asChild><Link href={next} data-testid="link-continue">{cont}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </div>
          </div>
          <p className="rounded-xl border-l-4 border-accent bg-card p-4 text-sm">This report shows where you are today. Use it to choose your next step. You can grow every part.</p>
          <ReportView report={q.data} />
          <SharingNote />
          <div className="flex justify-end"><Button asChild><Link href={next} data-testid="link-continue-bottom">{cont}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>
        </>
      )}
    </div>
  );
}
