import { useLocation } from 'wouter';
import { Loader2, LogOut } from 'lucide-react';
import { useLogout } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { PageHeader, Ring, SignInWall } from '@/components/app/bits';
import { errMsg, useAuth, useResetForSession, useTitle } from '@/lib/app';

export default function Profile() {
  useTitle('Profile');
  const { user, isLoading } = useAuth();
  const logout = useLogout();
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
      <div className="ink-card relative max-w-2xl overflow-hidden p-8">
        <div className="absolute -right-6 -top-6 opacity-60"><Ring size={140} /></div>
        <dl className="relative grid gap-6 sm:grid-cols-2">
          {[['Email', user.email], ['College', user.college], ['Discipline', user.discipline]].map(([k, v]) => (
            <div key={k}><dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{k}</dt><dd className="mt-1 text-lg" data-testid={`text-${k.toLowerCase()}`}>{v}</dd></div>
          ))}
        </dl>
        <Button variant="outline" onClick={out} disabled={logout.isPending} className="relative mt-8" data-testid="button-logout">
          {logout.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}Sign out
        </Button>
      </div>
    </div>
  );
}
