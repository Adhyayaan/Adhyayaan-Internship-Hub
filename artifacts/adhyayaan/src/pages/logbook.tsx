import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useCreateLog, useDeleteLog, useListEnrollments, useListLogs, getListEnrollmentsQueryKey, getListLogsQueryKey } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Coach, CoachToggle } from '@/components/app/coach';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { CardSkeletons, Empty, ErrorPanel, PageHeader, SignInWall } from '@/components/app/bits';
import { errMsg, useAuth, useInvalidateAll, useTitle } from '@/lib/app';

const today = () => new Date().toLocaleDateString('en-CA');

export default function Logbook() {
  useTitle('Logbook');
  const { user, isLoading } = useAuth();
  const enr = useListEnrollments({ query: { enabled: !!user, queryKey: getListEnrollmentsQueryKey() } });
  const logs = useListLogs({ query: { enabled: !!user, queryKey: getListLogsQueryKey() } });
  const create = useCreateLog();
  const del = useDeleteLog();
  const inval = useInvalidateAll();
  const { toast } = useToast();
  const [f, setF] = useState({ enrollmentId: '', date: today(), hours: '2', activity: '', learning: '' });
  const [err, setErr] = useState<string | null>(null);
  const [coach, setCoach] = useState(false);
  const titles = useMemo(() => Object.fromEntries((enr.data ?? []).map((e) => [e.id, e.course.title])), [enr.data]);
  const sorted = useMemo(() => [...(logs.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [logs.data]);
  const total = sorted.reduce((s, l) => s + l.hours, 0);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const h = Number(f.hours);
    const enrollmentId = f.enrollmentId || enr.data?.[0]?.id || '';
    if (!enrollmentId) return setErr('Choose a pathway.');
    if (!(h >= 0.25 && h <= 12)) return setErr('Hours must be between 0.25 and 12 for a day.');
    if (f.activity.trim().length < 5 || f.learning.trim().length < 5) return setErr('Describe the activity and the learning in at least 5 characters each.');
    setErr(null);
    try {
      await create.mutateAsync({ data: { enrollmentId, date: f.date, hours: h, activity: f.activity.trim(), learning: f.learning.trim() } });
      await inval();
      setF({ ...f, activity: '', learning: '' });
      toast({ title: `${h} hrs logged` });
    } catch (e) {
      setErr(errMsg(e));
    }
  };

  const remove = async (id: string) => {
    try { await del.mutateAsync({ id }); await inval(); toast({ title: 'Entry deleted' }); }
    catch (e) { toast({ title: 'Could not delete', description: errMsg(e), variant: 'destructive' }); }
  };

  return (
    <div className="min-w-0">
      <PageHeader kicker="Practical logbook" title="What did your hands do today?" sub="Every entry pairs an activity with what it taught you. That pairing is what a mentor reads." />
      {isLoading ? <CardSkeletons n={2} /> : !user ? <SignInWall what="keep a logbook" /> : enr.isLoading ? <CardSkeletons n={2} /> : enr.error ? <ErrorPanel error={enr.error} onRetry={() => enr.refetch()} /> : !enr.data?.length ? (
        <Empty title="Logs need a pathway" body="Enroll in an internship first; each entry counts toward that pathway's hours." action={<Button asChild data-testid="button-empty-explore"><Link href="/explore">Explore internships</Link></Button>} />
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(17rem,23.75rem)_minmax(0,1fr)] lg:gap-8">
          <div className="min-w-0 space-y-4 self-start">
          <form onSubmit={submit} className="ink-card min-w-0 space-y-4 p-4 sm:p-6" data-testid="form-log">
            <h2 className="font-display text-xl font-semibold text-primary">New entry</h2>
            <div className="space-y-1.5">
              <Label htmlFor="logbook-enrollment">Pathway</Label>
              <Select value={f.enrollmentId || enr.data[0].id} onValueChange={(v) => setF({ ...f, enrollmentId: v })}>
                <SelectTrigger id="logbook-enrollment" data-testid="select-enrollment"><SelectValue /></SelectTrigger>
                <SelectContent>{enr.data.map((e) => <SelectItem key={e.id} value={e.id}>{e.course.title} · {e.hours}h</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3">
              <div className="space-y-1.5"><Label htmlFor="date">Date</Label><Input id="date" type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} required data-testid="input-date" /></div>
              <div className="space-y-1.5"><Label htmlFor="hours">Hours</Label><Input id="hours" type="number" step="0.25" min="0.25" max="12" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} required data-testid="input-hours" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="act">Activity</Label><Textarea id="act" rows={3} maxLength={2000} value={f.activity} onChange={(e) => setF({ ...f, activity: e.target.value })} placeholder="Wired the soil sensor to the ESP32 and calibrated it" data-testid="input-activity" /></div>
            <div className="space-y-1.5"><Label htmlFor="learn">What I learned</Label><Textarea id="learn" rows={3} maxLength={3000} value={f.learning} onChange={(e) => setF({ ...f, learning: e.target.value })} placeholder="Why analog readings drift and how to average them" data-testid="input-learning" /></div>
            {err && <p className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive" data-testid="text-log-error">{err}</p>}
            <Button type="submit" disabled={create.isPending} className="w-full bg-accent hover:bg-accent/90" data-testid="button-add-log">
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add entry
            </Button>
            <div className="border-t border-dashed pt-4">
              <CoachToggle open={coach} onClick={() => setCoach((o) => !o)} label="Reflect on this entry" testId="button-coach-log" />
            </div>
          </form>
            {coach && (() => {
              const eid = f.enrollmentId || enr.data[0].id;
              const pe = enr.data.find((x) => x.id === eid);
              return (
                <Coach
                  contextKey={`log:${eid}`}
                  contextLabel={`Logbook · ${pe?.course.title ?? 'Pathway'}`}
                  courseId={pe?.course.id}
                  tool="review"
                  moves={[
                    { id: 'deepen', level: 'Reflect', label: 'Help me reflect deeper', request: 'Based on my current activity and learning notes, ask me 2 or 3 reflective questions that move from what I did to why it worked and what I would change. Do not write the log entry for me.' },
                    { id: 'link', level: 'Apply', label: 'Connect to my modules', request: 'Which concepts from this internship does my activity connect to? Name them and ask me to explain one connection in my own words.' },
                    { id: 'clarity', level: 'Analyse', label: 'Is my learning note specific?', request: 'Tell me whether my learning note is specific and evidence-based or vague. Point to the vague phrases and ask what evidence I could add. Do not invent activities or hours.' },
                  ]}
                  getContext={() => [
                    `Pathway: ${pe?.course.title ?? 'unknown'} (${pe?.hours ?? '?'}-hour, ${pe?.loggedHours ?? 0} hrs logged so far)`,
                    `Draft entry (not yet saved): date ${f.date}, ${f.hours} hours`,
                    `Activity: ${f.activity.trim() || '(not written yet)'}`,
                    `What I learned: ${f.learning.trim() || '(not written yet)'}`,
                  ].join('\n')}
                  intro="Reads the draft above as it is right now. It will not save or write entries for you."
                  onClose={() => setCoach(false)}
                  testId="coach-log"
                />
              );
            })()}
          </div>

          <section className="min-w-0">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="font-display text-2xl font-semibold text-primary">Entries</h2>
              <span className="font-mono text-sm text-muted-foreground" data-testid="text-total-hours">{total} hrs total</span>
            </div>
            {logs.isLoading ? <CardSkeletons n={3} h="h-24" /> : logs.error ? <ErrorPanel error={logs.error} onRetry={() => logs.refetch()} /> : sorted.length === 0 ? (
              <Empty title="A blank page, ready" body="Your first entry will appear here as a dated card." />
            ) : (
              <ol className="min-w-0 space-y-3">
                {sorted.map((l, i) => (
                  <li key={l.id} className="ink-card rise grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_2.5rem] items-start gap-2.5 p-3.5 sm:grid-cols-[3.5rem_minmax(0,1fr)_2.5rem] sm:gap-4 sm:p-5" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} data-testid={`log-${l.id}`}>
                    <div className="w-12 shrink-0 pt-1 text-center sm:w-14">
                      <p className="font-display text-3xl font-semibold leading-none text-primary">{new Date(l.date + 'T00:00').getDate()}</p>
                      <p className="font-mono text-[10px] uppercase text-muted-foreground">{new Date(l.date + 'T00:00').toLocaleDateString('en-IN', { month: 'short' })}</p>
                      <p className="mt-2 rounded-full bg-accent/10 px-1 py-0.5 font-mono text-[11px] text-accent">{l.hours}h</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs text-muted-foreground">{titles[l.enrollmentId] ?? 'Pathway'}</p>
                      <p className="mt-1 break-words text-sm leading-relaxed">{l.activity}</p>
                      <p className="mt-2 break-words border-l-2 border-accent/50 pl-3 text-sm leading-relaxed italic text-muted-foreground">{l.learning}</p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive" aria-label="Delete entry" data-testid={`button-delete-log-${l.id}`}><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete this entry?</AlertDialogTitle><AlertDialogDescription>{l.hours} hours on {l.date} will be removed from your pathway total.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={() => remove(l.id)} className="bg-destructive hover:bg-destructive/90" data-testid={`button-confirm-delete-${l.id}`}>Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
