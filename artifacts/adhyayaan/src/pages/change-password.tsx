import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation } from 'wouter';
import { ArrowRight, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useCompleteInitialPasswordChange } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { errMsg, useAuth, useResetForSession, useTitle } from '@/lib/app';

const passwordFormSchema = z.object({
  newPassword: z.string().min(10, 'Use at least 10 characters.').max(128, 'Use no more than 128 characters.'),
  confirmPassword: z.string().min(10, 'Enter the new password again.').max(128, 'Use no more than 128 characters.'),
}).refine((values) => values.newPassword === values.confirmPassword, {
  message: 'The passwords do not match. Check both fields and try again.',
  path: ['confirmPassword'],
});
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

export default function ChangePasswordPage() {
  useTitle('Set a new password');
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const resetSession = useResetForSession();
  const completeChange = useCompleteInitialPasswordChange();
  const [error, setError] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  const submit = async (values: PasswordFormValues) => {
    setError('');
    try {
      const session = await completeChange.mutateAsync({ data: { newPassword: values.newPassword } });
      resetSession(session);
      passwordForm.reset({ newPassword: '', confirmPassword: '' });
      setIsComplete(true);
      navigate(session.user?.isGuide ? '/guide' : session.user?.isSuperadmin ? '/superadmin' : session.user?.isAdmin ? '/admin' : '/', { replace: true });
    } catch (requestError) {
      setError(errMsg(requestError));
    }
  };

  if (isLoading) return <div className="flex min-h-[100dvh] items-center justify-center bg-background p-5" aria-busy="true" data-testid="status-password-session-loading"><div className="w-full max-w-md space-y-4"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-32" /><Skeleton className="h-12" /></div></div>;
  if (!user) return <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-10">
    <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[18px] border-dashed border-accent/10" />
    <section className="ink-card relative w-full max-w-lg p-6 text-center sm:p-9" data-testid="panel-password-sign-in">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><KeyRound className="h-6 w-6" /></span>
      <p className="mt-5 font-mono text-[10px] uppercase tracking-[.18em] text-accent">Secure account setup</p>
      <h1 className="mt-2 font-display text-3xl font-black text-primary">Sign in to continue</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">Sign in with the temporary password provided by your platform operator. You will then set a new password here.</p>
      <Button asChild className="mt-6 min-h-11 w-full"><Link href="/login?next=%2Fchange-password" data-testid="link-password-sign-in">Go to sign in <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
    </section>
  </main>;
  if (!user.mustChangePassword) return <main className="flex min-h-[100dvh] items-center justify-center bg-background p-5" data-testid="status-password-already-set">
    <section className="ink-card w-full max-w-lg p-6 text-center sm:p-9">
      <ShieldCheck className="mx-auto h-10 w-10 text-[hsl(var(--ledger))]" />
      <h1 className="mt-4 font-display text-2xl font-black text-primary">Your account is ready</h1>
      <p className="mt-2 text-sm text-muted-foreground">This account does not need an initial password change.</p>
      <Button asChild className="mt-5 min-h-11"><Link href={user.isGuide ? '/guide' : user.isSuperadmin ? '/superadmin' : user.isAdmin ? '/admin' : '/'} data-testid="link-password-workspace">Open your workspace <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
    </section>
  </main>;

  return <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-4 py-8 sm:py-12" data-testid="page-change-password">
    <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[18px] border-dashed border-accent/10" />
    <section className="ink-card relative w-full max-w-xl overflow-hidden">
      <div className="bg-primary px-6 py-6 text-primary-foreground sm:px-9 sm:py-8">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary-foreground/10"><KeyRound className="h-6 w-6 text-[hsl(var(--turmeric))]" /></span>
          <div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/65">First sign-in · Guide account</p><h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">Set your own password</h1><p className="mt-2 text-sm leading-relaxed text-primary-foreground/75">Before opening your guide workspace, replace the temporary password with one only you know.</p></div>
        </div>
      </div>
      <Form {...passwordForm}>
      <form onSubmit={passwordForm.handleSubmit(submit)} className="space-y-5 p-5 sm:p-8" data-testid="form-change-password">
        <div className="rounded-xl border border-border bg-secondary/50 p-3 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline h-4 w-4 text-[hsl(var(--ledger))]" />Choose a password you have not used before. It must be 10–128 characters.</div>
        <FormField control={passwordForm.control} name="newPassword" render={({ field }) => <FormItem className="space-y-1.5">
          <FormLabel className="text-sm font-bold text-primary">New password</FormLabel>
          <FormControl><Input {...field} id="new-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} className="h-12 rounded-xl bg-card px-4" data-testid="input-new-password" /></FormControl>
          <FormDescription>At least 10 characters. Do not reuse your temporary password.</FormDescription>
          <FormMessage />
        </FormItem>} />
        <FormField control={passwordForm.control} name="confirmPassword" render={({ field }) => <FormItem className="space-y-1.5">
          <FormLabel className="text-sm font-bold text-primary">Confirm new password</FormLabel>
          <FormControl><Input {...field} id="confirm-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} className="h-12 rounded-xl bg-card px-4" data-testid="input-confirm-password" /></FormControl>
          <FormMessage />
        </FormItem>} />
        {error && <p role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-change-password-error">{error}</p>}
        {isComplete && <p role="status" className="rounded-xl border border-[hsl(var(--ledger)/.25)] bg-[hsl(var(--ledger-soft))] p-3 text-sm text-[hsl(var(--ledger))]" data-testid="text-password-change-success">Password updated. Opening your guide workspace…</p>}
        <Button type="submit" disabled={completeChange.isPending} className="min-h-12 w-full rounded-xl text-base" data-testid="button-save-new-password">
          {completeChange.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving password</> : <>Save new password <ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Signed in as {user.email}</p>
      </form>
      </Form>
    </section>
  </main>;
}
