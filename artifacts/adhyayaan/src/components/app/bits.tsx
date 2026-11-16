import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, Lock, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { authHref, errMsg } from '@/lib/app';
import { useHere } from '@/lib/use-here';

export function PageHeader({ kicker, title, sub, children }: { kicker: string; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="rise mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">{kicker}</p>
        <h1 className="font-display text-4xl font-semibold leading-[1.05] text-primary md:text-5xl">{title}</h1>
        {sub && <p className="mt-3 text-base text-muted-foreground">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="ink-card flex flex-col items-start gap-3 border-destructive/30 p-6" data-testid="status-error">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        <span className="font-semibold">We could not load this</span>
      </div>
      <p className="text-sm text-muted-foreground">{errMsg(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry">
          <RotateCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
}

export function CardSkeletons({ n = 3, h = 'h-40' }: { n?: number; h?: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className={`${h} rounded-2xl bg-secondary`} />
      ))}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="ink-card relative overflow-hidden p-10 text-center">
      <div className="alpona-dots absolute inset-0 opacity-40" />
      <div className="relative mx-auto max-w-md">
        <Ring />
        <h3 className="mt-4 font-display text-2xl font-semibold text-primary">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        {action && <div className="mt-6 flex justify-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function Ring({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" className="mx-auto text-accent" aria-hidden>
      <circle cx="28" cy="28" r="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 4" />
      <circle cx="28" cy="28" r="17" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        return <circle key={i} cx={28 + Math.cos(a) * 17} cy={28 + Math.sin(a) * 17} r="2.4" fill="currentColor" />;
      })}
      <circle cx="28" cy="28" r="5" fill="hsl(var(--primary))" />
    </svg>
  );
}

export function SignInWall({ what }: { what: string }) {
  const here = useHere();
  return (
    <div className="ink-card relative overflow-hidden p-10">
      <div className="alpona-dots absolute inset-0 opacity-40" />
      <div className="relative mx-auto max-w-lg text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Lock className="h-5 w-5" />
        </div>
        <h3 className="mt-4 font-display text-3xl font-semibold text-primary">Sign in to {what}</h3>
        <p className="mt-2 text-muted-foreground">
          Browsing is open to everyone. Your own pathways, logs, projects and AI conversations live behind a free account.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild data-testid="button-wall-login"><Link href={authHref('login', here)}>Sign in</Link></Button>
          <Button asChild variant="outline" data-testid="button-wall-register"><Link href={authHref('register', here)}>Create account</Link></Button>
        </div>
      </div>
    </div>
  );
}

export function Meter({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'accent' }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={`h-full origin-left rounded-full transition-transform duration-700 ${tone === 'accent' ? 'bg-accent' : 'bg-primary'}`}
        style={{ transform: `scaleX(${Math.max(0, Math.min(100, value)) / 100})` }}
      />
    </div>
  );
}

export function Md({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
      p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : p,
    );
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
    out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    list = null;
  };
  text.split('\n').forEach((raw) => {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((ul || ol)![1]);
      return;
    }
    flush();
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) out.push(<h3 key={out.length}>{inline(h[1])}</h3>);
    else if (line.trim()) out.push(<p key={out.length}>{inline(line)}</p>);
  });
  flush();
  return <div className="prose-ai text-[15px] leading-relaxed">{out}</div>;
}
