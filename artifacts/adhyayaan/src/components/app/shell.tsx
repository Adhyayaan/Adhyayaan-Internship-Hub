import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Brain, BookOpenText, Compass, FolderGit2, LayoutGrid, NotebookPen, Sparkles, UserRound, LogIn, MoreHorizontal, ShieldCheck, UsersRound } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { authHref, useAuth } from '@/lib/app';
import { useHere } from '@/lib/use-here';
import { AdhyaGuide } from '@/components/app/adhya-guide';

const NAV = [
  { href: '/', label: 'Today', icon: LayoutGrid },
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/my-learning', label: 'My learning', icon: BookOpenText },
  { href: '/practice', label: 'Practice', icon: Brain },
  { href: '/projects', label: 'Projects', icon: FolderGit2 },
  { href: '/logbook', label: 'Logbook', icon: NotebookPen },
  { href: '/ai', label: 'AI studio', icon: Sparkles },
];
const GUIDE_NAV = [
  { href: '/guide', label: 'Guide dashboard', icon: UsersRound },
  { href: '/profile', label: 'Account', icon: UserRound },
];
const ADMIN_NAV = [
  { href: '/admin', label: 'Admin', icon: ShieldCheck },
  { href: '/profile', label: 'Account', icon: UserRound },
];

function Logo({ light }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`flex w-fit items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${light ? 'bg-[hsl(40_45%_95%)] px-2.5 py-2' : ''}`}
      data-testid="link-logo"
    >
      <img
        src={`${import.meta.env.BASE_URL}adhyayaan-logo.png`}
        alt="Adhyayaan home"
        className={light ? 'h-9 w-[174px] object-contain object-left' : 'h-8 w-[154px] object-contain object-left'}
      />
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavVisible, setMobileNavVisible] = useState(true);
  const [mobileFormFocused, setMobileFormFocused] = useState(false);
  const lastScrollY = useRef(0);
  const { user } = useAuth();
  const navigation = user?.isGuide ? GUIDE_NAV : user?.isAdmin ? ADMIN_NAV : NAV;
  const active = (h: string) => (h === '/' ? loc === '/' : loc.startsWith(h) || (h === '/explore' && loc.startsWith('/courses')));
  const here = useHere();
  const initials = user?.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  useEffect(() => {
    const onScroll = () => {
      const current = window.scrollY;
      if (current <= 24) setMobileNavVisible(true);
      else if (Math.abs(current - lastScrollY.current) > 4) setMobileNavVisible(current < lastScrollY.current);
      lastScrollY.current = current;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    setMobileNavVisible(true);
    lastScrollY.current = window.scrollY;
  }, [loc]);
  useEffect(() => {
    const syncFocus = () => {
      const target = document.activeElement;
      setMobileFormFocused(target instanceof HTMLElement && !!target.closest('input, textarea, select, [role="combobox"], [contenteditable="true"]'));
    };
    const onFocusOut = () => window.requestAnimationFrame(syncFocus);
    document.addEventListener('focusin', syncFocus);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', syncFocus);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  const showMobileNav = mobileNavVisible && !mobileFormFocused;
  return (
    <div className="min-h-[100dvh] md:flex">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col bg-sidebar p-5 text-sidebar-foreground md:flex">
        <Logo light />
        <p className="mt-2 pl-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/50">cognitive · adaptive learning</p>
        <nav className="mt-10 flex flex-col gap-1">
          {navigation.map((n) => (
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
            <Link href={authHref('login', here)} className="flex items-center justify-center gap-2 rounded-xl bg-sidebar-primary px-3 py-2.5 text-sm font-semibold text-sidebar-primary-foreground hover:brightness-110" data-testid="link-signin">
              <LogIn className="h-4 w-4" /> Sign in
            </Link>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/85 px-3 py-2.5 backdrop-blur md:hidden">
        <Logo />
        <Link href={user ? '/profile' : authHref('login', here)} className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm text-primary-foreground" data-testid="link-mobile-account">
          {user ? initials : <><UserRound className="h-4 w-4" /> Sign in</>}
        </Link>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-10 md:pb-12 md:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {user && !user.isGuide && !user.isAdmin && !loc.startsWith('/admin') && !loc.startsWith('/profile/reports/') && <AdhyaGuide />}

      <nav aria-label="Main navigation" aria-hidden={!showMobileNav} style={{ gridTemplateColumns: `repeat(${navigation.length > 4 ? 5 : Math.max(1, navigation.length)}, minmax(0, 1fr))` }} className={`mobile-bottom-nav fixed inset-x-2 bottom-0 z-40 grid gap-0.5 rounded-t-2xl bg-sidebar px-1.5 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-1.5 shadow-2xl md:hidden ${showMobileNav ? '' : 'mobile-bottom-nav-hidden'}`}>
        {navigation.slice(0, 4).map((n) => (
          <Link key={n.href} href={n.href} data-testid={`link-mnav-${n.href.slice(1) || 'home'}`}
            tabIndex={showMobileNav ? 0 : -1}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium leading-tight transition-colors ${active(n.href) ? 'bg-sidebar-foreground text-sidebar' : 'text-sidebar-foreground/75'}`}>
            <n.icon className={`h-[18px] w-[18px] shrink-0 ${active(n.href) ? 'text-accent' : ''}`} />
            <span>{n.label === 'My learning' ? 'Learning' : n.label}</span>
          </Link>
        ))}
        {navigation.length > 4 && <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button type="button" aria-label="More destinations" aria-expanded={moreOpen} tabIndex={showMobileNav ? 0 : -1} data-testid="button-mobile-more"
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium leading-tight text-sidebar-foreground/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${navigation.slice(4).some((n) => active(n.href)) ? 'bg-sidebar-foreground text-sidebar' : ''}`}>
              <MoreHorizontal className="h-[18px] w-[18px]" /> More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <SheetHeader className="text-left"><SheetTitle className="font-display text-2xl">Your workspace</SheetTitle></SheetHeader>
            <nav aria-label="More destinations" className="mt-4 grid grid-cols-2 gap-2">
              {navigation.slice(4).map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMoreOpen(false)}
                  className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 text-sm font-medium ${active(n.href) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'}`}>
                  <n.icon className="h-5 w-5 shrink-0 text-accent" />{n.label}
                </Link>
              ))}
              <Link href="/profile" onClick={() => setMoreOpen(false)} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground">
                <UserRound className="h-5 w-5 shrink-0 text-accent" />Profile
              </Link>
            </nav>
          </SheetContent>
        </Sheet>}
      </nav>
    </div>
  );
}
