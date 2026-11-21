import { Link, useLocation } from 'wouter';
import { ArrowRight, FileText, Loader2, LogOut } from 'lucide-react';
import { useGetAssessment, useLogout } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ErrorPanel, PageHeader, Ring, SignInWall } from '@/components/app/bits';
import { errMsg, useAuth, useResetForSession, useTitle } from '@/lib/app';

export default function Profile() {
  useTitle('Profile');
  const { user, isLoading } = useAuth();
  const logout = useLogout();
  const assessment = useGetAssessment({ query: { enabled: !!user } });
  const reset = useResetForSession();
  const [, nav] = useLocation();
  const { toast } = useToast();
  const out = async () => {
    try { await logout.mutateAsync(); reset({ user: null }); nav('/'); }
    catch (e) { toast({ title: 'Could not sign out', description: errMsg(e), variant: 'destructive' }); }
  };
  if (isLoading) return <Skeleton className="h-72 rounded-3xl bg-secondary" />;
  if (!user) return <SignInWall what="see your profile" />;
  return (
    <div>
      <PageHeader kicker="Profile" title={user.name} />
      <div className="ink-card relative max-w-2xl overflow-hidden p-5 sm:p-8">
        <div className="absolute -right-6 -top-6 opacity-60"><Ring size={140} /></div>
        <dl className="relative grid gap-6 sm:grid-cols-2">
          {[['Email', user.email], ['College', user.college], ['Discipline', user.discipline]].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{k}</dt><dd className="mt-1 break-words text-lg" data-testid={`text-${k.toLowerCase()}`}>{v}</dd></div>
          ))}
        </dl>
        <Button variant="outline" onClick={out} disabled={logout.isPending} className="relative mt-8" data-testid="button-logout">
          {logout.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}Sign out
        </Button>
      </div>
      <section id="learning-reports" aria-labelledby="profile-learning-reports" className="ink-card mt-6 max-w-2xl scroll-mt-20 p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="profile-learning-reports" className="text-2xl font-semibold text-primary">Learning reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review your reasoning results, study suggestions and career ideas.</p>
          </div>
          <Button variant="outline" asChild><Link href="/assessment">{assessment.data?.draft ? 'Resume assessment' : assessment.data?.reports.length ? 'Retake assessment' : 'Take assessment'}</Link></Button>
        </div>
        {assessment.isLoading ? <Skeleton className="mt-5 h-16" /> : assessment.error ?
          <ErrorPanel error={assessment.error} onRetry={() => assessment.refetch()} /> : assessment.data?.reports.length ? (
            <ul className="mt-5 divide-y border-y">
              {assessment.data.reports.map((report, index) => (
                <li key={report.id}>
                  <Link href={`/profile/reports/${report.id}`} className="flex items-center gap-3 py-3 text-sm text-primary hover:underline">
                    <FileText aria-hidden className="h-4 w-4 shrink-0 text-accent" />
                    <span className="grow">{index === 0 ? 'Latest report' : 'Earlier report'} · {new Date(report.completedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-5 text-sm text-muted-foreground">No report yet. Complete the assessment to save one here.</p>}
        <Link href="/assessment/guide" className="mt-5 inline-block text-sm font-medium text-primary underline underline-offset-2">How we use your answers</Link>
      </section>
    </div>
  );
}
