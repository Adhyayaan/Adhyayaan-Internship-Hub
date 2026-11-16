import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, BrainCircuit, Captions, CheckCircle2, FileText, Lightbulb, Loader2, LockKeyhole, Play, RotateCcw, Sparkles } from 'lucide-react';
import type { PilotVideo as Pilot, VideoCheckpoint } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { authHref } from '@/lib/app';
import { useHere } from '@/lib/use-here';

/** Resolve API-relative media paths against the app base path (same pattern as other study media). */
function media(url: string) {
  if (/^https?:\/\//.test(url)) return url;
  return `${import.meta.env.BASE_URL}${url.replace(/^\//, '')}`;
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

type CpState = { wrong: string[]; picked: string | null; solved: boolean; revealed: boolean };
const fresh = (): CpState => ({ wrong: [], picked: null, solved: false, revealed: false });

export function PilotVideo({ pilot, transcript, userId }: { pilot: Pilot; transcript: string; userId: string | null }) {
  const here = useHere();
  const ref = useRef<HTMLVideoElement>(null);
  const last = useRef(0);
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  const [autoPause, setAutoPause] = useState(true);
  const [showTx, setShowTx] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [cps, setCps] = useState<Record<string, CpState>>({});
  const cpsRef = useRef(cps); cpsRef.current = cps;
  const autoRef = useRef(autoPause); autoRef.current = autoPause;
  const activeRef = useRef(active); activeRef.current = active;

  const checkpoints = [...pilot.checkpoints].sort((a, b) => a.at - b.at);
  const cpRef = useRef(checkpoints); cpRef.current = checkpoints;
  const resolved = (id: string) => !!(cpsRef.current[id]?.solved || cpsRef.current[id]?.revealed);

  // Start only after an explicit play request; surface browser rejections gracefully.
  useEffect(() => {
    if (!requested || !userId || failed) return;
    const v = ref.current;
    if (!v) return;
    setBlocked(false);
    v.play().catch((e: unknown) => {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setBlocked(true); setLoading(false);
    });
    return () => {
      v.pause();
      v.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
      v.removeAttribute('src');
      v.load();
    };
  }, [requested, userId, attempt, failed]);

  const onTime = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    const t = v.currentTime, prev = last.current;
    last.current = t;
    setNow(t);
    if (!autoRef.current || activeRef.current || t <= prev) return;
    const hit = cpRef.current.find((c) => c.at > prev && c.at <= t && !resolved(c.id));
    if (hit) {
      v.pause();
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
      setActive(hit.id);
    }
  }, []);

  const begin = () => { setActive(null); setFailed(false); setLoading(true); setRequested(true); };
  const retry = () => { setFailed(false); setLoading(true); setReady(false); last.current = 0; setAttempt((n) => n + 1); };
  const seek = (t: number) => {
    const v = ref.current;
    if (!v || !ready) return;
    last.current = t; // seeking to a chapter is navigation, not a crossing
    v.currentTime = t; setNow(t);
  };
  const resume = () => {
    setActive(null);
    ref.current?.play().catch(() => setBlocked(true));
  };
  const openQuestion = (id: string) => { ref.current?.pause(); setActive(id); };
  const patch = (id: string, f: (s: CpState) => CpState) => setCps((m) => ({ ...m, [id]: f(m[id] ?? fresh()) }));

  const current = checkpoints.find((c) => c.id === active) ?? null;
  const chapterIdx = pilot.chapters.findIndex((c) => now >= c.start && now < c.end);

  return (
    <figure id="pilot-lesson" className="ink-card scroll-mt-20 overflow-hidden" data-testid="pilot-video">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
        <figcaption className="min-w-0 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Pilot lesson with Adhya · reasoning checkpoints</figcaption>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold tracking-wider text-primary-foreground" data-testid="badge-pilot-1080p">1080p PILOT</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Captions className="h-3.5 w-3.5" />Captions</span>
        </div>
      </div>

      <div className="relative aspect-video overflow-hidden bg-[hsl(232_52%_18%)]">
        {!userId || !requested ? (
          <>
            <img src={media(pilot.posterUrl)} alt="" className="absolute inset-0 h-full w-full object-cover" data-testid="img-pilot-poster" />
            <div className="absolute inset-0 bg-gradient-to-t from-[hsl(232_52%_12%/.92)] via-[hsl(232_52%_14%/.45)] to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 p-3 text-primary-foreground sm:p-6">
              <h3 className="line-clamp-2 max-w-full font-display text-base font-semibold leading-tight sm:text-2xl" data-testid="text-pilot-title">{pilot.title}</h3>
              <p className="hidden text-xs text-primary-foreground/75 sm:block">{clock(pilot.duration)} · {checkpoints.length} thinking pauses · {pilot.chapters.length} chapters</p>
              {userId ? (
                <Button type="button" size="sm" onClick={begin} className="bg-accent hover:bg-accent/90" data-testid="button-play-pilot"><Play className="mr-1.5 h-4 w-4" />Play lesson</Button>
              ) : (
                <Button asChild size="sm" className="bg-[hsl(var(--ledger))] hover:bg-[hsl(var(--ledger))]/90" data-testid="button-sign-in-pilot"><Link href={authHref('login', here)}><LockKeyhole className="mr-1.5 h-4 w-4" />Sign in to watch</Link></Button>
              )}
            </div>
          </>
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-primary-foreground" role="alert" data-testid="status-pilot-error">
            <AlertTriangle className="h-6 w-6 text-[hsl(var(--turmeric))]" />
            <p className="max-w-sm text-sm text-primary-foreground/85">The lesson video could not load. The transcript below still has the full lesson.</p>
            <Button type="button" size="sm" variant="outline" onClick={retry} className="bg-transparent text-primary-foreground" data-testid="button-retry-pilot"><RotateCcw className="mr-1.5 h-4 w-4" />Try again</Button>
          </div>
        ) : (
          <>
            <video ref={ref} key={attempt} controls playsInline preload="metadata" poster={media(pilot.posterUrl)} className="h-full w-full"
              aria-label={`Pilot lesson video: ${pilot.title}`}
              onLoadedMetadata={() => { setReady(true); setLoading(false); }}
              onCanPlay={() => setLoading(false)}
              onWaiting={() => setLoading(true)}
              onPlaying={() => { setLoading(false); setBlocked(false); }}
              onTimeUpdate={onTime} onSeeked={onTime}
              onEnded={() => { last.current = 0; }}
              onError={() => { setLoading(false); setFailed(true); }} data-testid="video-pilot">
              <source src={media(pilot.videoUrl)} type="video/mp4" />
              <track kind="captions" srcLang="en" label="English captions" src={media(pilot.captionsUrl)} default />
            </video>
            {loading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[hsl(232_52%_14%/.7)] text-primary-foreground" role="status" aria-live="polite">
              <span className="inline-flex items-center gap-2 text-sm"><Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--turmeric))]" />Loading lesson</span>
            </div>}
          </>
        )}
      </div>

      {blocked && !failed && <p className="border-b bg-[hsl(var(--turmeric)/.12)] px-4 py-2 text-xs text-primary" role="status" data-testid="status-play-blocked">Your browser held playback. Press play on the video to start.</p>}

      {/* Checkpoint panel sits below the video, never on top of it. */}
      {current && <Checkpoint key={current.id} cp={current} state={cps[current.id] ?? fresh()}
        onPick={(optId) => {
          const opt = current.options.find((o) => o.id === optId);
          if (!opt) return;
          patch(current.id, (s) => ({ ...s, picked: optId, solved: s.solved || opt.correct, wrong: opt.correct || s.wrong.includes(optId) ? s.wrong : [...s.wrong, optId] }));
        }}
        onReveal={() => patch(current.id, (s) => ({ ...s, revealed: true }))}
        onRetry={() => patch(current.id, () => fresh())}
        onContinue={resume} />}

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="flex gap-2.5 rounded-xl border border-[hsl(var(--turmeric))]/50 bg-[hsl(var(--turmeric)/.1)] p-3 text-xs leading-relaxed text-foreground/80" data-testid="text-ai-disclosure">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(32_70%_38%)]" aria-hidden="true" />
          <p><span className="font-semibold text-primary">AI-generated video.</span> Visuals and narration were produced with AI. People, places and data shown are fictional illustrations, not real survey records.</p>
        </div>

        {pilot.chapters.length > 0 && (
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--ledger))]">Chapters</p>
            <ol className="grid gap-1.5 sm:grid-cols-2">
              {pilot.chapters.map((c, k) => (
                <li key={k}>
                  <button type="button" onClick={() => seek(c.start)} disabled={!ready} aria-current={k === chapterIdx ? 'step' : undefined} data-testid={`button-chapter-${k}`}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${k === chapterIdx ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-accent/60 hover:bg-secondary'}`}>
                    <span className="font-mono text-[11px] opacity-70">{clock(c.start)}</span><span className="min-w-0 flex-1 truncate">{c.title}</span>
                  </button>
                </li>
              ))}
            </ol>
            {!ready && <p className="mt-1.5 text-[11px] text-muted-foreground">{userId ? 'Chapter jumps unlock once the video starts loading.' : 'Sign in and play to jump between chapters.'}</p>}
          </div>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--ledger))]">Thinking pauses</p>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={autoPause} onChange={(e) => setAutoPause(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--accent))]" data-testid="toggle-auto-pause" />
              Pause video at questions
            </label>
          </div>
          <ul className="mt-2 space-y-1.5">
            {checkpoints.map((c, k) => {
              const s = cps[c.id];
              const done = s?.solved || s?.revealed;
              return (
                <li key={c.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm" data-testid={`row-checkpoint-${c.id}`}>
                  {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--ledger))]" aria-label="Answered" /> : <BrainCircuit className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate"><span className="font-mono text-[11px] text-muted-foreground">{clock(c.at)}</span> Question {k + 1}</span>
                  <button type="button" onClick={() => openQuestion(c.id)} className="shrink-0 text-xs font-semibold text-accent hover:underline" data-testid={`button-open-checkpoint-${c.id}`}>{done ? 'Replay' : 'Open'}</button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Practice only for this session. Answers are not saved and never count toward hours, completion or grades.</p>
        </div>

        <div>
          <button type="button" onClick={() => setShowTx(!showTx)} aria-expanded={showTx} data-testid="button-transcript"
            className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <FileText className="h-4 w-4" />{showTx ? 'Hide transcript' : 'Read transcript'}
          </button>
          {showTx && <p className="mt-3 whitespace-pre-line border-l-2 border-accent/40 pl-4 text-sm leading-relaxed text-muted-foreground" data-testid="text-transcript">{transcript}</p>}
        </div>
      </div>
    </figure>
  );
}

function Checkpoint({ cp, state, onPick, onReveal, onRetry, onContinue }: {
  cp: VideoCheckpoint; state: CpState; onPick: (id: string) => void; onReveal: () => void; onRetry: () => void; onContinue: () => void;
}) {
  const picked = cp.options.find((o) => o.id === state.picked);
  const done = state.solved || state.revealed;
  const tries = state.wrong.length;
  // Progressive support: hint after one miss, then strike out a distractor, then offer the explanation.
  const struck = tries >= 2 ? cp.options.find((o) => !o.correct && !state.wrong.includes(o.id))?.id : undefined;
  return (
    <section className="border-b bg-[hsl(var(--ledger-soft))] px-4 py-4 sm:px-5" aria-live="polite" aria-labelledby={`cp-${cp.id}`} data-testid={`panel-checkpoint-${cp.id}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--ledger))]">Pause and reason · {clock(cp.at)}</p>
      <h4 id={`cp-${cp.id}`} className="mt-1 font-display text-lg font-semibold leading-snug text-primary">{cp.question}</h4>
      <div className="mt-3 grid gap-2" role="group" aria-label="Choices">
        {cp.options.map((o) => {
          const wrong = state.wrong.includes(o.id);
          const right = done && o.correct;
          const off = o.id === struck && !done;
          return (
            <button key={o.id} type="button" disabled={done || wrong || off} onClick={() => onPick(o.id)} data-testid={`button-option-${o.id}`}
              className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${right ? 'border-[hsl(var(--ledger))] bg-card font-semibold text-primary' : wrong ? 'border-destructive/40 bg-card text-muted-foreground line-through' : off ? 'bg-card/50 text-muted-foreground/60 line-through' : 'bg-card hover:border-accent/60'}`}>
              {o.text}
            </button>
          );
        })}
      </div>
      {picked && <p className={`mt-3 text-sm leading-relaxed ${picked.correct ? 'text-[hsl(var(--ledger))]' : 'text-destructive'}`} data-testid="text-checkpoint-feedback">{picked.feedback}</p>}
      {!done && tries >= 1 && (
        <div className="mt-3 flex gap-2 rounded-lg bg-card p-3 text-sm" data-testid="text-checkpoint-hint">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(32_70%_38%)]" aria-hidden="true" />
          <p>{cp.hint}{tries >= 2 && ' One unlikely choice has been set aside to narrow it down.'}</p>
        </div>
      )}
      {done && <p className="mt-3 rounded-lg bg-card p-3 text-sm leading-relaxed" data-testid="text-checkpoint-explanation"><span className="font-semibold text-primary">Why: </span>{cp.explanation}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {done ? (
          <>
            <Button type="button" size="sm" onClick={onContinue} className="bg-accent hover:bg-accent/90" data-testid="button-checkpoint-continue"><Play className="mr-1.5 h-4 w-4" />Continue video</Button>
            <Button type="button" size="sm" variant="outline" onClick={onRetry} data-testid="button-checkpoint-retry"><RotateCcw className="mr-1.5 h-4 w-4" />Try again</Button>
          </>
        ) : (
          <>
            {tries >= 1 && <Button type="button" size="sm" variant="outline" onClick={onReveal} data-testid="button-checkpoint-reveal">Show explanation</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={onContinue} className="text-muted-foreground" data-testid="button-checkpoint-later">Answer later</Button>
          </>
        )}
      </div>
    </section>
  );
}
