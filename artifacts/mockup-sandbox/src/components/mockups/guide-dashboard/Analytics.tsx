import "./_group.css";
import {
  Activity, ArrowDownUp, ArrowRight, BookOpen, ChartNoAxesCombined, ChevronDown,
  CircleAlert, Clock3, FileText, Filter, GraduationCap, LayoutGrid, LockKeyhole,
  MessagesSquare, Search, ShieldCheck, UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

type Course = {
  id: string;
  title: string;
  learners: number;
  completion: number;
  expected: number;
  modules: string;
  hours: string;
  loggedHours: number;
  targetHours: number;
  behind: number;
  steady: number;
  ahead: number;
};

const courses: Course[] = [
  { id: "community", title: "Community Survey & Data Analysis", learners: 14, completion: 43, expected: 50, modules: "38 / 84", hours: "412 / 840", loggedHours: 412, targetHours: 840, behind: 3, steady: 8, ahead: 3 },
  { id: "heritage", title: "Heritage Digitisation & Archival Metadata", learners: 9, completion: 52, expected: 50, modules: "31 / 54", hours: "386 / 540", loggedHours: 386, targetHours: 540, behind: 2, steady: 5, ahead: 2 },
  { id: "health", title: "Public Health Field Research", learners: 8, completion: 39, expected: 46, modules: "19 / 48", hours: "271 / 480", loggedHours: 271, targetHours: 480, behind: 2, steady: 4, ahead: 2 },
];

const learners = [
  { name: "Sohini Mukherjee", initials: "SM", college: "Burdwan University", discipline: "Sociology", courseId: "community", course: "Community Survey & Data Analysis", status: "Behind plan", detail: "Review course timing and the practical work recorded so far." },
  { name: "Ayan Roy", initials: "AR", college: "University of Calcutta", discipline: "History", courseId: "heritage", course: "Heritage Digitisation & Archival Metadata", status: "On track", detail: "Progress is within the expected course plan." },
  { name: "Nandita Das", initials: "ND", college: "Kalyani University", discipline: "Public Health", courseId: "health", course: "Public Health Field Research", status: "Behind plan", detail: "A conversation can help clarify timing or practical support." },
];

const navItems = [
  { label: "Guide dashboard", icon: LayoutGrid, active: true },
  { label: "Course support", icon: ShieldCheck },
  { label: "Course groups", icon: UsersRound },
  { label: "Mentorship", icon: MessagesSquare },
];

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof UsersRound }) {
  return <div className="min-w-0 px-4 py-4 sm:px-5">
    <div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4 shrink-0 text-[hsl(var(--ledger))]" /><span className="text-xs font-semibold">{label}</span></div>
    <p className="mt-2 text-2xl font-black tabular-nums text-primary">{value}</p>
    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{note}</p>
  </div>;
}

export function Analytics() {
  const [courseFilter, setCourseFilter] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const visibleCourses = courses.filter((course) => !courseFilter || course.id === courseFilter);
  const chartData = visibleCourses.map((course) => ({
    name: course.title,
    chartLabel: course.id === "community" ? "Community Survey" : course.id === "heritage" ? "Heritage Metadata" : "Public Health Research",
    completed: course.completion,
    expected: course.expected,
    gap: course.completion - course.expected,
  }));
  const visibleLearners = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = learners.filter((person) =>
      (!courseFilter || person.courseId === courseFilter) &&
      (!needle || `${person.name} ${person.college} ${person.discipline} ${person.course}`.toLocaleLowerCase().includes(needle)),
    );
    return filtered.sort((a, b) => sort === "pace" ? a.status.localeCompare(b.status) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  }, [courseFilter, query, sort]);

  return <div className="min-h-screen bg-background font-sans text-foreground">
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col bg-sidebar px-5 py-6 text-sidebar-foreground md:flex">
      <div className="flex h-12 items-center rounded-xl bg-[hsl(40_45%_95%)] px-3"><img src="/__mockup/images/adhyayaan-logo.png" alt="Adhyayaan" className="h-8 w-40 object-contain object-left" /></div>
      <p className="mt-3 text-[9px] uppercase tracking-[.2em] text-sidebar-foreground/50">Cognitive · adaptive learning</p>
      <nav className="mt-9 space-y-1" aria-label="Guide navigation">
        {navItems.map(({ label, icon: Icon, active }) => <a key={label} href={label === "Guide dashboard" ? "/guide" : label === "Mentorship" ? "/mentorship" : "/guide"} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--turmeric))] ${active ? "bg-card font-semibold text-primary" : "text-sidebar-foreground/75 hover:bg-sidebar-accent"}`}><Icon className="h-4 w-4" />{label}</a>)}
      </nav>
      <div className="mt-auto rounded-xl bg-sidebar-accent p-3">
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--turmeric))] text-xs font-bold text-primary">DG</span><span><span className="block text-sm font-semibold">Demo Guide</span><span className="block text-xs text-sidebar-foreground/55">Guide workspace</span></span></div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-sidebar-foreground/65"><LockKeyhole className="h-3 w-3" />Assigned learners only</p>
      </div>
    </aside>

    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
      <img src="/__mockup/images/adhyayaan-logo.png" alt="Adhyayaan" className="h-7 w-32 object-contain object-left" />
      <span className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1.5 text-xs font-semibold text-primary"><LockKeyhole className="h-3.5 w-3.5" />Guide view</span>
    </header>

    <main className="mx-auto max-w-[1440px] space-y-7 p-4 pb-24 sm:p-6 md:ml-60 md:p-8">
      <header className="overflow-hidden rounded-[1.4rem] border border-primary/10 bg-card shadow-sm">
        <div className="grid gap-5 bg-primary px-5 py-6 text-primary-foreground sm:grid-cols-[1fr_auto] sm:items-end sm:px-8 sm:py-7">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[hsl(var(--turmeric))]"><ChartNoAxesCombined className="h-4 w-4" />Guide workspace <span className="text-primary-foreground/35">/</span> Portfolio analytics</p>
            <h1 className="mt-3 text-3xl font-black leading-tight sm:text-[2.55rem]">Progress, with the plan beside it.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-primary-foreground/80">Compare course completion with expected pace, then open the learner context behind a pattern.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 px-3 py-2.5 text-xs text-primary-foreground/80 sm:mb-1"><LockKeyhole className="h-4 w-4 text-[hsl(var(--turmeric))]" /><span>Private workspace<br /><strong className="text-primary-foreground">Assigned learners only</strong></span></div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          <Metric label="Assigned learners" value="28" note="across 3 courses" icon={UsersRound} />
          <Metric label="Pathways" value="31" note="assigned course records" icon={BookOpen} />
          <Metric label="Practical hours" value="1,069" note="of 1,860 hours assigned" icon={Activity} />
          <Metric label="Average completion" value="45%" note="7 pathways behind plan" icon={ChartNoAxesCombined} />
        </div>
      </header>

      <section aria-labelledby="pace-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--ledger))]">01 / Course signals</p><h2 id="pace-heading" className="mt-1 text-xl font-black text-primary sm:text-2xl">Completion against expected pace</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Each bar pair compares estimated module completion with the course plan at this point. It is a timing signal, not a measure of ability.</p></div>
          <label className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm">
            <Filter className="h-4 w-4 text-[hsl(var(--ledger))]" /><span className="sr-only">Filter by course</span>
            <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} className="max-w-[235px] bg-transparent py-2 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">All courses</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(255px,.7fr)]">
          <article className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
              <div><h3 className="font-bold text-primary">Course pace comparison</h3><p className="mt-1 text-xs text-muted-foreground">Percent complete compared with each course’s expected pace</p></div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-primary" aria-label="Chart legend"><span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-[hsl(var(--ledger))]" />Completed</span><span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-accent" />Expected</span></div>
            </div>
            <div className="mt-4 h-[238px] w-full sm:h-[264px]" role="img" aria-label={`Horizontal bar chart compares completion with expected pace: ${visibleCourses.map((course) => `${course.title}, ${course.completion} percent complete, ${course.expected} percent expected`).join("; ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 6, right: 24, left: 0, bottom: 4 }} barCategoryGap={17}>
                  <CartesianGrid horizontal={false} stroke="hsl(38 25% 84%)" />
                  <XAxis type="number" domain={[0, 70]} ticks={[0, 20, 40, 60]} tick={{ fill: "hsl(232 14% 42%)", fontSize: 11 }} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="chartLabel" width={118} tick={{ fill: "hsl(232 45% 16%)", fontSize: 10, fontWeight: 700 }} interval={0} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "hsl(40 40% 89% / .4)" }} content={({ active, payload }) => active && payload?.length ? <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg"><p className="max-w-56 font-bold text-primary">{payload[0].payload.name}</p><p className="mt-1"><span className="font-semibold text-[hsl(var(--ledger))]">{payload[0].payload.completed}% complete</span><span className="text-muted-foreground"> · </span><span className="font-semibold text-accent">{payload[0].payload.expected}% expected</span></p></div> : null} />
                  <Bar dataKey="completed" name="Completed" fill="hsl(178 42% 30%)" radius={[0, 4, 4, 0]} barSize={13} isAnimationActive={false}>
                    <LabelList dataKey="completed" position="right" formatter={(value: number) => `${value}%`} className="fill-primary" fontSize={10} fontWeight={700} />
                  </Bar>
                  <Bar dataKey="expected" name="Expected" fill="hsl(12 78% 54%)" radius={[0, 4, 4, 0]} barSize={13} isAnimationActive={false}>
                    <LabelList dataKey="expected" position="right" formatter={(value: number) => `${value}%`} className="fill-primary" fontSize={10} fontWeight={700} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-3 border-t border-border pt-4">
              {visibleCourses.map((course) => <div key={course.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs">
                <span className="truncate font-semibold text-primary">{course.title}</span>
                <span className={`font-bold tabular-nums ${course.completion < course.expected ? "text-[hsl(var(--accent))]" : "text-[hsl(var(--ledger))]"}`}>{course.completion < course.expected ? "−" : "+"}{Math.abs(course.completion - course.expected)} pts vs plan</span>
              </div>)}
            </div>
          </article>
          <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[hsl(var(--ledger))]">Across 31 pathways</p><h3 className="mt-1 font-bold text-primary">Pace distribution</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">A count of pathways by course-plan status.</p></div><ChartNoAxesCombined className="h-5 w-5 text-[hsl(var(--ledger))]" /></div>
            <div className="mt-5 space-y-4">
              {[{ label: "On track or complete", value: 17, mark: "01", tone: "bg-[hsl(var(--ledger))]" }, { label: "Ahead of plan", value: 7, mark: "02", tone: "bg-primary" }, { label: "Behind plan", value: 7, mark: "03", tone: "bg-accent" }].map((item) => <div key={item.label}>
                <div className="mb-1.5 flex items-end justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold text-primary"><span className="font-mono text-[10px] text-muted-foreground">{item.mark}</span>{item.label}</span><span className="text-sm font-black tabular-nums text-primary">{item.value}<span className="ml-1 text-[10px] font-medium text-muted-foreground">pathways</span></span></div>
                <div className="h-2.5 overflow-hidden rounded-sm bg-secondary" role="img" aria-label={`${item.label}: ${item.value} of 31 pathways`}><div className={`h-full ${item.tone}`} style={{ width: `${item.value / 31 * 100}%` }} /></div>
              </div>)}
            </div>
            <div className="mt-5 rounded-xl border border-accent/25 bg-accent/5 p-3.5">
              <p className="flex items-center gap-2 text-sm font-bold text-primary"><CircleAlert className="h-4 w-4 shrink-0 text-accent" />7 pathways behind plan</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Use this as a prompt to review timing with each learner. It does not describe their ability.</p>
              <a href="#roster" className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-xs font-bold text-[hsl(var(--ledger))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Review learner roster <ArrowRight className="h-3.5 w-3.5" /></a>
            </div>
          </article>
        </div>
      </section>

      <section aria-labelledby="course-detail-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--ledger))]">02 / Course detail</p><h2 id="course-detail-heading" className="mt-1 text-xl font-black text-primary">Where the activity sits</h2><p className="mt-1 text-sm text-muted-foreground">Module progress and practical hours are separate signals.</p></div><span className="hidden text-xs text-muted-foreground sm:block">Select a course above to focus the view</span></div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-[minmax(220px,1.5fr)_1fr_1fr_minmax(230px,1fr)] gap-4 border-b border-border bg-secondary/55 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground md:grid"><span>Course · learners</span><span>Module completion</span><span>Practical hours</span><span>Pace status</span></div>
          <div className="divide-y divide-border">
            {visibleCourses.map((course) => <article key={course.id} className="grid gap-4 p-4 md:grid-cols-[minmax(220px,1.5fr)_1fr_1fr_minmax(230px,1fr)] md:items-center md:px-5">
              <div className="min-w-0"><h3 className="text-sm font-bold leading-snug text-primary">{course.title}</h3><p className="mt-1 text-xs text-muted-foreground">{course.learners} assigned learners</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Modules complete</p><p className="mt-1 text-sm font-bold tabular-nums text-primary md:mt-0">{course.modules}</p><p className="text-xs text-muted-foreground">{Math.round(Number(course.modules.split(" / ")[0]) / Number(course.modules.split(" / ")[1]) * 100)}% complete</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Practical hours</p><p className="mt-1 text-sm font-bold tabular-nums text-primary md:mt-0">{course.hours}</p><p className="text-xs text-muted-foreground">{Math.round(course.loggedHours / course.targetHours * 100)}% of assigned hours</p></div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Pathways by pace</p>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-secondary md:mt-0" role="img" aria-label={`${course.behind} behind plan, ${course.steady} on track or complete, ${course.ahead} ahead`}>
                  <span className="bg-accent" style={{ width: `${course.behind / course.learners * 100}%` }} /><span className="bg-[hsl(var(--ledger))]" style={{ width: `${course.steady / course.learners * 100}%` }} /><span className="bg-primary" style={{ width: `${course.ahead / course.learners * 100}%` }} />
                </div>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold"><span className="text-accent">{course.behind} behind</span><span className="text-[hsl(var(--ledger))]">{course.steady} steady</span><span className="text-primary">{course.ahead} ahead</span></p>
              </div>
            </article>)}
          </div>
        </div>
      </section>

      <section id="roster" aria-labelledby="roster-heading" className="space-y-4">
        <div className="border-b border-border pb-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-accent">03 / Review workspace</p><h2 id="roster-heading" className="mt-1 text-xl font-black text-primary sm:text-2xl">Assigned learner roster</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Search by learner, college, discipline or course. Open a row for the learner report and private conversation.</p></div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
          <label className="relative block"><span className="sr-only">Search learners</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search name, college, discipline…" className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <label className="relative block"><span className="sr-only">Sort learner roster</span><ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><select value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-input bg-card pl-10 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="name">Sort: learner name</option><option value="pace">Sort: pace signal</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 text-muted-foreground" /></label>
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">Showing {visibleLearners.length} of 28 assigned learners · sample rows</p>
        {visibleLearners.length ? <div className="space-y-3">{visibleLearners.map((person, index) => <details key={person.name} className="group overflow-hidden rounded-2xl border border-border bg-card">
          <summary className="flex min-h-[76px] cursor-pointer list-none items-center justify-between gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-xs font-black text-primary-foreground">{person.initials}</span><span className="min-w-0"><strong className="block truncate text-sm text-primary">{person.name}</strong><span className="mt-0.5 block truncate text-xs text-muted-foreground">{person.college} · {person.discipline}</span></span></span>
            <span className="flex shrink-0 items-center gap-2"><span className={`hidden rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline-flex ${person.status === "Behind plan" ? "bg-accent/10 text-accent" : "bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]"}`}>{person.status}</span><ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" /></span>
          </summary>
          <div className="border-t border-border bg-secondary/20 p-4 sm:px-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Assigned pathway</p><p className="mt-1 text-sm font-bold text-primary">{person.course}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{person.detail}</p></div>
              <div className="flex flex-wrap gap-2">
                <a href={`/guide/learners/${index + 1}/report`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><FileText className="h-4 w-4" />Open learner report</a>
                <a href={`/mentorship/${index + 1}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MessagesSquare className="h-4 w-4" />Private conversation</a>
              </div>
            </div>
          </div>
        </details>)}</div> : <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center"><Search className="mx-auto h-5 w-5 text-muted-foreground" /><h3 className="mt-2 font-bold text-primary">No learners match this view</h3><p className="mt-1 text-sm text-muted-foreground">Try a different search or course filter.</p><button type="button" onClick={() => { setQuery(""); setCourseFilter(""); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold text-[hsl(var(--ledger))] hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Filter className="h-4 w-4" />Clear filters</button></div>}
      </section>

      <p className="rounded-xl border border-border bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-primary">Illustrative figures.</strong> All counts and learner examples on this design preview are mock data, not live learner records. Completion and pace support a human check-in; they do not describe a learner’s ability.</p>
    </main>
    <nav className="fixed inset-x-2 bottom-0 z-20 grid grid-cols-4 rounded-t-2xl bg-sidebar px-2 pb-[max(.4rem,env(safe-area-inset-bottom))] pt-2 text-[10px] text-sidebar-foreground md:hidden" aria-label="Guide navigation">
      {navItems.map(({ icon: Icon, label, active }) => <a key={label} href={label === "Guide dashboard" ? "/guide" : label === "Mentorship" ? "/mentorship" : "/guide"} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl ${active ? "bg-sidebar-foreground text-sidebar" : "text-sidebar-foreground/75"}`}><Icon className="h-4 w-4" />{label === "Guide dashboard" ? "Dashboard" : label === "Course support" ? "Support" : label === "Course groups" ? "Groups" : label}</a>)}
    </nav>
  </div>;
}
