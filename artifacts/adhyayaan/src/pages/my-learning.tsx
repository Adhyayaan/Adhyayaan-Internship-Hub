import { chapterWeeks, dueDate, ScheduleBand } from '@/components/app/course-timeline';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpenText, Check, Loader2 } from 'lucide-react';
import { Coach, CoachToggle, MODULE_MOVES, moduleContext } from '@/components/app/coach';
import { type PathwayPace, useGetDashboard, useListEnrollments, useUpdateEnrollment, getListEnrollmentsQueryKey, type Enrollment } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CardSkeletons, Empty, ErrorPanel, Meter, PageHeader, SignInWall } from '@/components/app/bits';
import { errMsg, progressOf, statusLabel, useAuth, useInvalidateAll, useTitle } from '@/lib/app';

function Pathway({ e, plan }: { e: Enrollment; plan?: PathwayPace }) {
  const upd = useUpdateEnrollment();
  const inval = useInvalidateAll();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [coachFor, setCoachFor] = useState<string | null>(null);
  const p = progressOf(e);
  const weeks = chapterWeeks(p.mods, e.hours);
  const next = p.mods.findIndex(m => !e.completedModules.includes(m.id));
  const milestone = plan?.chapters[next];
  const locked = statusLabel(e.status) === 'Awaiting mentor review';

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
          <p className="text-sm text-muted-foreground">{e.hours}-hour pathway · {statusLabel(e.status)}</p>
          <Link href={`/courses/${e.course.id}`} className="mt-1 block font-display text-3xl font-semibold text-primary hover:text-accent">{e.course.title}</Link>
          {e.course.id === '01' && <Link href="/study/01" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-accent"><BookOpenText className="h-4 w-4"/>Open study book <ArrowRight className="h-4 w-4"/></Link>}
        </div>
        <div className="space-y-3">
          <div><div className="mb-1 flex justify-between text-xs"><span>Modules</span><span className="font-mono">{p.done}/{p.mods.length}</span></div><Meter value={p.modulePct} /></div>
          <div><div className="mb-1 flex justify-between text-xs"><span>Logged hours</span><span className="font-mono">{e.loggedHours}/{e.hours}</span></div><Meter value={p.hourPct} tone="accent" /></div>
        </div>
      </div>
      <ScheduleBand hours={e.hours} start={plan?.start} end={plan?.end} />
      <div className="border-l-4 border-accent bg-primary px-5 py-5 text-primary-foreground sm:px-7">
        <p className="text-sm opacity-80">{next >= 0 ? 'Next milestone' : 'Chapter timeline complete'}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{p.mods[next]?.title ?? 'Project and reflection'}</p>
        {next >= 0 && <p className="mt-2 text-sm">{weeks[next]}{milestone && ` · Due ${dueDate(milestone.due)}`}</p>}
      </div>
      <ul className="divide-y border-t">
        {p.mods.map((m, i) => {
          const done = e.completedModules.includes(m.id);
          return (
            <li key={m.id}>
              {(i === 0 || weeks[i] !== weeks[i - 1]) && <h3 className="border-b bg-secondary/70 px-5 py-2 text-sm font-semibold text-primary sm:px-7">{weeks[i]}</h3>}
              <div className="flex flex-wrap items-center gap-2 p-3 hover:bg-secondary/60 sm:flex-nowrap sm:py-0 sm:pl-0 sm:pr-4">
              <button onClick={() => toggle(m.id)} aria-pressed={done} disabled={!!busy || locked} data-testid={`button-module-${m.id}`}
                className="group flex min-w-0 basis-full items-center gap-3 py-2 text-left transition-colors disabled:cursor-not-allowed sm:flex-1 sm:basis-auto sm:gap-4 sm:px-6 sm:py-3.5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${done ? 'scale-105 border-accent bg-accent text-accent-foreground' : 'border-border group-hover:border-accent'}`}>
                  {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <Check className="h-4 w-4" /> : <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block ${done ? 'text-muted-foreground line-through decoration-accent/60' : ''}`}>{m.title}</span>
                  <span className="text-xs text-muted-foreground">{e.hours === 60 ? m.hours60 : m.hours120} hrs{plan?.chapters[i] && ` · Due ${dueDate(plan.chapters[i].due)}`}</span>
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
  const [chosen, setChosen] = useState('');
  const dashboard = useGetDashboard({ query: { enabled: !!user } });
  const q = useListEnrollments({ query: { enabled: !!user, queryKey: getListEnrollmentsQueryKey() } });
  const active = q.data?.find(e => e.id === chosen) ?? q.data?.find(e => 'pathway-'+e.course.id === window.location.hash.slice(1)) ?? q.data?.[0];
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id || !q.data) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [q.data]);
  return (
    <div>
      <PageHeader kicker="My learning" title="Course timeline" sub="Your chapter deadlines and progress, week by week." />
      {isLoading ? <CardSkeletons n={2} h="h-64" /> : !user ? <SignInWall what="track your pathways" /> : q.isLoading ? <CardSkeletons n={2} h="h-64" /> : q.error ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <Empty title="No pathways yet" body="Pick an internship blueprint and a 60 or 120 hour track to begin." action={<Button asChild data-testid="button-empty-explore"><Link href="/explore">Explore internships</Link></Button>} />
      ) : <div className="space-y-4">
        {q.data.length > 1 && <label className="block text-sm font-medium">Internship
          <select className="mt-1 block w-full rounded-lg border bg-card p-3 sm:max-w-md" value={active?.id} onChange={event => setChosen(event.target.value)}>
            {q.data.map(e => <option key={e.id} value={e.id}>{e.course.title}</option>)}
          </select></label>}
        {active && <Pathway key={active.id} e={active} plan={dashboard.data?.pacing?.find(p => p.enrollmentId === active.id)} />}
      </div>}
    </div>
  );
}
