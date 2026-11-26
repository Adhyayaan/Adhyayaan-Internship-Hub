import { Timeline } from './guide';
import { useState } from 'react';
import { Link } from 'wouter';
import { Coach, CoachMark, CoachToggle } from '@/components/app/coach';
import type { Dashboard as DashboardData } from '@workspace/api-client-react';
import { ArrowRight, ClipboardList, Eye, Sparkles } from 'lucide-react';
import { useGetDashboard } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorPanel, Empty, Meter } from '@/components/app/bits';
import { CourseCard } from '@/components/app/course-card';
import { progressOf, statusLabel, useTitle } from '@/lib/app';

export default function Dashboard() {
  useTitle('Today');
  const q = useGetDashboard();
  const d = q.data;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Suprabhat' : hour < 17 ? 'Good afternoon' : 'Shubho sandhya';

  return (
    <div>
      <section className="rise relative mb-10 overflow-hidden rounded-[2rem] bg-primary text-primary-foreground">
        <div className="alpona-dots absolute inset-0 opacity-20" />
        <div className="relative grid items-center gap-6 md:grid-cols-[1.1fr_1fr]">
          <div className="p-7 md:p-10">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-primary-foreground/60">Cognitive &amp; adaptive learning · understand, apply, analyse</p>
            {d?.preview && (
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em]" data-testid="status-preview">
                <Eye className="h-3.5 w-3.5" /> Preview workspace
              </span>
            )}
            <h1 className="font-display text-4xl font-semibold leading-[1.02] md:text-6xl">
              {d?.user ? <>{greet}, <span className="italic text-[hsl(40_88%_62%)]">{d.user.name.split(' ')[0]}</span>.</> : <>Practical work, <span className="italic text-[hsl(40_88%_62%)]">one honest hour</span> at a time.</>}
            </h1>
            <p className="mt-4 max-w-md text-primary-foreground/75">
              {d?.preview
                ? 'You are looking at an illustrative sample pathway, not your own account. Sign in to start a real one — new accounts begin empty.'
                : 'Continue your lessons or log your work hours. Ask Adhya for help in Bangla or English.'}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {d?.preview ? (
                <>
                  <Button asChild className="bg-accent hover:bg-accent/90" data-testid="button-hero-register"><Link href="/register">Start my workspace</Link></Button>
                  <Button asChild variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-hero-explore"><Link href="/explore">Browse 30 internships</Link></Button>
                </>
              ) : (
                <>
                  <Button asChild className="bg-accent hover:bg-accent/90" data-testid="button-hero-log"><Link href="/logbook">Log today's hours</Link></Button>
                  <Button asChild variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10" data-testid="button-hero-ai"><Link href="/my-learning"><Sparkles className="mr-2 h-4 w-4" />Continue learning</Link></Button>
                </>
              )}
            </div>
          </div>
          <img src={`${import.meta.env.BASE_URL}hero.png`} alt="Illustration of a student studying beneath a krishnachura tree" className="h-64 w-full object-cover md:h-full md:max-h-[420px]" />
        </div>
      </section>

      {d?.user && (
        <section aria-labelledby="today-assessment" className="ink-card mb-8 flex flex-wrap items-center gap-4 p-4 sm:p-6">
          <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><ClipboardList className="h-5 w-5" /></span>
          <div className="min-w-0 grow basis-52">
            <h2 id="today-assessment" className="text-xl font-semibold text-primary">{d.user.assessmentCompletedAt ? 'Your learning report' : 'Take your learning assessment'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{d.user.assessmentCompletedAt ? 'See your study suggestions and career ideas. Adhya uses your report to adapt its help.' : 'Find study habits to practise and career paths to explore. You can pause and come back later.'}</p>
          </div>
          <Button asChild className="max-w-full" variant={d.user.assessmentCompletedAt ? 'outline' : 'default'}>
            <Link href={d.user.assessmentCompletedAt ? '/profile#learning-reports' : '/assessment'}>{d.user.assessmentCompletedAt ? 'View learning report' : 'Start or resume'}<ArrowRight aria-hidden className="ml-2 h-4 w-4" /></Link>
          </Button>
        </section>
      )}

      {q.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl bg-secondary" />)}</div>
      ) : q.error || !d ? (
        <ErrorPanel error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Active pathways', d.stats.activeInternships, ''],
              ['Hours logged', d.stats.learningHours, 'hrs'],
              ['Modules done', d.stats.completedModules, ''],
              ['Projects sent', d.stats.submittedProjects, ''],
            ].map(([l, v, u], i) => (
              <div key={l as string} className="ink-card rise p-5" style={{ animationDelay: `${i * 70}ms` }} data-testid={`stat-${i}`}>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{l}</p>
                <p className="mt-2 font-display text-4xl font-semibold text-primary">{v}<span className="ml-1 text-base text-muted-foreground">{u}</span></p>
              </div>
            ))}
          </div>
          {d.preview && <p className="mt-2 text-xs text-muted-foreground">Sample figures from an illustrative pathway.</p>}
          {d.pacing && <Timeline plans={d.pacing} />}
          {!d.preview && d.user && <NextStep d={d} />}

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            <section>
              <div className="mb-4 flex items-end justify-between">
                <h2 className="font-display text-2xl font-semibold text-primary">{d.preview ? 'Sample pathway' : 'Your pathways'}</h2>
                {!d.preview && <Link href="/my-learning" className="text-sm text-accent hover:underline" data-testid="link-all-learning">See all</Link>}
              </div>
              {d.enrollments.length === 0 ? (
                <Empty title="You have not joined an internship yet" body="Choose an internship plan for 60 or 120 hours. It is free to enrol. Your college must still approve your internship." action={<Button asChild data-testid="button-empty-explore"><Link href="/explore">Explore internships</Link></Button>} />
              ) : (
                <div className="space-y-3">
                  {d.enrollments.map((e) => {
                    const p = progressOf(e);
                    return (
                      <div key={e.id} className="ink-card p-5" data-testid={`card-enrollment-${e.id}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{e.course.category} · {e.hours}-hour pathway</p>
                            <h3 className="mt-1 font-display text-xl font-semibold text-primary">{e.course.title}</h3>
                          </div>
                          <span className="rounded-full bg-secondary px-3 py-1 text-xs">{statusLabel(e.status)}</span>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Modules</span><span>{p.done}/{p.mods.length}</span></div><Meter value={p.modulePct} /></div>
                          <div><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Hours</span><span>{e.loggedHours}/{e.hours}</span></div><Meter value={p.hourPct} tone="accent" /></div>
                        </div>
                        {e.course.id === '01' && (
                          <Link href="/study/01" className="mr-4 mt-4 inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--ledger))] hover:text-accent" data-testid={`link-study-${e.id}`}>
                            Next: read the study book <ArrowRight className="h-4 w-4" />
                          </Link>
                        )}
                        {!d.preview && (
                          <Link href="/my-learning" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-accent" data-testid={`link-continue-${e.id}`}>
                            Continue <ArrowRight className="h-4 w-4" />
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section>
              <h2 className="mb-4 font-display text-2xl font-semibold text-primary">Recent activity</h2>
              <div className="ink-card p-5">
                {d.activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing yet. Your module ticks, logs and submissions will appear here.</p>
                ) : (
                  <ol className="relative space-y-5 border-l border-dashed border-accent/50 pl-5">
                    {d.activity.map((a) => (
                      <li key={a.id} className="relative" data-testid={`activity-${a.id}`}>
                        <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-card bg-accent" />
                        <p className="text-sm">{a.text}</p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {a.type}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>

          {d.recommendations.length > 0 && (
            <section className="mt-12">
              <div className="mb-4 flex items-end justify-between">
                <h2 className="font-display text-2xl font-semibold text-primary">Worth a look</h2>
                <Link href="/explore" className="text-sm text-accent hover:underline" data-testid="link-explore-more">All internships</Link>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {d.recommendations.map((c, i) => <CourseCard key={c.id} course={c} i={i} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function NextStep({ d }: { d: DashboardData }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<string>(d.enrollments[0]?.id ?? '');
  const e = d.enrollments.find((x) => x.id === focus) ?? d.enrollments[0];
  const p = e ? progressOf(e) : null;
  const remaining = p && e ? p.mods.filter((m) => !e.completedModules.includes(m.id)) : [];
  return (
    <section className="ink-card rise mt-6 overflow-hidden" data-testid="section-next-step">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 p-4 sm:gap-4 sm:p-5 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-[hsl(40_88%_62%)]"><CoachMark className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Your next step</p>
          <p className="break-words font-display text-lg font-semibold leading-relaxed text-primary" data-testid="text-next-step">
            {!e ? 'Choose a first pathway that fits your discipline.' : remaining.length ? <>Next up in {e.course.title}: <em className="text-accent">{remaining[0].title}</em></> : <>All modules done in {e.course.title}. Time for the project.</>}
          </p>
        </div>
        <div className="col-span-2 min-w-0 xl:col-span-1">
          <CoachToggle open={open} onClick={() => setOpen((o) => !o)} label="Plan it with the coach" testId="button-coach-next" />
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t bg-secondary/30 p-4">
          {d.enrollments.length > 1 && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Pathway to plan">
              {d.enrollments.map((x) => (
                <button key={x.id} type="button" role="radio" aria-checked={x.id === e?.id} onClick={() => setFocus(x.id)} data-testid={`button-focus-${x.id}`}
                  className={`rounded-full px-3 py-1 text-xs ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${x.id === e?.id ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card ring-border hover:ring-accent'}`}>
                  {x.course.title}
                </button>
              ))}
            </div>
          )}
          <Coach
            contextKey={`next:${e?.id ?? 'none'}`}
            contextLabel={e ? `Next step · ${e.course.title}` : 'Choosing a first pathway'}
            courseId={e?.course.id}
            tool="planner"
            moves={e ? [
              { id: 'plan', level: 'Plan', label: 'Plan my next 5 hours', request: 'Using my actual progress, plan my next 5 hours as small concrete blocks, starting with the next unfinished module. Include one self-check at the end of each block.' },
              { id: 'gap', level: 'Analyse', label: 'Where am I falling behind?', request: 'Compare my module progress with my logged hours and tell me honestly where the imbalance is and what to prioritise this week.' },
              { id: 'ready', level: 'Reflect', label: 'Am I ready for the project?', request: 'Based on what is done and not done, what should I be able to explain before I start the final deliverable? Ask me two readiness questions.' },
            ] : [
              { id: 'choose', level: 'Plan', label: 'Help me choose', request: 'I have not enrolled in any pathway yet. Ask me two questions about my interests and time, then suggest how to choose between internships for my discipline.' },
            ]}
            getContext={() => e && p ? [
              `Student: ${d.user?.discipline ?? ''} at ${d.user?.college ?? ''}`,
              `Internship: ${e.course.title} (${e.hours}-hour pathway, status ${statusLabel(e.status)})`,
              `Modules done ${p.done}/${p.mods.length}. Hours logged ${e.loggedHours}/${e.hours}.`,
              `Done: ${p.mods.filter((m) => e.completedModules.includes(m.id)).map((m) => m.title).join('; ') || 'none'}`,
              `Remaining: ${remaining.map((m) => `${m.title} (${e.hours === 60 ? m.hours60 : m.hours120}h)`).join('; ') || 'none'}`,
              `Deliverable: ${e.course.deliverable}`,
              `Other pathways: ${d.enrollments.filter((x) => x.id !== e.id).map((x) => x.course.title).join('; ') || 'none'}`,
            ].join('\n') : `Student: ${d.user?.discipline ?? ''} at ${d.user?.college ?? ''}. No enrollments yet.`}
            intro="Built from your real progress. It suggests; you decide and tick modules yourself."
            onClose={() => setOpen(false)}
            testId="coach-next"
          />
        </div>
      )}
    </section>
  );
}
