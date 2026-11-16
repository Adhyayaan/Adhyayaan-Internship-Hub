import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Captions, FileText, Loader2, LockKeyhole, Pause, Play, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHref } from '@/lib/app';
import { useHere } from '@/lib/use-here';

/** Build a WebVTT track from the transcript by spreading sentences evenly across the clip. */
function toVtt(transcript: string, duration: number) {
  const parts = transcript.split(/(?<=[.!?।])\s+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length || !isFinite(duration) || duration <= 0) return '';
  const span = duration / parts.length;
  const ts = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(3).padStart(6, '0');
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec}`;
  };
  return 'WEBVTT\n\n' + parts.map((p, k) => `${k + 1}\n${ts(k * span)} --> ${ts((k + 1) * span)}\n${p}\n`).join('\n');
}

export function ModuleVideo({ src, transcript, title, userId }: { src: string; transcript: string; title: string; userId: string | null }) {
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const here = useHere();
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { setFailed(false); setLoading(false); setDuration(0); setShowTx(false); setRequested(false); setAttempt(0); }, [src]);
  useEffect(() => { if (requested && userId) setLoading(true); }, [requested, userId]);

  const trackUrl = useMemo(() => {
    const v = toVtt(transcript, duration);
    return v ? URL.createObjectURL(new Blob([v], { type: 'text/vtt' })) : '';
  }, [transcript, duration]);
  useEffect(() => () => { if (trackUrl) URL.revokeObjectURL(trackUrl); }, [trackUrl]);
  useEffect(() => {
    const t = ref.current?.textTracks[0];
    if (t) t.mode = 'showing';
  }, [trackUrl]);

  return (
    <figure className="ink-card overflow-hidden" data-testid="module-video">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <figcaption className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">A lesson with Adhya · animated scenes + AI narration</figcaption>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Captions className="h-3.5 w-3.5" /> Spoken lesson · captions available</span>
      </div>
      {!userId ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-secondary/50 p-6 text-center" data-testid="status-video-sign-in">
          <LockKeyhole className="h-6 w-6 text-[hsl(var(--ledger))]" aria-hidden="true" />
          <div><p className="font-display text-xl font-semibold text-primary">Meet Adhya in this lesson</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Sign in to generate and play the AI-narrated animated version. The written lesson and transcript remain open to everyone.</p></div>
          <Button asChild className="bg-[hsl(var(--ledger))] hover:bg-[hsl(var(--ledger))]/90" data-testid="button-sign-in-video"><Link href={authHref('login', here)}>Sign in to play</Link></Button>
        </div>
      ) : !requested ? (
        <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-primary px-5 py-6 text-primary-foreground" data-testid="video-ready">
          <div className="alpona-dots absolute inset-0 opacity-30" aria-hidden="true" />
          <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full border-[18px] border-[hsl(var(--turmeric))]/35" aria-hidden="true" />
          <img src={`${import.meta.env.BASE_URL}api/study-media/mentor-avatar.png`} alt="" className="absolute bottom-0 right-0 h-[90%] max-w-[52%] object-contain object-bottom sm:right-8" />
          <div className="relative z-10 mr-auto max-w-[58%]">
            <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--turmeric))]">Adhya · your learning mentor</p>
            <h3 className="mt-2 font-display text-2xl font-semibold leading-tight sm:text-3xl">{title}</h3>
            <p className="mt-2 text-sm text-primary-foreground/75">A spoken walkthrough, animated scenes, and one question to think through.</p>
            <Button type="button" onClick={() => setRequested(true)} className="mt-4 bg-accent hover:bg-accent/90" data-testid="button-generate-video"><Play className="mr-2 h-4 w-4" />Prepare narrated lesson</Button>
            <p className="mt-2 text-[10px] text-primary-foreground/65">The first play generates this chapter’s AI narration.</p>
          </div>
        </div>
      ) : failed ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted/60 p-6 text-center" data-testid="status-video-missing">
          <VideoOff className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Adhya’s lesson video is not available right now. The full spoken lesson transcript remains available below.</p>
          <Button type="button" variant="outline" onClick={() => { setFailed(false); setLoading(true); setAttempt((n) => n + 1); setRequested(true); }}>Try again</Button>
        </div>
      ) : (
        <div className="relative aspect-video">
          <video ref={ref} key={`${src}-${attempt}`} controls preload="metadata" playsInline className="h-full w-full bg-[hsl(232_52%_18%)]"
            aria-label={`Spoken animated lesson with Adhya: ${title}`} aria-describedby="video-lesson-description"
            onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); setLoading(false); }}
            onError={() => { setLoading(false); setFailed(true); }} data-testid="video-module">
            <source src={src} type="video/mp4" />
            {trackUrl && <track kind="captions" srcLang="en" label="Lesson captions" src={trackUrl} default />}
          </video>
          {loading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/90 text-center text-primary-foreground" role="status" aria-live="polite">
            <div className="space-y-2"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[hsl(var(--turmeric))]" /><p className="font-display text-lg font-semibold">Adhya is preparing your lesson</p><p className="text-xs text-primary-foreground/70">Creating the AI narration and animated scenes</p></div>
          </div>}
        </div>
      )}
      <div className="px-5 py-3">
        <p id="video-lesson-description" className="text-xs leading-relaxed text-muted-foreground">Adhya guides this lesson through animated scenes and AI narration. Captions and the written transcript are available; the video is served only to signed-in learners.</p>
        <button type="button" onClick={() => setShowTx(!showTx)} aria-expanded={showTx} data-testid="button-transcript"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          <FileText className="h-4 w-4" /> {showTx ? 'Hide spoken lesson transcript' : 'Read spoken lesson transcript'}
        </button>
        {showTx && <div className="mt-3 border-l-2 border-accent/40 pl-4" data-testid="text-transcript">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[.16em] text-accent">What Adhya says</p>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{transcript}</p>
        </div>}
      </div>
      <div className="mx-4 mb-4 flex gap-3 rounded-xl border border-[hsl(var(--ledger))]/25 bg-[hsl(var(--ledger-soft))] p-4" data-testid="reflection-video">
        <Pause className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--ledger))]" aria-hidden="true" />
        <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--ledger))]">Pause &amp; reflect</p><p className="mt-1 text-sm leading-relaxed text-primary">Which idea from “{title}” would you use first in your project—and what evidence might change your mind?</p></div>
      </div>
    </figure>
  );
}
