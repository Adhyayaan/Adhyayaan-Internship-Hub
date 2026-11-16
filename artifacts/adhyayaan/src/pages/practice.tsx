import { useEffect, useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Brain, Check, Layers, Loader2, RotateCcw, Sparkles, Workflow, X } from 'lucide-react';
import {
  useListEnrollments,
  useListPractice,
  useStartPractice,
  useSubmitPractice,
  getListPracticeQueryKey,
  getListEnrollmentsQueryKey,
  type PracticeAttempt,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Coach, CoachToggle } from '@/components/app/coach';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Empty, ErrorPanel, Meter, PageHeader, SignInWall } from '@/components/app/bits';
import { errMsg, useAuth, useInvalidateAll, useTitle } from '@/lib/app';

const LEVEL: Record<string, { l: string; bn: string; icon: typeof Brain; cls: string }> = {
  understand: { l: 'Understand', bn: 'বোঝা', icon: Brain, cls: 'bg-primary/10 text-primary' },
  apply: { l: 'Apply', bn: 'প্রয়োগ', icon: Workflow, cls: 'bg-accent/10 text-accent' },
  analyze: { l: 'Analyse', bn: 'বিশ্লেষণ', icon: Layers, cls: 'bg-[hsl(168_40%_36%/.12)] text-[hsl(168_40%_30%)]' },
};
const DIFF = ['', 'Foundation', 'Intermediate', 'Advanced'];

function LevelTag({ level }: { level: string }) {
  const L = LEVEL[level] ?? { l: level, bn: '', icon: Brain, cls: 'bg-secondary' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${L.cls}`}>
      <L.icon className="h-3.5 w-3.5 shrink-0" /> {L.l} {L.bn && <span className="opacity-70">· {L.bn}</span>}
    </span>
  );
}

function DiffDots({ n }: { n: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap" aria-label={`Difficulty ${n} of 3`}>
      {[1, 2, 3].map((i) => <span key={i} className={`h-2 w-2 rounded-full ${i <= n ? 'bg-accent' : 'bg-border'}`} />)}
      <span className="ml-1.5 text-xs text-muted-foreground">{DIFF[n] ?? n}</span>
    </span>
  );
}

function Runner({ a, title, onDone }: { a: PracticeAttempt; title: string; onDone: () => void }) {
  const submit = useSubmitPractice();
  const qc = useQueryClient();
  const inval = useInvalidateAll();
  const { toast } = useToast();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const q = a.questions[step];
  const answered = a.questions.filter((x) => answers[x.id] !== undefined).length;
  const all = answered === a.questions.length;

  const send = async () => {
    if (!all) return setErr('Answer all questions before submitting.');
    setErr(null);
    try {
      const res = await submit.mutateAsync({ id: a.id, data: { answers: a.questions.map((x) => ({ questionId: x.id, selectedIndex: answers[x.id] })) } });
      qc.setQueryData<PracticeAttempt[]>(getListPracticeQueryKey(), (old) => (old ? old.map((o) => (o.id === res.id ? res : o)) : old));
      await qc.invalidateQueries({ queryKey: getListPracticeQueryKey() });
      await inval();
      toast({ title: `Scored ${res.score ?? 0} / ${res.questions.length}` });
    } catch (e) {
      setErr(errMsg(e));
    }
  };

  return (
    <section className="ink-card rise min-w-0 overflow-hidden" data-testid={`runner-${a.id}`}>
      <div className="flex flex-col gap-3 border-b bg-secondary/40 px-4 py-4 sm:px-6 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">In progress · {a.language === 'bn' ? 'বাংলা' : 'English'}</p>
          <h2 className="break-words font-display text-xl font-semibold text-primary">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-start"><DiffDots n={a.difficulty} /><Button variant="ghost" size="sm" onClick={onDone} data-testid="button-close-runner">Close set</Button></div>
      </div>
      <p className="px-4 pt-4 text-xs text-muted-foreground sm:px-6">The question set is saved. Your answer selections are saved only when you submit all five answers.</p>
      <div className="flex gap-1.5 px-4 pt-5 sm:px-6">
        {a.questions.map((x, i) => (
          <button key={x.id} onClick={() => setStep(i)} aria-label={`Question ${i + 1}`} data-testid={`button-step-${i}`}
            className={`h-1.5 flex-1 rounded-full transition-all ${i === step ? 'bg-primary' : answers[x.id] !== undefined ? 'bg-accent' : 'bg-border'}`} />
        ))}
      </div>
      <div key={q.id} className="rise min-w-0 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">Q{step + 1} of {a.questions.length}</span>
          <LevelTag level={q.cognitiveLevel} />
          <span className="min-w-0 break-words text-xs text-muted-foreground">Concept: {q.concept}</span>
        </div>
        <p className="mt-4 break-words font-display text-xl leading-snug text-primary sm:text-2xl" data-testid="text-question">{q.question}</p>
        <div className="mt-6 grid min-w-0 grid-cols-1 gap-2.5" role="radiogroup">
          {q.options.map((o, i) => {
            const sel = answers[q.id] === i;
            return (
              <button key={i} role="radio" aria-checked={sel} onClick={() => setAnswers({ ...answers, [q.id]: i })} data-testid={`button-option-${i}`}
                className={`flex min-w-0 items-start gap-3 rounded-2xl border-2 p-3 text-left transition-all duration-200 sm:p-4 ${sel ? 'border-primary bg-primary/5 -translate-y-0.5' : 'border-border hover:border-primary/40'}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs transition-colors ${sel ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>{String.fromCharCode(65 + i)}</span>
                <span className="min-w-0 flex-1 break-words pt-0.5 [overflow-wrap:anywhere]">{o}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 items-center gap-3 border-t px-4 py-4 sm:flex sm:flex-wrap sm:justify-between sm:px-6">
        <Button variant="outline" className="row-start-2 min-h-11 sm:min-h-9" onClick={() => setStep(step - 1)} disabled={step === 0} data-testid="button-prev"><ArrowLeft className="mr-1 h-4 w-4" />Back</Button>
        <span className="col-span-2 row-start-1 text-center font-mono text-xs text-muted-foreground">{answered}/{a.questions.length} answered</span>
        {step < a.questions.length - 1 ? (
          <Button className="row-start-2 min-h-11 sm:min-h-9" onClick={() => setStep(step + 1)} data-testid="button-next">Next<ArrowRight className="ml-1 h-4 w-4" /></Button>
        ) : (
          <Button onClick={send} disabled={!all || submit.isPending} className="row-start-2 h-auto min-h-11 min-w-0 whitespace-normal bg-accent px-3 py-2 text-xs hover:bg-accent/90 sm:min-h-9 sm:text-sm" data-testid="button-submit-practice">
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Submit for scoring
          </Button>
        )}
      </div>
      {err && <p className="mx-4 mb-4 break-words rounded-lg bg-destructive/10 p-3 text-sm text-destructive sm:mx-6" data-testid="text-practice-error">{err}</p>}
    </section>
  );
}

function Result({ a, title, onClose }: { a: PracticeAttempt; title: string; onClose: () => void }) {
  const fb = useMemo(() => Object.fromEntries(a.feedback.map((f) => [f.questionId, f])), [a.feedback]);
  const total = a.questions.length;
  const score = a.score ?? 0;
  const dir = a.nextDifficulty > a.difficulty ? 'up' : a.nextDifficulty < a.difficulty ? 'down' : 'same';
  const [coach, setCoach] = useState(false);
  const submitted = a.score !== null;
  const resultContext = () => [
    `Practice set result for: ${title}. Score ${score}/${total}. Difficulty ${DIFF[a.difficulty] ?? a.difficulty}; next ${DIFF[a.nextDifficulty] ?? a.nextDifficulty}.`,
    `Adaptation: ${a.adaptationReason}`,
    ...a.questions.map((q, i) => {
      const f = fb[q.id];
      return [
        `Q${i + 1} [${q.cognitiveLevel}; concept: ${q.concept}] ${q.question}`,
        `Options: ${q.options.map((o, oi) => `${String.fromCharCode(65 + oi)}) ${o}`).join(' | ')}`,
        f ? `My answer: ${String.fromCharCode(65 + f.selectedIndex)}. Key: ${String.fromCharCode(65 + f.correctIndex)}. ${f.correct ? 'Correct' : 'Incorrect'}. Shown explanation: ${f.explanation}` : 'No feedback recorded.',
      ].join('\n');
    }),
  ].join('\n\n');
  return (
    <section className="rise min-w-0 space-y-4" data-testid={`result-${a.id}`}>
      <div className="relative overflow-hidden rounded-[2rem] bg-primary p-5 text-primary-foreground sm:p-7 md:p-9">
        <div className="alpona-dots absolute inset-0 opacity-20" />
        <div className="relative grid min-w-0 items-end gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="break-words font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/60">Result · {title}</p>
            <p className="mt-2 font-display text-7xl font-semibold leading-none" data-testid="text-score">{score}<span className="text-3xl text-primary-foreground/50"> / {total}</span></p>
          </div>
          <div className="min-w-0 rounded-2xl bg-primary-foreground/10 p-4 [overflow-wrap:anywhere]">
            <p className="text-xs uppercase tracking-[0.16em] text-primary-foreground/60">Next set</p>
            <p className="mt-1 font-display text-xl">
              {DIFF[a.nextDifficulty]} <span className="text-sm text-[hsl(40_88%_62%)]">{dir === 'up' ? 'stepping up' : dir === 'down' ? 'easing back' : 'holding steady'}</span>
            </p>
            <p className="mt-1 text-sm text-primary-foreground/75" data-testid="text-adaptation">{a.adaptationReason}</p>
          </div>
        </div>
      </div>
      <p className="rounded-xl border border-dashed border-accent/60 bg-accent/5 p-3 text-sm">Formative practice only, not official grading. Answer keys are AI-generated and can be mistaken; check anything doubtful with your mentor.</p>
      {a.questions.map((q, i) => {
        const f = fb[q.id];
        return (
          <div key={q.id} className="ink-card min-w-0 break-words p-4 sm:p-5" data-testid={`feedback-${q.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${f?.correct ? 'bg-[hsl(168_40%_36%)] text-primary-foreground' : 'bg-destructive text-destructive-foreground'}`}>{f?.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}</span>
              <span className="font-mono text-xs text-muted-foreground">Q{i + 1}</span>
              <LevelTag level={q.cognitiveLevel} />
              <span className="min-w-0 text-xs text-muted-foreground">{q.concept}</span>
            </div>
            <p className="mt-3 font-medium">{q.question}</p>
            <ul className="mt-3 grid min-w-0 grid-cols-1 gap-1.5 text-sm">
              {q.options.map((o, oi) => {
                const isCorrect = f?.correctIndex === oi;
                const isMine = f?.selectedIndex === oi;
                return (
                  <li key={oi} className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 rounded-lg px-3 py-2 ${isCorrect ? 'bg-[hsl(168_40%_36%/.12)]' : isMine ? 'bg-destructive/10' : ''}`}>
                    <span className="font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + oi)}</span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">{o}</span>
                    {(isMine || isCorrect) && <span className="col-start-2 flex flex-wrap gap-x-2 gap-y-1">
                      {isMine && <span className="text-xs text-muted-foreground">your answer</span>}
                      {isCorrect && <span className="text-xs font-medium text-[hsl(168_40%_30%)]">key</span>}
                    </span>}
                  </li>
                );
              })}
            </ul>
            {f?.explanation && <p className="mt-3 border-l-2 border-accent/60 pl-3 text-sm text-muted-foreground">{f.explanation}</p>}
          </div>
        );
      })}
      {submitted && (
        <div className="space-y-3">
          <CoachToggle open={coach} onClick={() => setCoach((o) => !o)} label="Work through my mistakes" testId="button-coach-practice" />
          {coach && (
            <Coach
              contextKey={`practice:${a.id}`}
              contextLabel={`Practice result · ${title} · ${score}/${total}`}
              courseId={a.courseId}
              moves={[
                { id: 'misconceptions', level: 'Understand', label: 'Explain my misconceptions', request: 'Looking only at the questions I got wrong, explain the likely misconception behind each chosen answer and the reasoning that leads to the key. If I got everything right, explain what distinguishes the strongest distractor.' },
                { id: 'transfer', level: 'Apply', label: 'Give me a transfer problem', request: 'Write one new practice question on my weakest concept from this set, set in a different practical context. Do not reveal the answer; wait for my attempt.' },
                { id: 'why', level: 'Analyse', label: 'Why did the set adapt this way?', request: 'Explain, from my result and the adaptation reason, what my next set will likely emphasise and how I should prepare in 20 minutes.' },
              ]}
              getContext={resultContext}
              intro="Uses only this submitted set and the feedback you can already see."
              onClose={() => setCoach(false)}
              testId="coach-practice"
            />
          )}
        </div>
      )}
      <Button variant="outline" onClick={onClose} data-testid="button-close-result">Back to practice</Button>
    </section>
  );
}

export default function Practice() {
  useTitle('Adaptive practice');
  const { user, isLoading } = useAuth();
  const search = useSearch();
  const enrollments = useListEnrollments({ query: { enabled: !!user, queryKey: getListEnrollmentsQueryKey() } });
  const hist = useListPractice({ query: { enabled: !!user, queryKey: getListPracticeQueryKey() } });
  const start = useStartPractice();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [courseId, setCourseId] = useState('');
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [openId, setOpenId] = useState<string | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);

  const enrolledCourses = enrollments.data ?? [];
  const enrolledIds = useMemo(() => new Set(enrolledCourses.map((e) => e.course.id)), [enrolledCourses]);
  const titles = useMemo(() => Object.fromEntries(enrolledCourses.map((e) => [e.course.id, e.course.title])), [enrolledCourses]);
  const enrolledAttempts = useMemo(() => (hist.data ?? []).filter((a) => enrolledIds.has(a.courseId)), [hist.data, enrolledIds]);

  useEffect(() => {
    const c = new URLSearchParams(search).get('course');
    if (enrollments.isLoading || enrollments.error) return;
    setCourseId((current) => {
      if (c && enrolledIds.has(c)) return c;
      if (current && enrolledIds.has(current)) return current;
      return enrolledCourses[0]?.course.id ?? '';
    });
  }, [search, enrollments.isLoading, enrollments.error, enrolledIds, enrolledCourses]);

  const attempts = useMemo(() => [...enrolledAttempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [enrolledAttempts]);
  const scoped = attempts.filter((a) => courseId && a.courseId === courseId);
  const finished = scoped.filter((a) => a.score !== null);
  const avg = finished.length ? finished.reduce((s, a) => s + (a.score ?? 0) / a.questions.length, 0) / finished.length : null;
  const latest = finished[0];
  const levelStats = useMemo(() => {
    const m: Record<string, { c: number; t: number }> = {};
    finished.forEach((a) => a.feedback.forEach((f) => { const k = f.cognitiveLevel; m[k] ??= { c: 0, t: 0 }; m[k].t++; if (f.correct) m[k].c++; }));
    return m;
  }, [finished]);
  const open = attempts.find((a) => a.id === openId);

  const begin = async () => {
    if (!courseId || !enrolledIds.has(courseId)) return setStartErr('Choose one of your enrolled internships first.');
    setStartErr(null);
    try {
      const a = await start.mutateAsync({ data: { courseId, language: lang } });
      qc.setQueryData<PracticeAttempt[]>(getListPracticeQueryKey(), (old) => [a, ...(old ?? []).filter((o) => o.id !== a.id)]);
      setOpenId(a.id);
    } catch (e) {
      setStartErr(errMsg(e));
      toast({ title: 'Could not create a question set', description: errMsg(e), variant: 'destructive' });
    }
  };

  return (
    <div>
      <PageHeader kicker="Cognitive & adaptive learning" title={<>Practice that <em className="text-accent">meets you where you are</em></>}
        sub="Five questions per set, climbing from understanding to application to analysis. Each set adapts its difficulty and focus from your last score on that internship." />

      {isLoading ? <Skeleton className="h-80 rounded-3xl bg-secondary" /> : !user ? <SignInWall what="practise adaptively" /> : enrollments.isLoading ? <Skeleton className="h-80 rounded-3xl bg-secondary" /> : enrollments.error ? <ErrorPanel error={enrollments.error} onRetry={() => enrollments.refetch()} /> : enrolledCourses.length === 0 ? (
        <Empty title="Choose an internship to begin" body="Adaptive practice is available for internships you have enrolled in. Browse the internships, then start a 60- or 120-hour learning pathway to unlock course-specific questions."
          action={<Button asChild variant="outline" data-testid="link-practice-explore"><Link href="/explore">Browse internships</Link></Button>} />
      ) : open ? (
        open.score === null
          ? <Runner key={open.id} a={open} title={titles[open.courseId] ?? 'Practice set'} onDone={() => setOpenId(null)} />
          : <Result key={open.id} a={open} title={titles[open.courseId] ?? 'Practice set'} onClose={() => setOpenId(null)} />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:gap-8">
          <div className="min-w-0 space-y-4 self-start xl:sticky xl:top-8">
            <div className="ink-card min-w-0 space-y-4 p-4 sm:p-6">
              <h2 className="font-display text-xl font-semibold text-primary">New question set</h2>
              <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger aria-label="Enrolled internship" className="h-auto min-h-11 min-w-0 gap-2 whitespace-normal py-2.5 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:line-clamp-none [&>span]:break-words [&>span]:text-left [&>svg]:shrink-0" data-testid="select-practice-course"><SelectValue placeholder="Choose an enrolled internship" /></SelectTrigger>
              <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">{enrolledCourses.map((e) => <SelectItem className="whitespace-normal break-words" key={e.course.id} value={e.course.id}>{e.course.title} · {e.hours}-hour pathway</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Only your enrolled internships appear here.</p>
              <div className="flex rounded-full bg-secondary p-1 text-sm" role="radiogroup" aria-label="Question language">
                {(['en', 'bn'] as const).map((l) => (
                  <button key={l} role="radio" aria-checked={lang === l} onClick={() => setLang(l)} data-testid={`button-practice-lang-${l}`}
                    className={`flex-1 rounded-full py-1.5 transition-colors ${lang === l ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{l === 'bn' ? 'বাংলা' : 'English'}</button>
                ))}
              </div>
              <Button onClick={begin} disabled={start.isPending || !courseId} className="h-auto min-h-11 w-full min-w-0 whitespace-normal bg-accent px-3 py-2.5 hover:bg-accent/90" data-testid="button-start-practice">
                {start.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {start.isPending ? 'Writing your questions…' : 'Generate adaptive set'}
              </Button>
              {start.isPending && <p className="text-xs text-muted-foreground" data-testid="status-generating">The AI is building questions around your level and weak concepts. This can take a little while.</p>}
              {startErr && !start.isPending && <p className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">{startErr}</p>}
              <p className="text-xs text-muted-foreground">Formative only. AI answer keys can be wrong; verify with your mentor.</p>
            </div>

            <div className="ink-card min-w-0 p-4 sm:p-6" data-testid="panel-metrics">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">This internship</p>
              {finished.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No scored sets yet. Your first set starts at Foundation level.</p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div><p className="font-display text-3xl font-semibold text-primary">{finished.length}</p><p className="text-xs text-muted-foreground">scored sets</p></div>
                    <div><p className="font-display text-3xl font-semibold text-primary">{Math.round((avg ?? 0) * 100)}%</p><p className="text-xs text-muted-foreground">average</p></div>
                  </div>
                  {courseId && latest && <div className="mt-3 text-sm">Next set: <DiffDots n={latest.nextDifficulty} /></div>}
                  <div className="mt-4 space-y-2.5">
                    {(['understand', 'apply', 'analyze'] as const).filter((k) => levelStats[k]).map((k) => (
                      <div key={k}><div className="mb-1 flex justify-between text-xs"><span>{LEVEL[k].l}</span><span className="font-mono">{levelStats[k].c}/{levelStats[k].t}</span></div><Meter value={(levelStats[k].c / levelStats[k].t) * 100} tone={k === 'apply' ? 'accent' : 'primary'} /></div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <section className="min-w-0">
            <h2 className="mb-4 font-display text-2xl font-semibold text-primary">History</h2>
            {hist.isLoading ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl bg-secondary" />)}</div>
              : hist.error ? <ErrorPanel error={hist.error} onRetry={() => hist.refetch()} />
              : scoped.length === 0 ? <Empty title="No sets yet" body="Pick an internship and generate your first five questions. Results are saved here so you can revisit the explanations." action={<Button asChild variant="outline" data-testid="link-practice-explore"><Link href="/explore">Browse internships</Link></Button>} />
              : (
                <ol className="space-y-3">
                  {scoped.map((a, i) => (
                    <li key={a.id}>
                      <button onClick={() => setOpenId(a.id)} className="ink-card lift rise grid w-full min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 p-4 text-left sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:gap-4 sm:p-5" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} data-testid={`button-attempt-${a.id}`}>
                        <span className={`row-span-2 flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl sm:row-span-1 sm:h-14 sm:w-14 ${a.score === null ? 'bg-secondary text-muted-foreground' : 'bg-primary text-primary-foreground'}`}>
                          {a.score === null ? <RotateCcw className="h-5 w-5" /> : <><span className="font-display text-xl font-semibold leading-none">{a.score}</span><span className="text-[10px] opacity-70">/ {a.questions.length}</span></>}
                        </span>
                        <span className="min-w-0">
                          <span className="block break-words font-medium">{titles[a.courseId] ?? 'Internship'}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <DiffDots n={a.difficulty} />
                            <span>{a.language === 'bn' ? 'বাংলা' : 'English'}</span>
                            <span>{new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          </span>
                        </span>
                        <span className="col-start-2 text-sm font-medium text-accent sm:col-auto">{a.score === null ? 'Resume' : 'Review'}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
          </section>
        </div>
      )}
    </div>
  );
}
