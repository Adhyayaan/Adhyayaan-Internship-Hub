import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { StudySection } from '@workspace/api-client-react';
import { useReducedMotion } from './use-reduced-motion';

/** Controlled SVG step animation: a survey "route" with stations that light up in order. */
export function MotionSteps({ steps, title }: { steps: StudySection[]; title: string }) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const n = steps.length;

  useEffect(() => { setI(0); setPlaying(false); }, [title]);
  useEffect(() => {
    if (!playing || n < 2) return;
    const t = window.setTimeout(() => {
      if (i >= n - 1) setPlaying(false); else setI(i + 1);
    }, reduced ? 6000 : 3800);
    return () => window.clearTimeout(t);
  }, [playing, i, n, reduced]);

  if (!n) return null;
  const W = 640, H = 150, pad = 48;
  const x = (k: number) => (n === 1 ? W / 2 : pad + (k * (W - pad * 2)) / (n - 1));
  const y = (k: number) => 78 + (k % 2 === 0 ? -16 : 16);
  const path = steps.map((_, k) => `${k ? 'L' : 'M'}${x(k)},${y(k)}`).join(' ');
  const step = steps[i];

  return (
    <figure className="ink-card overflow-hidden" aria-label={`Step animation: ${title}`} data-testid="motion-steps">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <figcaption className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--ledger))]">Step-through · {i + 1} of {n}</figcaption>
        <div className="flex items-center gap-1">
          <IconBtn label="Previous step" onClick={() => { setPlaying(false); setI(Math.max(0, i - 1)); }} disabled={i === 0} testid="button-step-prev"><ChevronLeft className="h-4 w-4" /></IconBtn>
          <IconBtn label={playing ? 'Pause animation' : 'Play animation'} onClick={() => { if (!playing && i >= n - 1) setI(0); setPlaying(!playing); }} testid="button-step-play">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </IconBtn>
          <IconBtn label="Next step" onClick={() => { setPlaying(false); setI(Math.min(n - 1, i + 1)); }} disabled={i === n - 1} testid="button-step-next"><ChevronRight className="h-4 w-4" /></IconBtn>
        </div>
      </div>
      <div className="alpona-dots bg-[hsl(var(--ledger-soft)/.5)] px-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Stage ${i + 1}: ${step.heading}`}>
          <path d={path} fill="none" stroke="hsl(var(--rule))" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
          {steps.map((s, k) => {
            const on = k <= i, cur = k === i;
            return (
              <g key={k} className="step-node cursor-pointer" style={{ transformOrigin: `${x(k)}px ${y(k)}px`, transform: cur && !reduced ? 'scale(1.12)' : 'scale(1)', opacity: on ? 1 : 0.55 }}
                onClick={() => { setPlaying(false); setI(k); }}>
                {k > 0 && on && <line x1={x(k - 1)} y1={y(k - 1)} x2={x(k)} y2={y(k)} stroke="hsl(var(--ledger))" strokeWidth="3" strokeLinecap="round" />}
                <circle cx={x(k)} cy={y(k)} r={cur ? 20 : 15} fill={cur ? 'hsl(var(--accent))' : on ? 'hsl(var(--ledger))' : 'hsl(var(--paper))'} stroke={on ? 'none' : 'hsl(var(--input))'} strokeWidth="2" />
                <text x={x(k)} y={y(k) + 5} textAnchor="middle" fontFamily="Lato, Arial, sans-serif" fontSize="13" fontWeight="700" fill={on ? 'hsl(40 60% 97%)' : 'hsl(232 14% 42%)'}>{k + 1}</text>
                <title>{s.heading}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="px-5 pb-5 pt-4" aria-live="polite">
        <p className="font-display text-lg font-semibold text-primary">{step.heading}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Choose step">
          {steps.map((s, k) => (
            <button key={k} role="tab" aria-selected={k === i} aria-label={`Step ${k + 1}: ${s.heading}`} onClick={() => { setPlaying(false); setI(k); }} data-testid={`button-step-${k}`}
              className={`h-1.5 flex-1 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${k <= i ? 'bg-[hsl(var(--ledger))]' : 'bg-muted'}`} />
          ))}
        </div>
      </div>
    </figure>
  );
}

function IconBtn({ children, label, onClick, disabled, testid }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; testid: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} data-testid={testid}
      className="flex h-8 w-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-secondary disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children}
    </button>
  );
}
