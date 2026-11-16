import { useEffect, useMemo, useRef, useState } from 'react';
import { Captions, FileText, VideoOff } from 'lucide-react';

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

export function ModuleVideo({ src, transcript, title }: { src: string; transcript: string; title: string }) {
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { setFailed(false); setDuration(0); setShowTx(false); }, [src]);

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
        <figcaption className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Micro-video · silent visual summary</figcaption>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Captions className="h-3.5 w-3.5" /> Captioned · no narration · not a lecture</span>
      </div>
      {failed ? (
        <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-muted/60 p-6 text-center" data-testid="status-video-missing">
          <VideoOff className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">This clip is not available yet. The transcript below covers the same visual summary.</p>
        </div>
      ) : (
        <video ref={ref} key={src} controls preload="metadata" playsInline className="aspect-video w-full bg-[hsl(232_52%_18%)]"
          aria-label={`Silent summary video: ${title}`} onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} onError={() => setFailed(true)} data-testid="video-module">
          <source src={src} type="video/mp4" />
          {trackUrl && <track kind="captions" srcLang="en" label="English captions" src={trackUrl} default />}
        </video>
      )}
      <div className="px-5 py-3">
        <button type="button" onClick={() => setShowTx(!showTx)} aria-expanded={showTx} data-testid="button-transcript"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          <FileText className="h-4 w-4" /> {showTx ? 'Hide transcript' : 'Read transcript'}
        </button>
        {showTx && <p className="mt-3 whitespace-pre-line border-l-2 border-accent/40 pl-4 text-sm leading-relaxed text-muted-foreground" data-testid="text-transcript">{transcript}</p>}
      </div>
    </figure>
  );
}
