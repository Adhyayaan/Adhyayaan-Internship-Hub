import "./_group.css";
import {
  Activity, BookOpen, Brain, ChartNoAxesCombined, ChevronDown, Compass, LayoutGrid,
  MessagesSquare, Search, ShieldCheck, Sparkles, UsersRound,
} from "lucide-react";

const courseRows = [
  { title: "Community Survey & Data Analysis", learners: 14, done: 43, expected: 50, modules: "38 / 84", hours: "412 / 840", behind: 3, steady: 8, ahead: 3 },
  { title: "Heritage Digitisation & Archival Metadata", learners: 9, done: 52, expected: 50, modules: "31 / 54", hours: "386 / 540", behind: 2, steady: 5, ahead: 2 },
  { title: "Public Health Field Research", learners: 8, done: 39, expected: 46, modules: "19 / 48", hours: "271 / 480", behind: 2, steady: 4, ahead: 2 },
];

const roster = [
  { initials: "SM", name: "Sohini Mukherjee", college: "Burdwan University · Sociology", courses: "Community Survey", progress: "34% complete", status: "6 days behind" },
  { initials: "AR", name: "Ayan Roy", college: "University of Calcutta · History", courses: "Heritage Digitisation", progress: "41% complete", status: "On track" },
  { initials: "ND", name: "Nandita Das", college: "Kalyani University · Public Health", courses: "Public Health Research", progress: "27% complete", status: "9 days behind" },
];

const nav = [
  { label: "Guide dashboard", icon: LayoutGrid, active: true },
  { label: "Course support", icon: ShieldCheck },
  { label: "Course groups", icon: UsersRound },
  { label: "Mentorship", icon: MessagesSquare },
  { label: "Account", icon: UsersRound },
];

const mobileNav = [
  { label: "Today", icon: LayoutGrid },
  { label: "Explore", icon: Compass },
  { label: "Learning", icon: BookOpen },
  { label: "Practice", icon: Brain },
  { label: "More", icon: Sparkles },
];

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof UsersRound }) {
  return <div className="min-w-0 px-4 py-4 sm:px-5">
    <div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4 text-[hsl(var(--ledger))]" /><span className="text-xs font-semibold">{label}</span></div>
    <p className="mt-2 text-2xl font-black tabular-nums text-primary">{value}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
  </div>;
}

function Meter({ label, value, amount, tone = "accent" }: { label: string; value: string; amount: number; tone?: "accent" | "ledger" }) {
  return <div className="mt-3">
    <div className="mb-1 flex justify-between gap-3 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums text-primary">{value}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${tone === "ledger" ? "bg-[hsl(var(--ledger))]" : "bg-accent"}`} style={{ width: `${Math.min(100, amount)}%` }} /></div>
  </div>;
}

export function Current() {
  return <div className="min-h-screen bg-background font-sans text-foreground">
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col bg-sidebar px-5 py-6 text-sidebar-foreground md:flex">
      <div className="flex h-12 items-center rounded-xl bg-[hsl(40_45%_95%)] px-3"><img src="/__mockup/images/adhyayaan-logo.png" alt="Adhyayaan" className="h-8 w-40 object-contain object-left" /></div>
      <p className="mt-3 text-[9px] uppercase tracking-[.2em] text-sidebar-foreground/50">Cognitive · adaptive learning</p>
      <nav className="mt-9 space-y-1" aria-label="Guide navigation">
        {nav.map(({ label, icon: Icon, active }) => <div key={label} className={`flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm ${active ? "bg-card font-semibold text-primary" : "text-sidebar-foreground/75"}`}><Icon className="h-4 w-4" />{label}</div>)}
      </nav>
      <div className="mt-auto flex items-center gap-3 rounded-xl bg-sidebar-accent p-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-bold">DG</span><span><span className="block text-sm font-semibold">Demo Guide</span><span className="block text-xs text-sidebar-foreground/55">Guide workspace</span></span></div>
    </aside>
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 md:hidden">
      <img src="/__mockup/images/adhyayaan-logo.png" alt="Adhyayaan" className="h-7 w-32 object-contain object-left" /><span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">DG</span>
    </header>
    <main className="mx-auto max-w-[1440px] space-y-6 p-4 pb-24 sm:p-6 md:ml-60 md:p-8">
      <header className="overflow-hidden rounded-[1.4rem] border border-primary/10 bg-card shadow-sm">
        <div className="grid gap-4 bg-primary px-5 py-6 text-primary-foreground sm:grid-cols-[1fr_auto] sm:items-end sm:px-8">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[hsl(var(--turmeric))]"><ChartNoAxesCombined className="h-4 w-4" />Guide workspace</p>
            <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">Learner progress, in context.</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-primary-foreground/80">A practical overview of assigned pathways, study activity and useful points for a check-in.</p>
          </div>
          <p className="text-xs text-primary-foreground/70 sm:text-right">Private workspace<br /><span className="font-semibold text-primary-foreground">Assigned learners only</span></p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
          <Metric label="Learners" value="28" detail="assigned to you" icon={UsersRound} />
          <Metric label="Pathways" value="31" detail="assigned course records" icon={BookOpen} />
          <Metric label="Practical hours" value="1,069" detail="of 1,860 hours target" icon={Activity} />
          <Metric label="Average completion" value="45%" detail="7 pathways behind target" icon={ChartNoAxesCombined} />
        </div>
      </header>

      <section className="space-y-4" aria-labelledby="portfolio-heading">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--ledger))]">Portfolio analysis</p><h2 id="portfolio-heading" className="mt-1 text-xl font-black text-primary">Course-level view</h2><p className="mt-1 text-sm text-muted-foreground">Aggregate signals from assigned pathways. Pace describes timing against the course plan, not learner ability.</p></div>
        <div className="grid gap-3 xl:grid-cols-2">
          {courseRows.map((course) => <article key={course.title} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--ledger))]">Course analysis</p><h3 className="mt-1 text-lg font-bold leading-snug text-primary">{course.title}</h3><p className="mt-1 text-xs text-muted-foreground">{course.learners} assigned learners</p></div>
              <button type="button" className="min-h-10 rounded-lg border border-border px-3 text-sm font-bold text-primary">Filter roster</button>
            </div>
            <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Module progress</p><p className="mt-1 font-bold tabular-nums text-primary">{course.modules}</p><p className="text-xs text-muted-foreground">{course.done}% complete</p></div>
              <div><p className="text-xs text-muted-foreground">Practical hours</p><p className="mt-1 font-bold tabular-nums text-primary">{course.hours}</p><p className="text-xs text-muted-foreground">against target</p></div>
              <div><p className="text-xs text-muted-foreground">Practice average</p><p className="mt-1 font-bold tabular-nums text-primary">7.4</p><p className="text-xs text-muted-foreground">16 practice sets</p></div>
              <div><p className="text-xs text-muted-foreground">Study activity</p><p className="mt-1 font-bold tabular-nums text-primary">83 lessons</p><p className="text-xs text-muted-foreground">49 study checks</p></div>
            </div>
            <div className="border-t border-border pt-3 text-xs">
              <div className="flex flex-wrap gap-x-5 gap-y-2 font-semibold">
                <span className="text-[hsl(var(--ledger))]">{course.steady} on track or complete</span><span className="text-primary">{course.ahead} ahead of target</span><span className="text-accent">{course.behind} behind target</span>
              </div>
              <Meter label="Completion against plan" value={`${course.done}% complete · ${course.expected}% expected`} amount={course.done} tone="ledger" />
            </div>
          </article>)}
        </div>
      </section>

      <section className="rounded-2xl border border-accent/25 bg-accent/5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-accent/15 pb-3"><div><h2 className="font-bold text-primary">Pathways that may need a check-in</h2><p className="mt-1 text-xs text-muted-foreground">Review timing with each learner before deciding what support is useful.</p></div><span className="text-xs text-muted-foreground">7 behind plan</span></div>
        <ul className="divide-y divide-accent/15">
          {[["Sohini Mukherjee", "Community Survey & Data Analysis", "6 days behind", "34% complete · 50% expected"], ["Nandita Das", "Public Health Field Research", "9 days behind", "27% complete · 46% expected"]].map(([name, course, status, progress]) => <li key={name} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0"><strong className="block text-sm text-primary">{name}</strong><span className="text-xs text-muted-foreground">{course}</span></span><span className="flex flex-wrap items-center gap-4 text-xs"><span className="font-semibold text-accent">{status}</span><span className="tabular-nums text-muted-foreground">{progress}</span><span className="font-bold text-[hsl(var(--ledger))]">Open conversation</span></span></li>)}
        </ul>
      </section>

      <section className="space-y-4" aria-labelledby="roster-heading">
        <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.14em] text-accent">Review workspace</p><h2 id="roster-heading" className="mt-1 text-xl font-black text-primary">Assigned learner roster</h2><p className="mt-1 text-sm text-muted-foreground">Search by learner, college or discipline. Course filter also updates the analysis above.</p></div>
          <label className="w-full sm:w-72"><span className="mb-1.5 block text-sm font-semibold">Course view</span><select className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"><option>All supported courses</option></select></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]"><label className="relative"><span className="sr-only">Search learners</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm" placeholder="Search name, email, college or discipline" /></label><button className="flex h-11 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-primary"><ChevronDown className="h-4 w-4" />Sort learners</button></div>
        <div className="space-y-3">
          {roster.map((person) => <details key={person.name} className="overflow-hidden rounded-2xl border border-border bg-card">
            <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">{person.initials}</span><span className="min-w-0"><strong className="block truncate text-primary">{person.name}</strong><span className="mt-0.5 block truncate text-xs text-muted-foreground">{person.college}</span></span></span>
              <span className="hidden items-center gap-3 text-xs sm:flex"><span className="text-muted-foreground">{person.progress}</span><span className={person.status.includes("behind") ? "text-accent" : "text-[hsl(var(--ledger))]"}>{person.status}</span><ChevronDown className="h-4 w-4 text-muted-foreground" /></span>
            </summary>
            <div className="border-t border-border bg-secondary/20 p-4 text-sm text-muted-foreground">Pathway: {person.courses} · Open the learner record to review progress and reports.</div>
          </details>)}
        </div>
      </section>
      <p className="rounded-xl border border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground">Design preview only — all names and metrics are illustrative. Live dashboard values come from assigned learner records.</p>
    </main>
    <nav className="fixed inset-x-2 bottom-0 z-20 grid grid-cols-5 rounded-t-2xl bg-sidebar px-2 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-2 text-[10px] text-sidebar-foreground md:hidden" aria-label="Mobile navigation">
      {mobileNav.map(({ icon: Icon, label }) => <span key={label} className="flex min-h-12 flex-col items-center justify-center gap-1"><Icon className="h-4 w-4" />{label}</span>)}
    </nav>
  </div>;
}
