import { useState } from 'react';
import { Link } from 'wouter';
import { Check, Circle, Loader2, Send } from 'lucide-react';
import { useListEnrollments, useUpdateEnrollment, getListEnrollmentsQueryKey, type Enrollment } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CardSkeletons, Empty, ErrorPanel, PageHeader, SignInWall } from '@/components/app/bits';
import { errMsg, progressOf, statusLabel, useAuth, useInvalidateAll, useTitle } from '@/lib/app';

const validUrl = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };

function ProjectCard({ e }: { e: Enrollment }) {
  const [url, setUrl] = useState(e.projectUrl);
  const [refl, setRefl] = useState(e.reflection);
  const upd = useUpdateEnrollment();
  const inval = useInvalidateAll();
  const { toast } = useToast();
  const [mode, setMode] = useState<'draft' | 'submit' | null>(null);
  const p = progressOf(e);
  const submitted = statusLabel(e.status) === 'Awaiting mentor review';
  const checks = [
    { ok: validUrl(url), l: 'A valid http(s) repository or project link' },
    { ok: refl.trim().length >= 30, l: `Reflection of at least 30 characters (${refl.trim().length})` },
    { ok: e.loggedHours >= e.hours, l: `Logged hours ${e.loggedHours}/${e.hours}` },
    { ok: p.done === p.mods.length && p.mods.length > 0, l: `All applicable modules done (${p.done}/${p.mods.length})` },
  ];
  const ready = checks.every((c) => c.ok);

  const save = async (submit: boolean) => {
    setMode(submit ? 'submit' : 'draft');
    try {
      await upd.mutateAsync({ id: e.id, data: { projectUrl: url.trim(), reflection: refl, submit } });
      await inval();
      toast({ title: submit ? 'Sent for mentor review' : 'Draft saved', description: submit ? 'Your mentor will review it. This is not automatic grading or approval.' : undefined });
    } catch (err) {
      toast({ title: 'Could not save', description: errMsg(err), variant: 'destructive' });
    } finally {
      setMode(null);
    }
  };

  return (
    <section className="ink-card rise grid gap-6 p-6 lg:grid-cols-[1.4fr_1fr]" data-testid={`project-${e.id}`}>
      <div className="space-y-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{e.hours}-hour pathway · {statusLabel(e.status)}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-primary">{e.course.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Deliverable: {e.course.deliverable}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`url-${e.id}`}>Repository or project URL</Label>
          <Input id={`url-${e.id}`} value={url} onChange={(ev) => setUrl(ev.target.value)} placeholder="https://github.com/you/project" disabled={submitted} maxLength={2000} data-testid={`input-url-${e.id}`} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`refl-${e.id}`}>Reflection</Label>
          <Textarea id={`refl-${e.id}`} value={refl} onChange={(ev) => setRefl(ev.target.value)} rows={7} maxLength={12000} disabled={submitted} placeholder="What did you build, what broke, what would you do differently? Bangla or English is fine." data-testid={`input-reflection-${e.id}`} />
        </div>
      </div>
      <div className="rounded-2xl bg-secondary/60 p-5">
        <h3 className="font-display text-lg font-semibold text-primary">Ready for your mentor?</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {checks.map((c) => (
            <li key={c.l} className={`flex items-start gap-2 ${c.ok ? '' : 'text-muted-foreground'}`}>
              {c.ok ? <Check className="mt-0.5 h-4 w-4 text-accent" /> : <Circle className="mt-0.5 h-4 w-4" />}{c.l}
            </li>
          ))}
        </ul>
        {submitted ? (
          <p className="mt-5 rounded-xl bg-primary p-3 text-sm text-primary-foreground" data-testid={`status-submitted-${e.id}`}>Awaiting mentor review. This is a submission, not approval or certification.</p>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            <Button variant="outline" onClick={() => save(false)} disabled={!!mode} data-testid={`button-save-draft-${e.id}`}>{mode === 'draft' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save draft</Button>
            <Button onClick={() => save(true)} disabled={!ready || !!mode} className="bg-accent hover:bg-accent/90" data-testid={`button-submit-${e.id}`}>{mode === 'submit' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Submit for mentor review</Button>
            {!ready && <p className="text-xs text-muted-foreground">Finish the checklist to submit. You can save a draft anytime.</p>}
          </div>
        )}
        <Button asChild variant="link" className="mt-2 px-0 text-primary" data-testid={`link-ai-review-${e.id}`}><Link href="/ai">Get formative AI feedback first</Link></Button>
      </div>
    </section>
  );
}

export default function Projects() {
  useTitle('Projects');
  const { user, isLoading } = useAuth();
  const q = useListEnrollments({ query: { enabled: !!user, queryKey: getListEnrollmentsQueryKey() } });
  return (
    <div>
      <PageHeader kicker="Projects" title="Show the work, then say what you learned" sub="A link to what you built plus an honest reflection. Your mentor reviews it — nothing here is auto-graded." />
      {isLoading ? <CardSkeletons n={1} h="h-80" /> : !user ? <SignInWall what="manage your projects" /> : q.isLoading ? <CardSkeletons n={1} h="h-80" /> : q.error ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <Empty title="No project yet" body="Projects belong to a pathway. Enroll first, then return here." action={<Button asChild data-testid="button-empty-explore"><Link href="/explore">Explore internships</Link></Button>} />
      ) : <div className="space-y-6">{q.data.map((e) => <ProjectCard key={e.id} e={e} />)}</div>}
    </div>
  );
}
