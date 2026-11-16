import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Loader2, Lock, RotateCw, X } from 'lucide-react';
import { useAskAi, getListAiMessagesQueryKey, type AiInputTool } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Md } from '@/components/app/bits';
import { authHref, errMsg, useAuth } from '@/lib/app';
import { useHere } from '@/lib/use-here';

export type CoachMove = { id: string; label: string; level?: string; request: string; tool?: AiInputTool };

type Turn = { q: string; a: string };

const MAX = 11800;

function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}\n[...trimmed for length]` : s;
}

/** Small mark used across the app so AI looks like part of the same visual family. */
export function CoachMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="1.6 2.4" />
      <circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function CoachToggle({ open, onClick, label = 'Think it through', testId, size = 'md' }: { open: boolean; onClick: () => void; label?: string; testId: string; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      data-testid={testId}
      className={`group inline-flex max-w-full shrink-0 items-center justify-center gap-1.5 rounded-full border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        open ? 'border-primary bg-primary text-primary-foreground' : 'border-accent/40 bg-accent/5 text-accent hover:border-accent hover:bg-accent/10'
      } ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm font-medium'}`}
    >
      <CoachMark className={`${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} shrink-0 transition-transform group-hover:rotate-45`} />
      {open ? 'Hide coach' : label}
    </button>
  );
}

/**
 * Inline contextual coach. Sends only on explicit student action.
 * `getContext` is read at request time so it reflects current, unsaved input.
 * Any change in `contextKey` (or signed-in user) discards visible answers and drops in-flight results.
 */
export function Coach({
  contextKey,
  contextLabel,
  courseId,
  tool = 'tutor',
  moves,
  getContext,
  intro,
  onClose,
  testId = 'coach',
}: {
  contextKey: string;
  contextLabel: string;
  courseId?: string;
  tool?: AiInputTool;
  moves: CoachMove[];
  getContext: () => string;
  intro?: string;
  onClose?: () => void;
  testId?: string;
}) {
  const { user, isLoading } = useAuth();
  const here = useHere();
  const qc = useQueryClient();
  const ask = useAskAi();
  const askRef = useRef(ask.mutateAsync);
  askRef.current = ask.mutateAsync;
  const ctxRef = useRef(getContext);
  ctxRef.current = getContext;

  const [lang, setLang] = useState<'en' | 'bn'>('en');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState<{ msg: string; retry: { q: string; req: string; tool: AiInputTool } } | null>(null);
  const [follow, setFollow] = useState('');
  const seq = useRef(0);
  const uid = user?.id ?? null;

  useEffect(() => {
    seq.current++;
    setTurns([]);
    setPending(null);
    setErr(null);
    setFollow('');
  }, [contextKey, uid]);

  useEffect(() => () => { seq.current++; }, []);

  const run = async (q: string, req: string, t: AiInputTool) => {
    if (!uid || pending) return;
    const id = ++seq.current;
    const ctx = ctxRef.current().trim();
    const last = turns[turns.length - 1];
    const parts = [
      'You are a formative learning coach inside Adhyayaan, a practical internship companion for final-year students in West Bengal.',
      'Use cognitive and adaptive principles: check understanding, connect to application, invite reasoning. Ask the student to think before revealing everything. Be concise and concrete.',
      'Do not award grades, do not claim progress was marked, do not write log entries or reflections on the student\'s behalf, and do not claim to have opened any link.',
      `Respond in ${lang === 'bn' ? 'Bangla (Bengali script), keeping technical terms in English where natural' : 'English'}.`,
      '',
      `--- Context (${contextLabel}) ---`,
      clip(ctx || '(no additional context)', 7000),
    ];
    if (last) parts.push('', '--- Your previous answer in this conversation ---', clip(last.a, 2500));
    parts.push('', '--- Student request ---', req);
    const message = clip(parts.join('\n'), MAX);
    setErr(null);
    setPending(q);
    try {
      const r = await askRef.current({ data: { tool: t, message, language: lang, ...(courseId ? { courseId } : {}) } });
      if (id !== seq.current) return;
      setTurns((p) => [...p, { q, a: r.content }]);
      qc.invalidateQueries({ queryKey: getListAiMessagesQueryKey() });
    } catch (e) {
      if (id !== seq.current) return;
      setErr({ msg: errMsg(e), retry: { q, req, tool: t } });
    } finally {
      if (id === seq.current) setPending(null);
    }
  };

  const sendFollow = (ev: FormEvent) => {
    ev.preventDefault();
    const m = follow.trim();
    if (!m || pending) return;
    setFollow('');
    run(m, `Follow-up question: ${clip(m, 2000)}`, tool);
  };

  return (
    <div className="rise relative overflow-hidden rounded-2xl border border-primary/15 bg-[hsl(232_45%_97%)]" data-testid={testId} role="region" aria-label={`Learning coach: ${contextLabel}`}>
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-accent via-[hsl(40_88%_52%)] to-primary" />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 px-4 py-3 pl-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[hsl(40_88%_62%)]"><CoachMark /></span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Coach · formative</p>
            <p className="truncate text-sm font-medium text-primary" data-testid={`${testId}-context`}>{contextLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div role="radiogroup" aria-label="Answer language" className="flex rounded-full bg-card p-0.5 ring-1 ring-border">
            {(['en', 'bn'] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={lang === l} onClick={() => setLang(l)} disabled={!!pending} data-testid={`${testId}-lang-${l}`}
                className={`rounded-full px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-primary'}`}>
                {l === 'en' ? 'English' : 'বাংলা'}
              </button>
            ))}
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close coach" data-testid={`${testId}-close`} className="rounded-full p-1.5 text-muted-foreground hover:bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4 pl-5">
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-secondary" />
        ) : !uid ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-border" data-testid={`${testId}-signin`}>
            <Lock className="h-4 w-4 text-accent" />
            <p className="flex-1 text-sm text-muted-foreground">Sign in to ask the coach about this. You will come straight back here.</p>
            <Button asChild size="sm" data-testid={`${testId}-signin-link`}><Link href={authHref('login', here)}>Sign in</Link></Button>
            <Button asChild size="sm" variant="outline" data-testid={`${testId}-register-link`}><Link href={authHref('register', here)}>Create account</Link></Button>
          </div>
        ) : (
          <>
            {intro && turns.length === 0 && !pending && <p className="text-sm text-muted-foreground">{intro}</p>}
            <div className="flex flex-wrap gap-2">
              {moves.map((m) => (
                <button key={m.id} type="button" disabled={!!pending} onClick={() => run(m.label, m.request, m.tool ?? tool)} data-testid={`${testId}-move-${m.id}`}
                  className="group inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm transition-all hover:-translate-y-0.5 hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                  {m.level && <span className="rounded-md bg-primary/8 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary/70">{m.level}</span>}
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            {turns.map((t, i) => (
              <div key={i} className="space-y-2" data-testid={`${testId}-turn-${i}`}>
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-1.5 text-sm text-primary-foreground">{t.q}</p>
                <div className="rounded-2xl rounded-tl-sm bg-card p-4 ring-1 ring-border"><Md text={t.a} /></div>
              </div>
            ))}

            {pending && (
              <div className="space-y-2" aria-live="polite" data-testid={`${testId}-pending`}>
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary/80 px-3 py-1.5 text-sm text-primary-foreground">{pending}</p>
                <div className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking about {contextLabel}</div>
                  <div className="h-2.5 w-11/12 animate-pulse rounded bg-secondary" />
                  <div className="h-2.5 w-3/4 animate-pulse rounded bg-secondary" />
                  <div className="h-2.5 w-5/6 animate-pulse rounded bg-secondary" />
                </div>
              </div>
            )}

            {err && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" role="alert" data-testid={`${testId}-error`}>
                <span className="flex-1">The coach could not answer: {err.msg}</span>
                <Button size="sm" variant="outline" onClick={() => run(err.retry.q, err.retry.req, err.retry.tool)} data-testid={`${testId}-retry`}><RotateCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button>
              </div>
            )}

            <form onSubmit={sendFollow} className="flex items-end gap-2">
              <label htmlFor={`${testId}-q`} className="sr-only">Ask your own question</label>
              <Textarea id={`${testId}-q`} value={follow} onChange={(e) => setFollow(e.target.value)} rows={1} maxLength={2000}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollow(e as unknown as FormEvent); } }}
                placeholder={turns.length ? 'Ask a follow-up in Bangla or English' : 'Or ask your own question about this'}
                className="min-h-[42px] resize-none bg-card" data-testid={`${testId}-input`} />
              <Button type="submit" size="icon" disabled={!follow.trim() || !!pending} className="h-[42px] w-[42px] shrink-0 bg-accent hover:bg-accent/90" aria-label="Send question" data-testid={`${testId}-send`}>
                <ArrowUp className="h-4 w-4" />
              </Button>
            </form>
            <p className="text-[11px] text-muted-foreground">Formative help only. Nothing here marks progress, saves logs or changes your drafts. Conversations also appear in AI studio.</p>
          </>
        )}
      </div>
    </div>
  );
}

export const MODULE_MOVES: CoachMove[] = [
  { id: 'understand', level: 'Understand', label: 'Explain the core idea', request: 'Explain the core idea of this module in plain language with one everyday analogy, then ask me one short check-question to confirm I understood. Do not give the answer to your check-question yet.' },
  { id: 'apply', level: 'Apply', label: 'How would I use this?', request: 'Show how I would apply this module in a small practical task for this internship. Give a step outline and let me attempt the key step myself before you reveal it.' },
  { id: 'analyse', level: 'Analyse', label: 'Probe my reasoning', request: 'Give me one realistic scenario where this module\'s idea can go wrong. Ask me to reason about the cause and trade-offs, with a hint ladder (hint 1, hint 2) rather than the full answer.' },
];

export function moduleContext(course: { title: string; category: string; deliverable: string }, m: { title: string; type: string; content: string }, hours: number, extra = '') {
  return [
    `Internship: ${course.title} (${course.category})`,
    `Pathway: ${hours}-hour`,
    `Module: ${m.title} [${m.type}]`,
    `Module draft notes: ${m.content || '(no draft notes yet)'}`,
    `Final deliverable of the internship: ${course.deliverable}`,
    extra,
  ].filter(Boolean).join('\n');
}
