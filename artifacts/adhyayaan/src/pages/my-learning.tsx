import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpenText, Check, Loader2, UserRound, MessagesSquare } from 'lucide-react';
import { Coach, CoachToggle, MODULE_MOVES, moduleContext } from '@/components/app/coach';
import { useListEnrollments, useUpdateEnrollment, getListEnrollmentsQueryKey, type Enrollment } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CardSkeletons, Empty, ErrorPanel, Meter, PageHeader, SignInWall } from '@/components/app/bits';
import { errMsg, formatHours, formatIndiaDate, ordinal, pacingLabel, progressOf, statusLabel, useAuth, useInvalidateAll, useTitle } from '@/lib/app';

function Pathway({ e }: { e: Enrollment }) {
  const upd = useUpdateEnrollment();
  const inval = useInvalidateAll();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [coachFor, setCoachFor] = useState<string | null>(null);
  const p = progressOf(e);
  const locked = statusLabel(e.status) === 'Awaiting mentor review';
  const moduleSchedule = new Map(e.pacing.moduleSchedule.map((item) => [item.moduleId, item]));

  const toggle = async (id: string) => {
    const next = e.completedModules.includes(id) ? e.completedModules.filter((x) => x !== id) : [...e.completedModules, id];
    setBusy(id);
    try {
      await upd.mutateAsync({ id: e.id, data: { completedModules: next } });
      await inval();
    } catch (err) {
      toast({ title: 'Could not update module', description: errMsg(err), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id={`pathway-${e.course.id}`} className="ink-card rise scroll-mt-24 overflow-hidden" data-testid={`pathway-${e.id}`}>
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_220px]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{e.course.category} · {e.hours}-hour pathway · {statusLabel(e.status)}</p>
          <Link href={`/courses/${e.course.id}`} className="mt-1 block font-display text-2xl font-semibold text-primary hover:text-accent" data-testid={`link-course-${e.id}`}>{e.course.title}</Link>
          <p className="mt-1 text-xs text-muted-foreground">Started {formatIndiaDate(e.pacing.startDate, true)}</p>
          <div className="mt-3 flex min-w-0 items-start gap-2 text-sm" data-testid={`assigned-guide-${e.id}`}>
            <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            {e.assignedGuide ? (
              <p className="min-w-0">
                <span className="font-semibold text-primary">Your Internship Guide: {e.assignedGuide.name}</span>
                <span className="block break-all text-xs text-muted-foreground">{e.assignedGuide.email}</span>
              </p>
            ) : <p className="text-muted-foreground">A guide has not been assigned yet. The programme team can match one when available.</p>}
          </div>
          {e.course.id === '01' && (
            <div className="mt-5 rounded-2xl border border-[hsl(var(--ledger))]/25 bg-[hsl(var(--ledger-soft))] p-4 sm:flex sm:items-center sm:justify-between sm:gap-5" data-testid={`card-study-action-${e.id}`}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--ledger))] text-white"><BookOpenText className="h-5 w-5" /></span>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--ledger))]">Your study book is ready</p>
                  <p className="font-display text-lg font-semibold text-primary">Read with Adhya, chapter by chapter</p>
                  <p className="text-xs text-muted-foreground">Reading is your personal study record, separate from internship hours.</p>
                </div>
              </div>
              <Button asChild className="mt-3 w-full shrink-0 bg-[hsl(var(--ledger))] hover:bg-[hsl(var(--ledger))]/90 sm:mt-0 sm:w-auto" data-testid={`button-study-primary-${e.id}`}><Link href="/study/01">Open study book <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div><div className="mb-1 flex justify-between text-xs"><span>Module progress</span><span className="font-mono">{p.modulePct}% · {p.done}/{p.mods.length}</span></div><Meter value={p.modulePct} /></div>
          <div><div className="mb-1 flex justify-between text-xs"><span>Logged hours</span><span className="font-mono">{e.loggedHours}/{e.hours}</span></div><Meter value={p.hourPct} tone="accent" /></div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-[hsl(var(--ledger-soft))]/45 px-4 py-3 sm:px-6">
        <p className="text-sm text-muted-foreground">{e.assignedGuide ? `Talk with ${e.assignedGuide.name} about your project work.` : 'Your conversation will be ready when a guide is assigned.'}</p>
        <Button asChild size="sm" variant="outline" data-testid={`button-mentorship-${e.id}`}><Link href={`/mentorship/${e.id}`}><MessagesSquare className="mr-2 h-4 w-4" />Open guide conversation</Link></Button>
      </div>
      <div className="mx-4 mb-5 rounded-2xl border bg-secondary/30 p-4 sm:mx-6 sm:p-5" data-testid={`pace-detail-${e.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">Your {e.pacing.durationWeeks}-week plan</p>
            <p className="mt-1 text-sm font-semibold text-primary" data-testid={`pace-detail-status-${e.id}`}>
              {pacingLabel(e.pacing.status, e.pacing.deltaDays)}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Target date · {formatIndiaDate(e.pacing.targetDate, true)}</p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="mb-1 flex flex-wrap justify-between gap-1 text-xs text-muted-foreground">
              <span>Module-weighted progress</span>
              <span>{e.pacing.completedPercent}% complete · {e.pacing.expectedPercent}% expected by today</span>
            </div>
            <Meter value={e.pacing.completedPercent} tone="accent" />
          </div>
          <p className="text-xs text-muted-foreground sm:text-right">
            {e.pacing.completedHours} of {e.pacing.totalHours} estimated module hours complete
          </p>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          The estimate is based on modules you have marked complete. It is not the same as practical hours in your logbook.
        </p>
        {e.pacing.cohortPercentile !== null ? (
          <p className="mt-2 text-xs text-muted-foreground" data-testid={`cohort-detail-${e.id}`}>
            Your completion is around the {ordinal(e.pacing.cohortPercentile)} percentile among learners in this course and pathway who enrolled on the same day.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground" data-testid={`cohort-detail-${e.id}`}>
            A peer comparison appears when at least five learners match this course, pathway and enrolment date.
          </p>
        )}
      </div>
      <ul className="divide-y border-t">
        {p.mods.map((m, i) => {
          const done = e.completedModules.includes(m.id);
          const schedule = moduleSchedule.get(m.id);
          return (
            <li key={m.id}>
              <div className="flex flex-wrap items-center gap-2 p-3 hover:bg-secondary/60 sm:flex-nowrap sm:py-0 sm:pl-0 sm:pr-4">
              <button onClick={() => toggle(m.id)} disabled={!!busy || locked} data-testid={`button-module-${m.id}`}
                className="group flex min-w-0 basis-full items-center gap-3 py-2 text-left transition-colors disabled:cursor-not-allowed sm:flex-1 sm:basis-auto sm:gap-4 sm:px-6 sm:py-3.5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${done ? 'scale-105 border-accent bg-accent text-accent-foreground' : 'border-border group-hover:border-accent'}`}>
                  {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <Check className="h-4 w-4" /> : <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block ${done ? 'text-muted-foreground line-through decoration-accent/60' : ''}`}>{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.type} · {formatHours(schedule?.estimatedHours ?? 0)} planned hrs · Week {schedule?.startWeek ?? 1}{schedule && schedule.endWeek !== schedule.startWeek ? `–${schedule.endWeek}` : ''}
                    {schedule && <> · {formatIndiaDate(schedule.startDate)}–{formatIndiaDate(schedule.endDate)}</>}
                  </span>
                </span>
              </button>
              <CoachToggle size="sm" open={coachFor === m.id} onClick={() => setCoachFor((x) => (x === m.id ? null : m.id))} label="Coach" testId={`button-coach-${e.id}-${m.id}`} />
              </div>
              {coachFor === m.id && (
                <div className="px-4 pb-4 md:px-6">
                  <Coach
                    contextKey={`learn:${e.id}:${m.id}`}
                    contextLabel={m.title}
                    courseId={e.course.id}
                    moves={MODULE_MOVES}
                    getContext={() => moduleContext(e.course, m, e.hours, `Student marked this module as ${done ? 'done' : 'not yet done'}. Modules done: ${p.done}/${p.mods.length}. Hours logged: ${e.loggedHours}/${e.hours}.`)}
                    intro="Use this before you tick the module: can you explain it back?"
                    onClose={() => setCoachFor(null)}
                    testId={`coach-${e.id}-${m.id}`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2 border-t bg-secondary/40 px-6 py-4">
        <Button asChild size="sm" variant="outline" data-testid={`button-log-${e.id}`}><Link href="/logbook">Log hours</Link></Button>
        <Button asChild size="sm" variant="outline" data-testid={`button-practice-${e.id}`}><Link href={`/practice?course=${e.course.id}`}>Adaptive practice</Link></Button>
        <Button asChild size="sm" data-testid={`button-project-${e.id}`}><Link href="/projects">Project & reflection</Link></Button>
      </div>
    </section>
  );
}

export default function MyLearning() {
  useTitle('My learning');
  const { user, isLoading } = useAuth();
  const q = useListEnrollments({ query: { enabled: !!user, queryKey: getListEnrollmentsQueryKey() } });
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id || !q.data) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [q.data]);
  return (
    <div>
      <PageHeader kicker="My learning" title="Tick it when you can explain it" sub="Mark a module done once you could teach it back to a classmate. That is the cognitive bar — understand, apply, analyse." />
      {isLoading ? <CardSkeletons n={2} h="h-64" /> : !user ? <SignInWall what="track your pathways" /> : q.isLoading ? <CardSkeletons n={2} h="h-64" /> : q.error ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <Empty title="No pathways yet" body="Pick an internship blueprint and a 60 or 120 hour track to begin." action={<Button asChild data-testid="button-empty-explore"><Link href="/explore">Explore internships</Link></Button>} />
      ) : <div className="space-y-6">{q.data.map((e) => <Pathway key={e.id} e={e} />)}</div>}
    </div>
  );
}
