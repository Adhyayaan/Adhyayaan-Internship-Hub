import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useLogin, useRegister } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errMsg, useResetForSession, useTitle } from '@/lib/app';

function Frame({ children, title, sub }: { children: ReactNode; title: ReactNode; sub: string }) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:block">
        <img src={`${import.meta.env.BASE_URL}hero.png`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/30 to-transparent" />
        <div className="absolute bottom-0 p-12">
          <p className="font-display text-4xl leading-tight">"Adhyayan" — the practice of study.<br /><em className="text-[hsl(40_88%_62%)]">Understand, apply, analyse.</em></p>
          <p className="mt-3 text-primary-foreground/70">Cognitive, adaptive learning for final-year internships across West Bengal.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="rise w-full max-w-md">
          <Link href="/" className="mb-10 flex items-center gap-2.5" data-testid="link-home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent font-display text-lg font-bold text-accent-foreground">অ</span>
            <span className="font-display text-xl font-semibold text-primary">Adhyayaan</span>
          </Link>
          <h1 className="font-display text-4xl font-semibold text-primary">{title}</h1>
          <p className="mt-2 text-muted-foreground">{sub}</p>
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, ...p }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} className="h-11 bg-card" data-testid={`input-${id}`} {...p} /></div>;
}

export function Login() {
  useTitle('Sign in');
  const login = useLogin();
  const reset = useResetForSession();
  const [, nav] = useLocation();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    try { const s = await login.mutateAsync({ data: { email: f.email.trim(), password: f.password } }); reset(s); nav('/'); }
    catch (x) { setErr(errMsg(x)); }
  };
  return (
    <Frame title={<>Welcome back.</>} sub="Sign in to continue your pathway.">
      <form onSubmit={submit} className="space-y-4">
        <Field id="email" label="Email" type="email" autoComplete="email" maxLength={254} required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Field id="password" label="Password" type="password" autoComplete="current-password" minLength={10} maxLength={128} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {err && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-auth-error">{err}</p>}
        <Button type="submit" disabled={login.isPending} className="h-11 w-full bg-accent text-base hover:bg-accent/90" data-testid="button-login">{login.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign in</Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">New here? <Link href="/register" className="font-medium text-accent hover:underline" data-testid="link-register">Create an account</Link></p>
    </Frame>
  );
}

export function Register() {
  useTitle('Create account');
  const reg = useRegister();
  const reset = useResetForSession();
  const [, nav] = useLocation();
  const [f, setF] = useState({ name: '', email: '', password: '', college: '', discipline: '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (f.password.length < 10) return setErr('Password needs at least 10 characters.');
    try { const s = await reg.mutateAsync({ data: { ...f, name: f.name.trim(), email: f.email.trim(), college: f.college.trim(), discipline: f.discipline.trim() } }); reset(s); nav('/explore'); }
    catch (x) { setErr(errMsg(x)); }
  };
  return (
    <Frame title={<>Start your <em className="text-accent">workspace</em>.</>} sub="Free. Your account starts empty — you build it, one hour at a time.">
      <form onSubmit={submit} className="space-y-4">
        <Field id="name" label="Full name" minLength={2} maxLength={100} required value={f.name} onChange={set('name')} autoComplete="name" />
        <Field id="email" label="Email" type="email" maxLength={254} required value={f.email} onChange={set('email')} autoComplete="email" />
        <Field id="password" label="Password (10+ characters)" type="password" minLength={10} maxLength={128} required value={f.password} onChange={set('password')} autoComplete="new-password" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="college" label="College" maxLength={200} required value={f.college} onChange={set('college')} placeholder="e.g. Jadavpur University" />
          <Field id="discipline" label="Discipline" maxLength={100} required value={f.discipline} onChange={set('discipline')} placeholder="e.g. B.Tech ECE" />
        </div>
        {err && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-auth-error">{err}</p>}
        <Button type="submit" disabled={reg.isPending} className="h-11 w-full bg-accent text-base hover:bg-accent/90" data-testid="button-register">{reg.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create account</Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">Already registered? <Link href="/login" className="font-medium text-accent hover:underline" data-testid="link-login">Sign in</Link></p>
    </Frame>
  );
}
