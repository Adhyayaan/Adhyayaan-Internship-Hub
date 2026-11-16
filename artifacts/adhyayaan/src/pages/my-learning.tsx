import { useState } from 'react';
import { Link } from 'wouter';
import { Check, Loader2 } from 'lucide-react';
import { useListEnrollments, useUpdateEnrollment, getListEnrollmentsQueryKey, type Enrollment } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CardSkeletons, Empty, ErrorPanel, Meter, PageHeader, SignInWall } from '@/components/app/bits';
import { errMsg, progressOf, statusLabel, useAuth, useInvalidateAll, useTitle } from '@/lib/app';

function Pathway({ e }: { e: Enrollment }) {
  const upd = useUpdateEnrollment();
  const inval = useInvalidateAll();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const p = progressOf(e);
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
    <section className="ink-card rise overflow-hidden" data-testid={`pathway-${e.id}`}>
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_220px]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{e.course.category} · {e.hours}-hour pathway · {statusLabel(e.status)}</p>
          <Link href={`/courses/${e.course.id}`} className="mt-1 block font-display text-2xl font-semibold text-primary hover:text-accent" data-testid={`link-course-${e.id}`}>{e.course.title}</Link>
          <p className="mt-1 text-xs text-muted-foreground">Started {new Date(e.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="space-y-3">
          <div><div className="mb-1 flex justify-between text-xs"><span>Modules</span><span className="font-mono">{p.done}/{p.mods.length}</span></div><Meter value={p.modulePct} /></div>
          <div><div className="mb-1 flex justify-between text-xs"><span>Logged hours</span><span className="font-mono">{e.loggedHours}/{e.hours}</span></div><Meter value={p.hourPct} tone="accent" /></div>
        </div>
      </div>
      <ul className="divide-y border-t">
        {p.mods.map((m, i) => {
          const done = e.completedModules.includes(m.id);
          return (
            <li key={m.id}>
              <button onClick={() => toggle(m.id)} disabled={!!busy || locked} data-testid={`button-module-${m.id}`}
                className="group flex w-full items-center gap-4 px-6 py-3.5 text-left transition-colors hover:bg-secondary/60 disabled:cursor-not-allowed">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${done ? 'scale-105 border-accent bg-accent text-accent-foreground' : 'border-border group-hover:border-accent'}`}>
                  {busy === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <Check className="h-4 w-4" /> : <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block ${done ? 'text-muted-foreground line-through decoration-accent/60' : ''}`}>{m.title}</span>
                  <span className="text-xs text-muted-foreground">{m.type} · {e.hours === 60 ? m.hours60 : m.hours120} hrs</span>
                </span>
              </button>
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
  return (
    <div>
      <PageHeader kicker="My learning" title="Tick it when you can explain it" sub="Mark a module done once you could teach it back to a classmate. That is the cognitive bar — understand, apply, analyse." />
      {isLoading ? <CardSkeletons n={2} h="h-64" /> : !user ? <SignInWall what="track your pathways" /> : q.isLoading ? <CardSkeletons n={2} h="h-64" /> : q.error ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <Empty title="No pathways yet" body="Pick an internship blueprint and a 60 or 120 hour track to begin." action={<Button asChild data-testid="button-empty-explore"><Link href="/explore">Explore internships</Link></Button>} />
      ) : <div className="space-y-6">{q.data.map((e) => <Pathway key={e.id} e={e} />)}</div>}
    </div>
  );
}
