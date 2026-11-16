import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Brain, BookOpenText, Compass, FolderGit2, LayoutGrid, NotebookPen, Sparkles, UserRound, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/app';

const NAV = [
  { href: '/', label: 'Today', icon: LayoutGrid },
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/my-learning', label: 'My learning', icon: BookOpenText },
  { href: '/practice', label: 'Practice', icon: Brain },
  { href: '/projects', label: 'Projects', icon: FolderGit2 },
  { href: '/logbook', label: 'Logbook', icon: NotebookPen },
  { href: '/ai', label: 'AI studio', icon: Sparkles },
];

function Logo({ light }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-logo">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-accent font-display text-lg font-bold text-accent-foreground">
        অ
      </span>
      <span className={`font-display text-xl font-semibold ${light ? 'text-sidebar-foreground' : 'text-primary'}`}>Adhyayaan</span>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const { user } = useAuth();
  const active = (h: string) => (h === '/' ? loc === '/' : loc.startsWith(h) || (h === '/explore' && loc.startsWith('/courses')));
  if (loc === '/login' || loc === '/register') return <>{children}</>;
  const initials = user?.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="min-h-[100dvh] md:flex">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col bg-sidebar p-5 text-sidebar-foreground md:flex">
        <Logo light />
        <p className="mt-2 pl-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/50">cognitive · adaptive learning</p>
        <nav className="mt-10 flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              data-testid={`link-nav-${n.label.toLowerCase().replace(/\s/g, '-')}`}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
                active(n.href) ? 'bg-sidebar-foreground text-sidebar' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              }`}
            >
              <n.icon className={`h-4 w-4 transition-transform group-hover:-rotate-6 ${active(n.href) ? 'text-accent' : ''}`} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <svg viewBox="0 0 200 40" className="mb-5 w-full text-sidebar-primary/60" aria-hidden>
            {Array.from({ length: 11 }).map((_, i) => (
              <g key={i} transform={`translate(${i * 19 + 5} 20)`}>
                <circle r="6" fill="none" stroke="currentColor" />
                <circle r="1.8" fill="currentColor" />
              </g>
            ))}
          </svg>
          {user ? (
            <Link href="/profile" className="flex items-center gap-3 rounded-xl bg-sidebar-accent p-3 hover:bg-sidebar-accent/70" data-testid="link-profile">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sm font-semibold">{initials}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="block truncate text-xs text-sidebar-foreground/60">{user.college}</span>
              </span>
            </Link>
          ) : (
            <Link href="/login" className="flex items-center justify-center gap-2 rounded-xl bg-sidebar-primary px-3 py-2.5 text-sm font-semibold text-sidebar-primary-foreground hover:brightness-110" data-testid="link-signin">
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/85 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <Link href={user ? '/profile' : '/login'} className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm text-primary-foreground" data-testid="link-mobile-account">
          {user ? initials : <><UserRound className="h-4 w-4" /> Sign in</>}
        </Link>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-10 md:pb-12 md:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <nav className="fixed inset-x-2 bottom-2 z-40 grid grid-cols-7 rounded-2xl bg-sidebar p-1.5 shadow-2xl md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} data-testid={`link-mnav-${n.href.slice(1) || 'home'}`}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] transition-colors ${active(n.href) ? 'bg-sidebar-foreground text-sidebar' : 'text-sidebar-foreground/70'}`}>
            <n.icon className={`h-[18px] w-[18px] ${active(n.href) ? 'text-accent' : ''}`} />
            {n.label.split(' ')[0]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
