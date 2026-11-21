import { type ReactNode } from 'react';
import { Link } from 'wouter';
import { AlertCircle, BookOpenCheck, Check, Compass, Lightbulb, RotateCcw, ShieldCheck, Sprout, X } from 'lucide-react';
import type { LearningReport, LearningReportSummary } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';

export const logoSrc = `${import.meta.env.BASE_URL}adhyayaan-logo.png`;

export function fmtDate(s: string | null | undefined) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtRetakeTime(value: string) {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function FocusHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center" data-testid="link-logo">
          <img src={logoSrc} alt="Adhyayaan home" className="h-10 w-auto object-contain sm:h-11" />
        </Link>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`rounded-xl bg-muted motion-safe:animate-pulse ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <SkeletonBlock className="h-8 w-2/3" />
      <SkeletonBlock className="h-4 w-1/2" />
      <SkeletonBlock className="h-40 w-full" />
      <SkeletonBlock className="h-24 w-full" />
    </div>
  );
}

export function ErrorPanel({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="ink-card flex flex-col items-start gap-3 border-l-4 !border-l-destructive p-5" data-testid="status-error">
      <div className="flex items-center gap-2 font-bold text-destructive"><AlertCircle className="h-5 w-5" />{title}</div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && <Button variant="outline" onClick={onRetry} data-testid="button-retry"><RotateCcw className="mr-2 h-4 w-4" />Try again</Button>}
    </div>
  );
}

export function EmptyPanel({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center" data-testid="status-empty">
      <div className="alpona-dots pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">{icon ?? <Sprout className="h-6 w-6" />}</div>
      <p className="relative font-bold">{title}</p>
      {children && <div className="relative mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function SharingNote({ compact = false }: { compact?: boolean }) {
  return (
    <aside className="rounded-2xl bg-[hsl(var(--ledger-soft))] p-4 text-sm text-[hsl(var(--ledger))]" data-testid="text-sharing-note">
      <div className="mb-1 flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4" />Who can see this</div>
      <ul className={`space-y-1 ${compact ? '' : 'list-disc pl-5'}`}>
        <li>Authorised admins can see your saved reports.</li>
        <li>Admins cannot see your unfinished draft.</li>
        <li>Only the teaching guidance goes to the AI tutor. Your answers do not.</li>
      </ul>
    </aside>
  );
}

export function ReportHistory({ reports, hrefFor, emptyText }: { reports: LearningReportSummary[]; hrefFor: (r: LearningReportSummary) => string; emptyText: string }) {
  if (!reports.length) return <p className="text-sm text-muted-foreground" data-testid="text-no-reports">{emptyText}</p>;
  const sorted = [...reports].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {sorted.map((r, i) => (
        <li key={r.id}>
          <Link href={hrefFor(r)} className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/60" data-testid={`link-report-${r.id}`}>
            <span className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{sorted.length - i}</span>
              <span>
                <span className="block font-semibold">{fmtDate(r.completedAt)}</span>
                <span className="block text-xs text-muted-foreground">Version {r.version}{i === 0 ? ' · Latest' : ''}</span>
              </span>
            </span>
            <span className="text-sm font-semibold text-accent motion-safe:transition-transform group-hover:translate-x-1">Open</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Section({ title, icon, children, delay = 0 }: { title: string; icon: ReactNode; children: ReactNode; delay?: number }) {
  return (
    <section className="ink-card rise p-5 sm:p-6" style={{ animationDelay: `${delay}ms` }}>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-primary">{icon}{title}</h2>
      {children}
    </section>
  );
}

function Bullets({ items, tone }: { items: string[]; tone: 'ledger' | 'accent' | 'primary' }) {
  const dot = tone === 'ledger' ? 'bg-[hsl(var(--ledger))]' : tone === 'accent' ? 'bg-accent' : 'bg-primary';
  if (!items.length) return <p className="text-sm text-muted-foreground">No items in this part.</p>;
  return (
    <ul className="space-y-2">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3 text-[0.95rem] leading-relaxed"><span className={`mt-2 h-2 w-2 flex-none rounded-full ${dot}`} />{s}</li>
      ))}
    </ul>
  );
}

export function ReportView({ report, audience = 'self' }: { report: LearningReport; audience?: 'self' | 'admin' }) {
  const you = audience === 'self';
  const reasoning = report.dimensions.find(d => d.id === 'reasoning');
  const selfRatings = report.dimensions.filter(d => d.id !== 'reasoning');
  const highest = selfRatings.length ? Math.max(...selfRatings.map(d => d.score / d.maxScore)) : null;
  const lowest = selfRatings.length ? Math.min(...selfRatings.map(d => d.score / d.maxScore)) : null;
  const highNames = highest === null ? [] : selfRatings.filter(d => d.score / d.maxScore === highest).map(d => d.title);
  const lowNames = lowest === null ? [] : selfRatings.filter(d => d.score / d.maxScore === lowest).map(d => d.title);
  const interestScores = report.careers.filter(c => typeof c.interestScore === 'number');
  const highestInterest = interestScores.length ? Math.max(...interestScores.map(c => c.interestScore!)) : 0;
  const interestNames = interestScores.filter(c => c.interestScore === highestInterest).map(c => c.title);
  return (
    <div className="space-y-5">
      <section className="ink-card border-primary/15 bg-[hsl(var(--secondary))] p-5 sm:p-6" data-testid="card-report-summary">
        <h2 className="text-lg font-black text-primary">Quick summary</h2>
        <p className="mt-1 text-sm text-muted-foreground">This is a snapshot of your answers today. It does not give one total score.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {reasoning && <div className="rounded-xl border border-border bg-card p-4" data-testid="text-summary-reasoning">
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Reasoning practice</p>
            <p className="mt-1 text-xl font-black text-primary">{reasoning.score} of {reasoning.maxScore} correct</p>
            <p className="mt-1 text-sm text-muted-foreground">See the question notes below to find what to practise.</p>
          </div>}
          {selfRatings.length > 0 && <div className="rounded-xl border border-border bg-card p-4" data-testid="text-summary-self-ratings">
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Your self-ratings</p>
            {highest === lowest
              ? <p className="mt-1 text-sm">Your ratings were similar across these areas.</p>
              : <>
                <p className="mt-1 text-sm"><span className="font-bold">Highest today:</span> {highNames.join(', ')}</p>
                <p className="mt-1 text-sm"><span className="font-bold">May need practice:</span> {lowNames.join(', ')}</p>
              </>}
            <p className="mt-1 text-xs text-muted-foreground">Each area uses 3 answers. These are your reports, not observed results.</p>
          </div>}
          {interestScores.length > 0 && <div className="rounded-xl border border-border bg-card p-4 sm:col-span-2" data-testid="text-summary-interests">
            <p className="text-xs font-bold uppercase tracking-wide text-accent">Activities you rated most highly</p>
            <p className="mt-1 text-sm">{highestInterest > 0 ? interestNames.join(', ') : 'No activity group stood out yet. You can explore any group that interests you.'}</p>
            <p className="mt-1 text-xs text-muted-foreground">These ratings suggest activities to explore. They do not decide your career.</p>
          </div>}
        </div>
      </section>

      <Section title={you ? 'Your answers by area' : 'Answers by area'} icon={<Sprout className="h-5 w-5" />}>
        <p className="mb-4 text-sm text-muted-foreground">Each score has its own meaning. Do not add them together. Study scores use 3 answers and show what you reported, not a test of your behavior.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {report.dimensions.map((d) => {
            const pct = d.maxScore > 0 ? Math.max(0, Math.min(100, (d.score / d.maxScore) * 100)) : 0;
            return (
              <div key={d.id} className="rounded-xl border border-border bg-background/60 p-4" data-testid={`card-dimension-${d.id}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-bold">{d.title}</h3>
                  <span className="text-sm font-black text-primary" data-testid={`text-score-${d.id}`}>{Math.round(d.score)}<span className="font-normal text-muted-foreground"> / {d.maxScore}</span></span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${d.title}: ${Math.round(d.score)} of ${d.maxScore}`}>
                  <div className="h-full origin-left rounded-full bg-gradient-to-r from-[hsl(var(--ledger))] to-[hsl(var(--turmeric))] motion-safe:transition-transform motion-safe:duration-700" style={{ transform: `scaleX(${pct / 100})` }} />
                </div>
                <p className="mt-3 text-sm">{d.interpretation}</p>
                {d.evidence && d.evidence.length > 0 && <div className="mt-3 border-t border-border pt-3">
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Your answers</h4>
                  <ul className="space-y-2">
                    {d.evidence.map((e, index) => <li key={index} className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm" data-testid={`text-evidence-${d.id}-${index}`}>
                      <span className="min-w-0 flex-1">{e.prompt}</span>
                      <span className="font-bold text-primary">{e.response}</span>
                    </li>)}
                  </ul>
                </div>}
                <p className="mt-2 flex gap-2 text-sm text-[hsl(var(--ledger))]"><Lightbulb className="mt-0.5 h-4 w-4 flex-none" />{d.suggestion}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {report.reasoning.length > 0 && (
        <Section title="Reasoning practice" icon={<BookOpenCheck className="h-5 w-5" />} delay={60}>
          <p className="mb-4 text-sm text-muted-foreground">
            {report.reasoning.filter((r) => r.correct).length} of {report.reasoning.length} correct. Read each explanation. This is practice, not an IQ test.
          </p>
          <ol className="space-y-3">
            {report.reasoning.map((r, i) => (
              <li key={r.questionId} className="rounded-xl border border-border p-4" data-testid={`card-reasoning-${r.questionId}`}>
                <div className="flex gap-3">
                  <span className={`grid h-7 w-7 flex-none place-items-center rounded-full ${r.correct ? 'bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]' : 'bg-accent/15 text-accent'}`}>
                    {r.correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="font-semibold">{i + 1}. {r.prompt}</p>
                    <p>{you ? 'You chose' : 'Chosen'}: <span className="font-semibold">{r.selected || 'No answer'}</span></p>
                    {r.skill && <p className="text-xs font-semibold text-accent">Skill checked: {r.skill}</p>}
                    {!r.correct && <p>Correct answer: <span className="font-semibold text-[hsl(var(--ledger))]">{r.correctAnswer}</span></p>}
                    <p className="text-muted-foreground">{r.explanation}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Strengths to use" icon={<Check className="h-5 w-5" />} delay={100}><Bullets items={report.strengths} tone="ledger" /></Section>
        <Section title="Areas to grow" icon={<Sprout className="h-5 w-5" />} delay={140}><Bullets items={report.growthAreas} tone="accent" /></Section>
      </div>

      <Section title="Next steps" icon={<Compass className="h-5 w-5" />} delay={180}>
        <ol className="space-y-2">
          {report.nextSteps.map((s, i) => (
            <li key={i} className="flex gap-3"><span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span><span>{s}</span></li>
          ))}
        </ol>
      </Section>

      {report.careers.length > 0 && (
        <Section title="Career ideas to explore" icon={<Compass className="h-5 w-5" />} delay={220}>
          <p className="mb-4 text-sm text-muted-foreground">These ideas come from interest groups. They are ideas to explore. They do not decide eligibility.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {report.careers.map((c) => (
              <article key={c.title} className="lift rounded-xl border border-border bg-background/60 p-4" data-testid={`card-career-${c.title}`}>
                <h3 className="font-black text-primary">{c.title}</h3>
                {typeof c.interestScore === 'number' && typeof c.interestMax === 'number' && <p className="mt-1 text-xs font-semibold text-[hsl(var(--ledger))]" data-testid={`text-interest-score-${c.title}`}>Interest rating: {c.interestScore} of {c.interestMax} across 2 activities</p>}
                <p className="mt-1 text-sm">{c.reason}</p>
                {c.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{c.skills.map((s) => <span key={s} className="ledger-chip rounded-full px-2.5 py-0.5 text-xs font-semibold">{s}</span>)}</div>}
                <p className="mt-3 text-sm"><span className="font-bold">Try a project: </span>{c.project}</p>
                <p className="mt-1 text-sm text-muted-foreground"><span className="font-bold text-foreground">Ask a counsellor: </span>{c.counsellorQuestion}</p>
              </article>
            ))}
          </div>
        </Section>
      )}

      {report.scenarioInsights && report.scenarioInsights.length > 0 && (
        <Section title="Your choices in real-life situations" icon={<Compass className="h-5 w-5" />} delay={240}>
          <p className="mb-3 text-sm text-muted-foreground">These answers have no right or wrong score. They show which first steps you chose today.</p>
          <Bullets items={report.scenarioInsights} tone="primary" />
        </Section>
      )}

      {report.teachingPlan.length > 0 && (
        <Section title={you ? 'How Adhya will teach you' : 'Teaching guidance'} icon={<Lightbulb className="h-5 w-5" />} delay={280}>
          <Bullets items={report.teachingPlan} tone="primary" />
          <p className="mt-3 text-xs text-muted-foreground">Only this teaching guidance goes to the AI tutor.</p>
        </Section>
      )}

      <section className="rounded-2xl border border-border bg-secondary/50 p-5 text-sm">
        <h2 className="mb-2 font-bold">How this report was made</h2>
        <p className="whitespace-pre-line text-muted-foreground">{report.methodology}</p>
        <Link href="/assessment/guide" className="mt-3 inline-block font-semibold text-accent underline-offset-4 hover:underline" data-testid="link-guide">Read the full guide</Link>
      </section>
    </div>
  );
}

export function ReportHeading({ report, kicker }: { report: LearningReport; kicker: string }) {
  return (
    <div className="rise">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{kicker}</p>
      <h1 className="font-display mt-1 text-3xl font-black text-primary sm:text-4xl">Learning report</h1>
      <p className="mt-1 text-sm text-muted-foreground" data-testid="text-report-date">Saved on {fmtDate(report.completedAt)} · Version {report.version}</p>
    </div>
  );
}
