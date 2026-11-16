import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Lightbulb, Loader2, RotateCcw, Send } from 'lucide-react';
import { useTeachStudy, getGetStudyBookQueryKey, type StudyModule, type StudyTeaching } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { authHref, errMsg } from '@/lib/app';
import { useHere } from '@/lib/use-here';

type Level = 'understand' | 'apply' | 'analyze';
const LEVELS: { id: Level; n: string; label: string; ask: string }[] = [
  { id: 'understand', n: '1', label: 'Explain it back', ask: 'Put the idea in your own words, as if teaching a classmate.' },
  { id: 'apply', n: '2', label: 'Applied scenario', ask: 'Use the idea on a real situation in a Bengal locality.' },
  { id: 'analyze', n: '3', label: 'Analysis exercise', ask: 'Weigh evidence, find limits, and justify a judgement.' },
];
const VERDICT: Record<string, { label: string; cls: string; note: string }> = {
  revisit: { label: 'Revisit', cls: 'bg-destructive/10 text-destructive', note: 'Your teacher suggests revising before moving on.' },
  developing: { label: 'Developing', cls: 'bg-[hsl(var(--turmeric)/.18)] text-[hsl(32_70%_32%)]', note: 'Getting there. Strengthen the reasoning at this stage.' },
  secure: { label: 'Secure', cls: 'ledger-chip', note: 'Solid reasoning. Ready for the next stage.' },
};

/** Session-only drafts, keyed by user + module + level. Cleared on user change; never written to storage. */
const drafts = new Map<string, string>();
let draftOwner: string | null = null;

export function TeachPanel({ courseId, module, lessonTitles, teaching, userId }: {
  courseId: string; module: StudyModule; lessonTitles: string[]; teaching: StudyTeaching[]; userId: string | null;
}) {
  const here = useHere();
  const qc = useQueryClient();
  const { toast } = useToast();
  const teach = useTeachStudy();
  const history = useMemo(() => teaching.filter((t) => t.moduleId === module.id), [teaching, module.id]);
  const latest = history[0];

  if (draftOwner !== userId) { drafts.clear(); draftOwner = userId; }
  const [level, setLevel] = useState<Level>(latest?.nextLevel ?? 'understand');
  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [hint, setHint] = useState(false);
  const key = `${userId}:${module.id}:${level}`;
  const [answer, setAnswerState] = useState(() => drafts.get(key) ?? '');
  const setAnswer = (v: string) => { drafts.set(key, v); setAnswerState(v); };
  const reqToken = useRef(0);

  // Reset view on module or user change; restore latest saved stage.
  const ctx = `${userId}:${module.id}`;
  const lastCtx = useRef(ctx);
  useEffect(() => {
    if (lastCtx.current === ctx) return;
    lastCtx.current = ctx;
    reqToken.current++;
    teach.reset();
    const lv = latest?.nextLevel ?? 'understand';
    setLevel(lv);
    setHint(false);
    setAnswerState(drafts.get(`${ctx}:${lv}`) ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const switchLevel = (lv: Level) => { reqToken.current++; setLevel(lv); setHint(false); setAnswerState(drafts.get(`${userId}:${module.id}:${lv}`) ?? ''); };
  const resetAll = () => { LEVELS.forEach((l) => drafts.delete(`${userId}:${module.id}:${l.id}`)); teach.reset(); setLevel('understand'); setAnswerState(''); setHint(false); };

  const len = answer.trim().length;
  const valid = len >= 15 && len <= 4000;
  const submit = () => {
    if (!valid || teach.isPending || !userId) return;
    const token = ++reqToken.current;
    const submittedKey = key;
    teach.mutate({ courseId, data: { moduleId: module.id, level, answer: answer.trim(), language: lang } }, {
      onSuccess: () => {
        drafts.delete(submittedKey);
        qc.invalidateQueries({ queryKey: getGetStudyBookQueryKey(courseId) });
        if (token === reqToken.current) setAnswerState('');
      },
      onError: (e) => { if (token === reqToken.current) toast({ title: 'Your teacher could not respond', description: `${errMsg(e)} Your answer is still here.`, variant: 'destructive' }); },
    });
  };

  const fresh = teach.data && teach.data.moduleId === module.id ? teach.data : null;
  const shown = fresh ?? latest;
  const L = LEVELS.find((l) => l.id === level)!;
  const adaptive = latest && latest.nextLevel === level && latest.nextPrompt ? latest.nextPrompt : null;

  return (
    <section className="reader-paper overflow-hidden" aria-labelledby="teach-h" data-testid="teach-panel">
      <div className="relative bg-[hsl(var(--ledger))] px-6 py-5 text-[hsl(var(--paper))]">
        <div className="alpona-dots absolute inset-0 opacity-25" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-80">Teach-back with your teacher · not a chat</p>
            <h2 id="teach-h" className="mt-1 font-display text-2xl font-semibold">Show what you understood</h2>
          </div>
          <div className="flex rounded-full bg-white/10 p-0.5 text-xs" role="group" aria-label="Feedback language">
            {(['en', 'bn'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} data-testid={`button-lang-${l}`}
                className={`rounded-full px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--turmeric))] ${lang === l ? 'bg-[hsl(var(--paper))] text-[hsl(var(--ledger))]' : ''}`}>{l === 'en' ? 'English' : 'বাংলা'}</button>
            ))}
          </div>
        </div>
      </div>

      <ol className="grid grid-cols-3 border-b" aria-label="Teaching stages">
        {LEVELS.map((l) => {
          const done = history.some((h) => h.level === l.id && h.verdict === 'secure');
          const cur = level === l.id;
          return (
            <li key={l.id}>
              <button type="button" onClick={() => switchLevel(l.id)} aria-current={cur ? 'step' : undefined} data-testid={`button-level-${l.id}`}
                className={`relative w-full px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${cur ? 'bg-card' : 'bg-muted/40 hover:bg-muted/70'}`}>
                <span className={`font-mono text-[10px] ${done ? 'text-[hsl(var(--ledger))]' : 'text-muted-foreground'}`}>Stage {l.n}{done ? ' · secure' : ''}</span>
                <span className={`block text-sm font-semibold ${cur ? 'text-primary' : 'text-muted-foreground'}`}>{l.label}</span>
                {cur && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="space-y-5 p-6">
        {latest && (
          <p className="rounded-xl border border-dashed px-4 py-2.5 text-xs text-muted-foreground" data-testid="text-adaptation">
            Last time at <b className="text-primary">{LEVELS.find((x) => x.id === latest.level)?.label}</b> you were <b className="text-primary">{VERDICT[latest.verdict]?.label.toLowerCase()}</b>
            {' '}— so your teacher {latest.nextLevel === latest.level ? latest.verdict === 'secure' ? 'offered a deeper challenge at this stage' : 'kept you at this stage to revise' : `recommended ${LEVELS.find((x) => x.id === latest.nextLevel)?.label} next`}.
          </p>
        )}
        <div>
          <p className="text-xs text-muted-foreground">{L.ask}</p>
          <p className="mt-2 font-display text-xl leading-snug text-primary" data-testid="text-question">{module.questions[level]}</p>
          {adaptive && <p className="mt-2 border-l-2 border-accent pl-3 text-sm italic text-foreground/80" data-testid="text-next-prompt">Your teacher adds: {adaptive}</p>}
        </div>

        <div>
          <button type="button" onClick={() => setHint(!hint)} aria-expanded={hint} data-testid="button-hint"
            className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-[hsl(var(--ledger))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Lightbulb className="h-4 w-4" /> {hint ? 'Hide hint' : 'Need a nudge first?'}
          </button>
          {hint && (
            <div className="mt-2 rounded-xl ledger-chip px-4 py-3 text-sm" data-testid="text-hint">
              {level === 'understand' && <>Re-read the objectives above, especially: <i>{module.objectives[0]}</i>. Use one key term in your own words, not the book's.</>}
              {level === 'apply' && <>Look back at the worked example in <i>{lessonTitles[0]}</i>. Name your place, your people, and the exact step you would take first.</>}
              {level === 'analyze' && <>Revisit the step-through and the activity in <i>{lessonTitles[lessonTitles.length - 1]}</i>. What could go wrong, and what evidence would change your mind?</>}
            </div>
          )}
        </div>

        {userId ? (
          <div>
            <label htmlFor="teach-answer" className="sr-only">Your answer</label>
            <Textarea id="teach-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} maxLength={4000} disabled={teach.isPending}
              placeholder={lang === 'bn' ? 'নিজের ভাষায় লিখুন…' : 'Write your reasoning here…'} className="resize-y bg-card font-serif text-base leading-relaxed" data-testid="input-teach-answer" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <span className={`font-mono text-[11px] ${len && !valid ? 'text-destructive' : 'text-muted-foreground'}`}>{len}/4000 · at least 15 characters · nothing is sent until you submit</span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={resetAll} disabled={teach.isPending} data-testid="button-teach-reset"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Start over</Button>
                <Button type="button" onClick={submit} disabled={!valid || teach.isPending} className="bg-accent hover:bg-accent/90" data-testid="button-teach-submit">
                  {teach.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Reading your answer</> : <><Send className="mr-2 h-4 w-4" />Submit to teacher</>}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-muted/60 p-4 text-sm">
            Reading is open to all. To get feedback on your reasoning, <Link href={authHref('login', here)} className="font-semibold text-accent hover:underline" data-testid="link-teach-login">sign in</Link> or <Link href={authHref('register', here)} className="font-semibold text-accent hover:underline" data-testid="link-teach-register">create a free account</Link>.
          </div>
        )}

        {shown && (
          <article className="page-in rounded-2xl border bg-card p-5" aria-live="polite" data-testid="teach-feedback">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT[shown.verdict]?.cls}`} data-testid="status-verdict">{VERDICT[shown.verdict]?.label}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{LEVELS.find((x) => x.id === shown.level)?.label} · {new Date(shown.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed" data-testid="text-feedback">{shown.feedback}</p>
            {shown.revisit && <p className="mt-3 text-sm"><span className="font-semibold text-primary">Revisit: </span>{shown.revisit}</p>}
            <p className="mt-2 text-xs text-muted-foreground">{VERDICT[shown.verdict]?.note}</p>
            {shown.nextLevel !== level && (
              <Button type="button" size="sm" variant="outline" className="mt-4" onClick={() => switchLevel(shown.nextLevel)} data-testid="button-go-next-level">
                Go to {LEVELS.find((x) => x.id === shown.nextLevel)?.label} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
          </article>
        )}

        {history.length > 1 && (
          <details className="group text-sm" data-testid="teach-history">
            <summary className="cursor-pointer font-medium text-primary">Earlier feedback ({history.length - 1})</summary>
            <ul className="mt-3 space-y-3">
              {history.slice(1).map((h) => (
                <li key={h.id} className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT[h.verdict]?.cls}`}>{VERDICT[h.verdict]?.label}</span><span className="font-mono text-[10px] text-muted-foreground">{LEVELS.find((x) => x.id === h.level)?.label} · {new Date(h.createdAt).toLocaleDateString('en-IN')}</span></div>
                  <p className="mt-2 line-clamp-2 italic text-muted-foreground">"{h.answer}"</p>
                  <p className="mt-1 text-foreground/80">{h.feedback}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

