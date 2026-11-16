import { useState } from 'react';
import { Coach, CoachToggle, MODULE_MOVES, moduleContext } from '@/components/app/coach';
import type { Course, Module } from '@workspace/api-client-react';
import { Link, useLocation, useParams } from 'wouter';
import { ArrowLeft, Check, FileWarning, Loader2 } from 'lucide-react';
import { useEnroll, useGetCourse, useListEnrollments, getListEnrollmentsQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { ErrorPanel } from '@/components/app/bits';
import { toneFor } from '@/components/app/course-card';
import { authHref, errMsg, fmtINR, useAuth, useInvalidateAll, useTitle } from '@/lib/app';

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const q = useGetCourse(id);
  const { user } = useAuth();
  const enr = useListEnrollments({ query: { enabled: !!user, queryKey: getListEnrollmentsQueryKey() } });
  const enroll = useEnroll();
  const inval = useInvalidateAll();
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [hours, setHours] = useState<60 | 120>(60);
  useTitle(q.data?.title ?? 'Internship blueprint');

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-56 rounded-3xl bg-secondary" /><Skeleton className="h-96 rounded-3xl bg-secondary" /></div>;
  if (q.error || !q.data) return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  const existing = enr.data?.find((e) => e.course.id === c.id);
  const mods = c.modules.filter((m) => (hours === 60 ? m.hours60 > 0 : m.hours120 > 0 || m.hours60 > 0));

  const doEnroll = async () => {
    if (!user) return nav(authHref('login', `/courses/${c.id}`));
    try {
      await enroll.mutateAsync({ data: { courseId: c.id, hours } });
      await inval();
      toast({ title: 'Pathway started', description: `${c.title} · ${hours} hours. Free learning preview.` });
      nav('/my-learning');
    } catch (e) {
      toast({ title: 'Could not enroll', description: errMsg(e), variant: 'destructive' });
    }
  };

  return (
    <div>
      <Link href="/explore" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary" data-testid="link-back"><ArrowLeft className="h-4 w-4" /> All internships</Link>
      <section className={`rise relative overflow-hidden rounded-[2rem] p-7 md:p-10 ${toneFor(c.category)}`}>
        <div className="alpona-dots absolute inset-0 opacity-25" />
        <div className="relative max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-80">{c.category} · {c.mode}</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] md:text-6xl" data-testid="text-course-title">{c.title}</h1>
          <p className="mt-4 text-lg opacity-85">{c.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {c.disciplines.map((d) => <span key={d} className="rounded-full bg-black/10 px-3 py-1 text-xs">{d}</span>)}
          </div>
        </div>
      </section>

      {(c.draft || c.extendedDraft) && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-dashed border-accent/60 bg-accent/5 p-4 text-sm" data-testid="status-draft">
          <FileWarning className="h-5 w-5 shrink-0 text-accent" />
          <p><strong>Course blueprint — draft lesson content.</strong> These modules come from planning workbooks, not finished teaching material.{c.extendedDraft && ' The extended 120-hour track is also a draft.'} Open the coach inside any module to go deeper on it.</p>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <h2 className="mb-1 font-display text-2xl font-semibold text-primary">Module blueprint</h2>
          <p className="mb-4 text-sm text-muted-foreground">{mods.length} modules apply to the {hours}-hour pathway.</p>
          <Accordion type="multiple" className="space-y-2">
            {mods.map((m, i) => (
              <AccordionItem key={m.id} value={m.id} className="ink-card border-none px-5" data-testid={`module-${m.id}`}>
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex items-center gap-4 text-left">
                    <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      <span className="block font-medium">{m.title}</span>
                      <span className="block text-xs font-normal text-muted-foreground">{m.type} · {hours === 60 ? m.hours60 : m.hours120} hrs</span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  <p className="whitespace-pre-line">{m.content || 'No draft notes for this module yet.'}</p>
                  <ModuleCoach course={c} m={m} hours={hours} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <div className="ink-card mt-6 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Final deliverable</p>
            <p className="mt-2 whitespace-pre-line">{c.deliverable}</p>
          </div>
        </section>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="ink-card p-6">
            <h3 className="font-display text-xl font-semibold text-primary">Choose your pathway</h3>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {([60, 120] as const).map((h) => (
                <button key={h} onClick={() => setHours(h)} data-testid={`button-hours-${h}`}
                  className={`rounded-2xl border-2 p-4 text-left transition-all ${hours === h ? 'border-accent bg-accent/5' : 'border-border hover:border-primary/30'}`}>
                  <span className="block font-display text-3xl font-semibold text-primary">{h}</span>
                  <span className="text-xs text-muted-foreground">hours · {fmtINR(h === 60 ? 500 : 1000)} indicative</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Recommended: {c.hours} hrs. Listed fees are indicative programme fees only. Nothing is charged here, and enrolling is not institutional approval.</p>
            {existing ? (
              <Button asChild className="mt-5 w-full" data-testid="button-go-learning"><Link href="/my-learning"><Check className="mr-2 h-4 w-4" /> Enrolled · {existing.hours} hrs — open</Link></Button>
            ) : (
              <Button onClick={doEnroll} disabled={enroll.isPending} className="mt-5 h-12 w-full bg-accent text-base hover:bg-accent/90" data-testid="button-enroll">
                {enroll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {user ? `Start free ${hours}-hour preview` : 'Sign in to enroll'}
              </Button>
            )}
          </div>
          {c.id === '01' && (
            <Link href="/study/01" className="ink-card lift mt-4 block overflow-hidden border-[hsl(var(--ledger))]/40 p-5" data-testid="link-course-study">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--ledger))]">Interactive study book · open to all</p>
              <p className="mt-1 font-display text-lg font-semibold text-primary">Read the textbook with a teacher</p>
              <p className="mt-1 text-sm text-muted-foreground">16 chapters with step-throughs, silent micro-videos and teach-back feedback. Reading is separate from internship hours.</p>
            </Link>
          )}
          <Link href={`/practice?course=${c.id}`} className="ink-card lift mt-4 block p-5" data-testid="link-course-practice">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Cognitive &amp; adaptive learning</p>
            <p className="mt-1 font-display text-lg font-semibold text-primary">Test yourself on this internship</p>
            <p className="mt-1 text-sm text-muted-foreground">Five questions across understand, apply and analyse that adapt to your score. Sign-in required.</p>
          </Link>
        </aside>
      </div>
    </div>
  );
}

function ModuleCoach({ course, m, hours }: { course: Course; m: Module; hours: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 space-y-3 pb-1">
      <CoachToggle open={open} onClick={() => setOpen((o) => !o)} label="Think this module through" testId={`button-coach-${m.id}`} />
      {open && (
        <Coach
          contextKey={`course:${course.id}:${m.id}:${hours}`}
          contextLabel={m.title}
          courseId={course.id}
          moves={MODULE_MOVES}
          getContext={() => moduleContext(course, m, hours)}
          intro="Pick a way in. The coach asks before it tells, so expect a question back."
          onClose={() => setOpen(false)}
          testId={`coach-${m.id}`}
        />
      )}
    </div>
  );
}
