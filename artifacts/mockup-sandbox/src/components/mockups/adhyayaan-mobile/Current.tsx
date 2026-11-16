import { BookOpenText, Brain, Compass, FolderGit2, LayoutGrid, NotebookPen, Sparkles, UserRound, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import './_group.css';

const NAV = [
  { href: '/', label: 'Today', icon: LayoutGrid },
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/my-learning', label: 'My learning', icon: BookOpenText },
  { href: '/practice', label: 'Practice', icon: Brain },
  { href: '/projects', label: 'Projects', icon: FolderGit2 },
  { href: '/logbook', label: 'Logbook', icon: NotebookPen },
  { href: '/ai', label: 'AI studio', icon: Sparkles },
];

function Logo() {
  return (
    <a href="/" className="flex w-fit items-center rounded-lg">
      <img src="/__mockup/images/adhyayaan-logo.png" alt="Adhyayaan home" className="h-8 w-[154px] object-contain object-left" />
    </a>
  );
}

function Avatar() {
  return (
    <span className="adhya-avatar h-[4.4rem] w-[4.4rem]" aria-hidden="true">
      <img src="/__mockup/images/mentor-avatar.png" alt="" />
    </span>
  );
}

export function Current() {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = NAV.slice(0, 4);
  return (
    <div className="adhyayaan-current min-h-screen">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Logo />
        <a href="/profile" className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm text-primary-foreground">
          <UserRound className="h-4 w-4" /> P G
        </a>
      </header>
      <main className="min-w-0 px-4 pb-28 pt-6">
        <div className="mb-5 text-sm text-muted-foreground">Community Survey &amp; Data Analysis / Ch. 1</div>
        <section className="ink-card p-5">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Today · Your pathway</p>
          <h1 className="font-display mt-2 text-3xl font-semibold text-primary">Learn with Adhyayaan</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Continue your internship study, check your progress, or ask your mentor when you are ready.</p>
        </section>
        <section className="ink-card mt-5 p-5">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Continue learning</p>
          <h2 className="font-display mt-2 text-xl font-semibold text-primary">Plan a consent conversation</h2>
          <p className="mt-2 text-sm text-muted-foreground">Orientation, research ethics and consent · 2 min read</p>
        </section>
      </main>
      <aside className="fixed bottom-[4.6rem] right-3 z-30">
        <button aria-label="Open Adhya, your learning mentor" className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-border bg-card p-1 shadow-xl">
          <Avatar /><span className="adhya-online-dot" />
        </button>
      </aside>
      {moreOpen && <div className="fixed inset-x-3 bottom-[4.5rem] z-40 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-card p-3 shadow-2xl">
        {NAV.slice(4).map((n) => <a key={n.href} href={n.href} className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm text-primary"><n.icon className="h-4 w-4 text-accent" />{n.label}</a>)}
        <a href="/profile" className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm text-primary"><UserRound className="h-4 w-4 text-accent" />Profile</a>
      </div>}
      <nav className="fixed inset-x-2 bottom-0 z-40 grid grid-cols-5 gap-0.5 rounded-t-2xl bg-sidebar px-1.5 pb-2 pt-1.5 shadow-2xl">
        {primary.map((n) => (
          <a key={n.href} href={n.href} className="flex min-w-0 min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] leading-tight text-sidebar-foreground/80">
            <n.icon className="h-[18px] w-[18px] shrink-0" />
            <span className="max-w-full truncate">{n.label === 'My learning' ? 'Learning' : n.label}</span>
          </a>
        ))}
        <button type="button" onClick={() => setMoreOpen((open) => !open)} className="flex min-w-0 min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] leading-tight text-sidebar-foreground/80">
          <MoreHorizontal className="h-[18px] w-[18px]" /><span>More</span>
        </button>
      </nav>
    </div>
  );
}
