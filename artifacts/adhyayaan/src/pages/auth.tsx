import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { ArrowRight, Compass, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useLogin, useRegister } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CoachMark } from '@/components/app/coach';
import { assessmentHref, authHref, errMsg, safeNext, useAuth, useResetForSession, useTitle } from '@/lib/app';

function useNext() {
  const search = useSearch();
  return safeNext(new URLSearchParams(search).get('next'), '');
}

const JOURNEY = [
  { k: 'Understand', bn: 'বোঝা', t: 'Read the lesson. Ask Adhya when you need an example.' },
  { k: 'Apply', bn: 'প্রয়োগ', t: 'Use the lesson in your project. Record what you did and learnt.' },
  { k: 'Analyse', bn: 'বিশ্লেষণ', t: 'Answer practice questions. Your answers help set your next level.' },
];

export function AuthSplash() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background" data-testid="status-session-loading" aria-busy="true">
      <div className="flex flex-col items-center gap-4">
        <img src={`${import.meta.env.BASE_URL}adhyayaan-logo.png`} alt="Adhyayaan" className="h-12 w-auto object-contain" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Opening your workspace</span>
      </div>
    </div>
  );
}

function Frame({ mode, children }: { mode: 'login' | 'register'; children: ReactNode }) {
  const next = useNext();
  return (
    <div className="auth-frame relative min-h-[100dvh] overflow-hidden bg-[hsl(232_52%_16%)] lg:grid lg:grid-cols-[1.02fr_1fr]">
      {/* Story side */}
      <div className="relative hidden overflow-hidden lg:block">
        <img src={`${import.meta.env.BASE_URL}hero.png`} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(232_52%_16%/.35)] via-[hsl(232_52%_16%/.55)] to-[hsl(232_52%_12%/.95)]" />
        <div className="alpona-dots absolute inset-0 opacity-25" />
        <div className="relative flex h-full flex-col justify-between p-12 text-[hsl(40_40%_94%)]">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(40_40%_94%/.72)]">
            <span className="h-px w-8 bg-[hsl(40_88%_62%)]" /> A learning journey rooted in practice
          </p>
          <div className="max-w-lg">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[hsl(40_88%_62%)]">Final-year internships · West Bengal</p>
            <h2 className="mt-4 font-display text-5xl font-semibold leading-[1.02] xl:text-6xl">
              Learn, practise and <em className="text-[hsl(40_88%_62%)]">build your project</em>.
            </h2>
            <ol className="mt-10 space-y-3">
              {JOURNEY.map((j, i) => (
                <li key={j.k} className="rise flex gap-4 rounded-2xl bg-[hsl(232_52%_12%/.55)] p-4 ring-1 ring-white/10 backdrop-blur-sm" style={{ animationDelay: `${200 + i * 120}ms` }}>
                  <span className="font-mono text-xs text-[hsl(40_88%_62%)]">0{i + 1}</span>
                  <div>
                    <p className="font-display text-lg font-semibold">{j.k} <span className="ml-1 text-sm font-normal opacity-60">{j.bn}</span></p>
                    <p className="text-sm opacity-75">{j.t}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <p className="flex items-center gap-2 text-xs opacity-60"><CoachMark className="h-3.5 w-3.5" /> Get study help in Bangla or English. It does not count towards your grade.</p>
        </div>
      </div>

      {/* Form side */}
      <div className="auth-form-side relative flex min-h-[100dvh] items-center justify-center bg-background px-5 py-8 sm:px-8 lg:rounded-l-[2.5rem] lg:py-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[18px] border-dashed border-accent/10" />
        <div className="auth-content relative w-full max-w-[440px]">
          <Link href="/" className="mb-6 inline-flex w-fit items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:mb-8" data-testid="link-home-mobile">
            <img src={`${import.meta.env.BASE_URL}adhyayaan-logo.png`} alt="Adhyayaan home" className="h-14 w-auto max-w-[240px] object-contain object-left sm:h-16" />
          </Link>
          <div className="relative mb-8 lg:hidden">
            <img src={`${import.meta.env.BASE_URL}hero.png`} alt="" className="h-36 w-full rounded-2xl object-cover" />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-primary/70 to-transparent" />
            <p className="absolute bottom-3 left-4 right-4 font-display text-lg leading-tight text-primary-foreground">A coach at every step of your internship.</p>
          </div>

          <div role="tablist" aria-label="Account" className="auth-tabs relative mb-7 grid grid-cols-2 rounded-full bg-secondary p-1">
            <span aria-hidden className={`absolute inset-y-1 w-[calc(50%-4px)] rounded-full bg-card shadow-sm ring-1 ring-border transition-transform duration-300 ${mode === 'login' ? 'translate-x-1' : 'translate-x-[calc(100%+4px)]'}`} />
            <Link href={authHref('login', next)} role="tab" aria-selected={mode === 'login'} data-testid="tab-login"
              className={`relative z-10 rounded-full py-2 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === 'login' ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}>Sign in</Link>
            <Link href={authHref('register', next)} role="tab" aria-selected={mode === 'register'} data-testid="tab-register"
              className={`relative z-10 rounded-full py-2 text-center text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === 'register' ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}>Create account</Link>
          </div>

          <section className="auth-panel">
            {children}
          </section>

          <div className="mt-8 flex items-center gap-3 border-t border-dashed pt-6">
            <Compass className="h-4 w-4 text-accent" />
            <p className="flex-1 text-sm text-muted-foreground">Just looking?</p>
            <Link href="/explore" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded" data-testid="link-browse">
              Browse internships <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, hint, ...p }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px] font-medium text-primary">{label}</Label>
      <Input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className="h-12 rounded-xl border-input bg-card px-4 text-[15px] transition-shadow focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 focus-visible:ring-offset-0" data-testid={`input-${id}`} {...p} />
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PasswordField({ id, label, hint, ...p }: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px] font-medium text-primary">{label}</Label>
      <div className="relative">
        <Input id={id} type={show ? 'text' : 'password'} aria-describedby={hint ? `${id}-hint` : undefined} className="h-12 rounded-xl border-input bg-card px-4 pr-12 text-[15px] focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 focus-visible:ring-offset-0" data-testid={`input-${id}`} {...p} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} aria-controls={id} data-testid={`button-toggle-${id}`}
          className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ErrorNote({ err }: { err: string | null }) {
  if (!err) return null;
  return <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-auth-error">{err}</p>;
}

function useSignedInRedirect(fallback: string) {
  const { user, isLoading } = useAuth();
  const next = useNext();
  const [, nav] = useLocation();
  useEffect(() => {
    if (!isLoading && user) {
      const destination = next || (user.isAdmin ? '/admin' : fallback);
      nav(user.assessmentRequired && !user.assessmentCompletedAt && !user.isAdmin ? assessmentHref(destination) : destination, { replace: true });
    }
  }, [isLoading, user, next, fallback, nav]);
  return { blocked: isLoading || !!user, next };
}

export function Login() {
  useTitle('Sign in');
  const login = useLogin();
  const reset = useResetForSession();
  const [, nav] = useLocation();
  const { blocked, next } = useSignedInRedirect('/');
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    try {
      const s = await login.mutateAsync({ data: { email: f.email.trim(), password: f.password } });
      reset(s);
      const destination = next || (s.user?.isAdmin ? '/admin' : '/');
      nav(s.user?.assessmentRequired && !s.user.assessmentCompletedAt && !s.user.isAdmin ? assessmentHref(destination) : destination, { replace: true });
    }
    catch (x) { setErr(errMsg(x)); }
  };
  if (blocked && !login.isPending && !login.isSuccess) return <AuthSplash />;
  return (
    <Frame mode="login">
      <h1 className="font-display text-4xl font-semibold leading-tight text-primary">Welcome back.</h1>
      <p className="mt-2 text-muted-foreground">{next ? 'Sign in and we will take you right back to where you were.' : 'Pick up your pathway exactly where you left it.'}</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate={false}>
        <Field id="email" label="Email" type="email" autoComplete="email" inputMode="email" maxLength={254} required autoFocus value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@college.ac.in" />
        <PasswordField id="password" label="Password" autoComplete="current-password" minLength={10} maxLength={128} required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <ErrorNote err={err} />
        <Button type="submit" disabled={login.isPending} className="h-12 w-full rounded-xl bg-accent text-base hover:bg-accent/90" data-testid="button-login">
          {login.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in</> : <>Sign in <ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">New to Adhyayaan? <Link href={authHref('register', next)} className="font-medium text-accent underline-offset-4 hover:underline" data-testid="link-register">Create a free account</Link></p>
    </Frame>
  );
}

export function Register() {
  useTitle('Create account');
  const reg = useRegister();
  const reset = useResetForSession();
  const [, nav] = useLocation();
  const { blocked, next } = useSignedInRedirect('/');
  const [f, setF] = useState({ name: '', email: '', password: '', college: '', discipline: '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (f.name.trim().length < 2) return setErr('Please enter your full name.');
    if (f.password.length < 10) return setErr('Password needs at least 10 characters.');
    try { const s = await reg.mutateAsync({ data: { ...f, name: f.name.trim(), email: f.email.trim(), college: f.college.trim(), discipline: f.discipline.trim() } }); reset(s); nav(assessmentHref(next), { replace: true }); }
    catch (x) { setErr(errMsg(x)); }
  };
  if (blocked && !reg.isPending && !reg.isSuccess) return <AuthSplash />;
  const pwLen = f.password.length;
  return (
    <Frame mode="register">
      <h1 className="font-display text-4xl font-semibold leading-tight text-primary">Create your account</h1>
      <p className="mt-2 text-muted-foreground">It’s free to join. After signup, complete a <Link href="/assessment/guide" className="font-medium text-primary underline underline-offset-2">learning assessment</Link> so we can guide your study.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field id="name" label="Full name" minLength={2} maxLength={100} required autoFocus value={f.name} onChange={set('name')} autoComplete="name" />
        <Field id="email" label="Email" type="email" inputMode="email" maxLength={254} required value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@college.ac.in" />
        <div>
          <PasswordField id="password" label="Password" minLength={10} maxLength={128} required value={f.password} onChange={set('password')} autoComplete="new-password" hint={pwLen >= 10 ? 'Length looks good.' : `At least 10 characters (${pwLen}/10).`} />
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div className={`h-full origin-left rounded-full transition-transform duration-300 ${pwLen >= 10 ? 'bg-[hsl(168_40%_36%)]' : 'bg-accent'}`} style={{ transform: `scaleX(${Math.min(1, pwLen / 10)})` }} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="college" label="College" maxLength={200} required value={f.college} onChange={set('college')} placeholder="Jadavpur University" autoComplete="organization" />
          <Field id="discipline" label="Discipline" maxLength={100} required value={f.discipline} onChange={set('discipline')} placeholder="B.Tech ECE" />
        </div>
        <ErrorNote err={err} />
        <Button type="submit" disabled={reg.isPending} className="h-12 w-full rounded-xl bg-accent text-base hover:bg-accent/90" data-testid="button-register">
          {reg.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account</> : <>Create account <ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">Already registered? <Link href={authHref('login', next)} className="font-medium text-accent underline-offset-4 hover:underline" data-testid="link-login">Sign in</Link></p>
    </Frame>
  );
}

/** Shown at "/" for signed-out visitors. */
export function Welcome() {
  return <Login />;
}
