import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, BookOpen, Clock3, GraduationCap, LockKeyhole, ShieldCheck, Target, Users, MessagesSquare, Search, ArrowUpDown, ChartNoAxesCombined, CheckCircle2, CircleAlert, FileText, Filter, TrendingUp, ChevronDown } from 'lucide-react';
import {
  getGetGuideDashboardQueryKey,
  getGetGuideLearningReportQueryKey,
  type GetGuideDashboardParams,
  type GuideCourseProgress,
  useGetGuideDashboard,
  useGetGuideLearningReport,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useAuth, errMsg, formatIndiaDate, formatHours, ordinal, pacingLabel, useTitle } from '@/lib/app';
import { EmptyPanel, ErrorPanel, PageSkeleton, ReportHeading, ReportView, SkeletonBlock, fmtDate } from '@/components/assessment/parts';

function AccessState({ title, message }: { title: string; message: string }) {
  return <div className="mx-auto max-w-xl p-4 sm:p-8"><EmptyPanel title={title} icon={<LockKeyhole className="h-6 w-6" />}><p>{message}</p><Button asChild variant="outline" className="mt-4"><Link href="/">Go to Adhyayaan</Link></Button></EmptyPanel></div>;
}

function Meter({ label, value, percent, tone = 'primary' }: { label: string; value: string; percent: number; tone?: 'primary' | 'ledger' }) {
  const pct = Math.max(0, Math.min(100, percent));
  return <div className="mt-3">
    <div className="mb-1 flex justify-between gap-3 text-xs"><span className="text-muted-foreground">{label}</span><span className="font-semibold tabular-nums">{value}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${label}: ${Math.round(pct)} percent`}>
      <div className={`h-full origin-left rounded-full ${tone === 'ledger' ? 'bg-[hsl(var(--ledger))]' : 'bg-accent'} motion-safe:transition-transform motion-safe:duration-500`} style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  </div>;
}

function PaceCard({ course }: { course: GuideCourseProgress }) {
  const p = course.pacing;
  const hoursPct = course.hours > 0 ? (course.loggedHours / course.hours) * 100 : 0;
  const paceTone = p.status === 'behind' ? 'border-accent/40 bg-accent/5' : p.status === 'ahead' || p.status === 'complete' ? 'border-[hsl(var(--ledger))]/30 bg-[hsl(var(--ledger-soft))]/70' : 'border-border bg-secondary/30';
  return <article className="rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid={`card-course-progress-${course.enrollmentId}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Internship pathway · {course.hours} hours</p>
        <h3 className="mt-1 font-display text-lg font-bold text-primary">{course.courseTitle}</h3>
      </div>
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold capitalize text-foreground">{course.status.replace(/_/g, ' ')}</span>
    </div>
    <Meter label="Modules complete" value={`${course.completedModules} of ${course.totalModules}`} percent={course.totalModules ? course.completedModules / course.totalModules * 100 : 0} />
    <Meter label="Practical hours logged" value={`${formatHours(course.loggedHours)} of ${course.hours} hrs`} percent={hoursPct} tone="ledger" />
    <div className={`mt-4 rounded-xl border p-3.5 ${paceTone}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-primary"><Target className="h-4 w-4 text-accent" />{pacingLabel(p.status, p.deltaDays)}</p>
        <span className="text-xs text-muted-foreground">{p.durationWeeks}-week plan · target {formatIndiaDate(p.targetDate, true)}</span>
      </div>
      <Meter label="Estimated module completion" value={`${p.completedPercent}% complete · ${p.expectedPercent}% expected`} percent={p.completedPercent} />
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Estimated module completion is separate from practical hours recorded in the logbook.</p>
        {p.cohortPercentile !== null && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Current completion is around the {ordinal(p.cohortPercentile)} percentile among learners who enrolled on the same date. This compares course progress only, not ability.</p>}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 sm:grid-cols-4">
      <ActivityMetric icon={<BookOpen className="h-4 w-4" />} label="Lessons read" value={course.lessonsRead} />
      <ActivityMetric icon={<GraduationCap className="h-4 w-4" />} label="Study checks" value={`${course.studyChecks} · ${course.secureChecks} secure`} />
      <ActivityMetric icon={<Target className="h-4 w-4" />} label="Practice sets" value={course.practiceCount} />
      <ActivityMetric icon={<Clock3 className="h-4 w-4" />} label="Practice average" value={course.practiceAverage === null ? 'Not yet' : course.practiceAverage.toFixed(1)} />
    </div>
    <div className="mt-4 border-t border-border pt-4">
      <Button asChild size="sm" variant="outline" data-testid={`button-guide-mentorship-${course.enrollmentId}`}><Link href={`/mentorship/${course.enrollmentId}`}><MessagesSquare className="mr-2 h-4 w-4" />Open learner conversation</Link></Button>
    </div>
    <section className="mt-4 border-t border-border pt-4" aria-label={`Practical-hour log for ${course.courseTitle}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h4 className="text-sm font-bold text-primary">Practical-hour log <span className="font-normal text-muted-foreground">({course.practicalLogs.length} {course.practicalLogs.length === 1 ? 'entry' : 'entries'})</span></h4>
        <p className="text-xs leading-relaxed text-muted-foreground">These entries are for review. Viewing them does not approve or certify hours.</p>
      </div>
      {course.practicalLogs.length === 0 ? <p className="mt-3 rounded-lg bg-secondary/35 px-3 py-3 text-sm text-muted-foreground">No practical-hour entries have been recorded for this pathway.</p>
        : <ol className="mt-3 space-y-2">
          {[...course.practicalLogs].sort((a, b) => b.date.localeCompare(a.date)).map((entry) => (
            <li key={entry.id}>
              <details className="group rounded-xl border border-border bg-background/55 open:bg-card" data-testid={`details-practical-log-${entry.id}`}>
                <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]"><Clock3 className="h-4 w-4" /></span>
                    <span className="font-semibold text-primary">{formatIndiaDate(entry.date, true)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold tabular-nums text-primary">{formatHours(entry.hours)} {entry.hours === 1 ? 'hour' : 'hours'}</span>
                    <span className="text-xs font-semibold text-[hsl(var(--ledger))] group-open:hidden">Read notes</span>
                    <span className="hidden text-xs font-semibold text-[hsl(var(--ledger))] group-open:inline">Hide notes</span>
                  </span>
                </summary>
                <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
                  <div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Activity</p><p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">{entry.activity}</p></div>
                  <div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Learning reflection</p><p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">{entry.learning}</p></div>
                </div>
              </details>
            </li>
          ))}
        </ol>}
    </section>
  </article>;
}

function ActivityMetric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return <div className="min-w-0"><div className="flex items-center gap-1.5 text-[hsl(var(--ledger))]">{icon}<span className="text-[11px] font-semibold text-muted-foreground">{label}</span></div><p className="mt-1 text-sm font-bold text-primary">{value}</p></div>;
}

function SummaryMetric({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return <div className="min-w-0 px-4 py-4 sm:px-5">
    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-black tabular-nums text-primary">{value}</p>
    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
  </div>;
}

type CourseAnalysisData = {
  id: string;
  title: string;
  learnerCount: number;
  behind: number;
  steady: number;
  ahead: number;
  modules: number;
  totalModules: number;
  logged: number;
  target: number;
  lessons: number;
  checks: number;
  practiceRuns: number;
  practiceAverage: number | null;
};

function CourseAnalysis({ analysis, selected, onSelect }: { analysis: CourseAnalysisData; selected: boolean; onSelect: () => void }) {
  const modulePercent = analysis.totalModules ? Math.round(analysis.modules / analysis.totalModules * 100) : 0;
  const hoursPercent = analysis.target ? Math.round(analysis.logged / analysis.target * 100) : 0;
  return <article className={`rounded-2xl border bg-card p-4 sm:p-5 ${selected ? 'border-[hsl(var(--ledger))] ring-1 ring-[hsl(var(--ledger))]/20' : 'border-border'}`} data-testid={`card-guide-course-analysis-${analysis.id}`}>
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--ledger))]">Course analysis</p>
        <h3 className="mt-1 font-display text-lg font-bold leading-snug text-primary">{analysis.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{analysis.learnerCount} assigned {analysis.learnerCount === 1 ? 'learner' : 'learners'}</p>
      </div>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="min-h-11 shrink-0 rounded-lg border border-border px-3 text-sm font-bold text-primary hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`button-filter-course-${analysis.id}`}>{selected ? 'Show all courses' : 'Filter roster'}</button>
    </div>
    <div className="grid grid-cols-2 gap-x-5 gap-y-4 py-4 sm:grid-cols-4">
      <div><p className="text-xs text-muted-foreground">Module progress</p><p className="mt-1 text-base font-bold tabular-nums text-primary">{analysis.modules}<span className="text-muted-foreground"> / {analysis.totalModules}</span></p><p className="text-xs text-muted-foreground">{modulePercent}% complete</p></div>
      <div><p className="text-xs text-muted-foreground">Practical hours</p><p className="mt-1 text-base font-bold tabular-nums text-primary">{formatHours(analysis.logged)}<span className="text-muted-foreground"> / {analysis.target}</span></p><p className="text-xs text-muted-foreground">{hoursPercent}% of assigned hours</p></div>
      <div><p className="text-xs text-muted-foreground">Practice average</p><p className="mt-1 text-base font-bold tabular-nums text-primary">{analysis.practiceAverage === null ? '—' : analysis.practiceAverage.toFixed(1)}</p><p className="text-xs text-muted-foreground">{analysis.practiceRuns} practice {analysis.practiceRuns === 1 ? 'set' : 'sets'}</p></div>
      <div><p className="text-xs text-muted-foreground">Study activity</p><p className="mt-1 text-base font-bold tabular-nums text-primary">{analysis.lessons} <span className="text-xs font-medium text-muted-foreground">lessons read</span></p><p className="text-xs text-muted-foreground">{analysis.checks} study checks</p></div>
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3 text-xs">
      <span className="inline-flex items-center gap-1.5 font-semibold text-[hsl(var(--ledger))]"><CheckCircle2 className="h-3.5 w-3.5" />{analysis.steady} on track or complete</span>
      <span className="inline-flex items-center gap-1.5 font-semibold text-primary"><TrendingUp className="h-3.5 w-3.5" />{analysis.ahead} ahead of target</span>
      <span className="inline-flex items-center gap-1.5 font-semibold text-accent"><CircleAlert className="h-3.5 w-3.5" />{analysis.behind} behind target</span>
    </div>
  </article>;
}

export function GuideDashboardPage() {
  useTitle('Guide dashboard');
  const { user, isLoading: authLoading } = useAuth();
  const [courseId, setCourseId] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'name' | 'pace' | 'hours' | 'reports'>('name');
  const params: GetGuideDashboardParams = courseId ? { courseId } : {};
  const q = useGetGuideDashboard(params, { query: { enabled: !!user?.isGuide, queryKey: getGetGuideDashboardQueryKey(params) } });
  const dashboard = q.data;
  const selectedLabel = dashboard?.supportedCourses.find((c) => c.id === courseId)?.title;
  const allCourses = useMemo(() => dashboard?.learners.flatMap((learner) => learner.courses) ?? [], [dashboard]);
  const enrolledLearners = dashboard?.learners ?? [];
  const behindCount = allCourses.filter((course) => course.pacing.status === 'behind').length;
  const totalHours = allCourses.reduce((sum, course) => sum + course.loggedHours, 0);
  const hoursTarget = allCourses.reduce((sum, course) => sum + course.hours, 0);
  const avgCompletion = allCourses.length ? allCourses.reduce((sum, course) => sum + course.pacing.completedPercent, 0) / allCourses.length : 0;
  const courseAnalyses = useMemo(() => {
    const groups = new Map<string, typeof allCourses>();
    allCourses.forEach((course) => groups.set(course.courseId, [...(groups.get(course.courseId) ?? []), course]));
    return [...groups.entries()].map(([id, entries]) => ({
      id,
      title: entries[0]?.courseTitle ?? 'Course',
      entries,
      learnerCount: enrolledLearners.filter((learner) => learner.courses.some((course) => course.courseId === id)).length,
      behind: entries.filter((entry) => entry.pacing.status === 'behind').length,
      steady: entries.filter((entry) => entry.pacing.status === 'on_track' || entry.pacing.status === 'complete').length,
      ahead: entries.filter((entry) => entry.pacing.status === 'ahead').length,
      modules: entries.reduce((sum, entry) => sum + entry.completedModules, 0),
      totalModules: entries.reduce((sum, entry) => sum + entry.totalModules, 0),
      logged: entries.reduce((sum, entry) => sum + entry.loggedHours, 0),
      target: entries.reduce((sum, entry) => sum + entry.hours, 0),
      lessons: entries.reduce((sum, entry) => sum + entry.lessonsRead, 0),
      checks: entries.reduce((sum, entry) => sum + entry.studyChecks, 0),
      practiceRuns: entries.reduce((sum, entry) => sum + entry.practiceCount, 0),
      practiceScores: entries.filter((entry) => entry.practiceAverage !== null),
    })).map((analysis) => ({
      ...analysis,
      practiceAverage: analysis.practiceScores.length
        ? analysis.practiceScores.reduce((sum, entry) => sum + (entry.practiceAverage ?? 0), 0) / analysis.practiceScores.length
        : null,
    }));
  }, [allCourses, enrolledLearners]);
  const visibleLearners = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const result = enrolledLearners.filter((learner) =>
      !needle || [learner.name, learner.email, learner.college, learner.discipline].some((value) => value.toLocaleLowerCase().includes(needle)),
    );
    return result.sort((a, b) => {
      if (sort === 'reports') return b.reports.length - a.reports.length || a.name.localeCompare(b.name);
      if (sort === 'hours') return b.courses.reduce((sum, course) => sum + course.loggedHours, 0) - a.courses.reduce((sum, course) => sum + course.loggedHours, 0) || a.name.localeCompare(b.name);
      if (sort === 'pace') {
        const priority = (learner: typeof a) => learner.courses.some((course) => course.pacing.status === 'behind') ? 0 : learner.courses.some((course) => course.pacing.status === 'on_track') ? 1 : 2;
        return priority(a) - priority(b) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
  }, [enrolledLearners, search, sort]);
  if (authLoading) return <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-8"><PageSkeleton /></div>;
  if (!user) return <AccessState title="Sign in to view your learners" message="Guide accounts can view progress for learners assigned to them." />;
  if (!user.isGuide) return <AccessState title="Guide access required" message="This dashboard is only available to guide accounts. Ask an administrator if you need guide access." />;
  return <main className="mx-auto min-h-[70dvh] max-w-6xl space-y-6 p-4 pb-24 sm:space-y-8 sm:p-8">
    <header className="rise overflow-hidden rounded-[1.4rem] border border-primary/10 bg-card shadow-sm">
      <div className="grid gap-5 bg-primary px-5 py-6 text-primary-foreground sm:grid-cols-[1fr_auto] sm:items-end sm:px-8 sm:py-8">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--turmeric))]"><ChartNoAxesCombined className="h-4 w-4" /> Guide workspace</p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight sm:text-4xl">Learner progress, in context.</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-primary-foreground/80">A practical overview of assigned pathways, study activity and useful points for a check-in.</p>
        </div>
        <p className="text-xs text-primary-foreground/70 sm:text-right">Private workspace<br /><span className="font-semibold text-primary-foreground">Assigned learners only</span></p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
        <SummaryMetric label="Learners" value={dashboard?.learnerCount ?? '—'} detail="assigned to you" />
        <SummaryMetric label="Pathways" value={dashboard ? allCourses.length : '—'} detail="assigned course records" />
        <SummaryMetric label="Practical hours" value={dashboard ? formatHours(totalHours) : '—'} detail={`${formatHours(hoursTarget)} hrs target`} />
        <SummaryMetric label="Average completion" value={dashboard && allCourses.length ? `${Math.round(avgCompletion)}%` : '—'} detail={dashboard ? `${behindCount} pathway${behindCount === 1 ? '' : 's'} behind target` : 'across pathways'} />
      </div>
    </header>
    {q.isLoading ? <div className="space-y-4" aria-label="Loading assigned learners" aria-busy="true">{[0, 1].map((i) => <SkeletonBlock key={i} className="h-44" />)}</div>
      : q.isError || !dashboard ? <ErrorPanel title="We could not load your assigned learners" message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : dashboard.learners.length === 0 ? <EmptyPanel title="No learners assigned yet" icon={<Users className="h-6 w-6" />}><p>{selectedLabel ? `There are no assigned learners in ${selectedLabel} yet.` : 'Your assigned learners will appear here when the programme team adds them.'}</p></EmptyPanel>
          : <>
            <section aria-labelledby="course-analysis-heading" className="space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--ledger))]">Portfolio analysis</p><h2 id="course-analysis-heading" className="mt-1 text-xl font-black text-primary">Course-level view</h2><p className="mt-1 text-sm text-muted-foreground">Aggregate signals from assigned pathways. Pace describes timing against the course plan, not learner ability.</p></div>
                <span className="text-xs text-muted-foreground">{courseAnalyses.length} {courseAnalyses.length === 1 ? 'course' : 'courses'} in view</span>
              </div>
              {behindCount > 0 && <p className="flex gap-2 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-sm leading-relaxed text-foreground" role="status"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span><strong>{behindCount} pathway{behindCount === 1 ? '' : 's'} currently behind its course target.</strong> This is an observable pace signal. Consider a supportive check-in about timing or practical support; it is not a measure of ability.</span></p>}
              {courseAnalyses.length > 0 ? <div className="grid gap-3 lg:grid-cols-2">
                {courseAnalyses.map((analysis) => <CourseAnalysis key={analysis.id} analysis={analysis} onSelect={() => setCourseId(courseId === analysis.id ? '' : analysis.id)} selected={courseId === analysis.id} />)}
              </div> : <div className="rounded-xl border border-dashed border-border bg-card/70 p-5 text-sm text-muted-foreground">There are no course records in this view.</div>}
            </section>
            <section aria-labelledby="roster-heading" className="space-y-4">
              <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-xs font-bold uppercase tracking-[.14em] text-accent">Review workspace</p><h2 id="roster-heading" className="mt-1 text-xl font-black text-primary">Assigned learner roster</h2><p className="mt-1 text-sm text-muted-foreground">Search by learner, college or discipline. Course filter also updates the analysis above.</p></div>
                <label className="block w-full sm:w-72"><span className="mb-1.5 block text-sm font-semibold">Course view</span><select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="select-course-view"><option value="">All supported courses</option>{dashboard.supportedCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
                <label className="relative block"><span className="sr-only">Search assigned learners</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search name, email, college or discipline" className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="input-guide-roster-search" /></label>
                <label className="relative block"><span className="sr-only">Sort learner roster</span><ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-11 w-full appearance-none rounded-lg border border-input bg-card pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="select-guide-roster-sort"><option value="name">Sort: learner name</option><option value="pace">Sort: pace signal first</option><option value="hours">Sort: practical hours</option><option value="reports">Sort: saved reports</option></select></label>
              </div>
              {visibleLearners.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center"><Filter className="mx-auto h-5 w-5 text-muted-foreground" /><h3 className="mt-2 font-bold text-primary">No learners match this view</h3><p className="mt-1 text-sm text-muted-foreground">Try another search or clear the course filter.</p><button type="button" onClick={() => { setSearch(''); setCourseId(''); }} className="mt-3 min-h-11 rounded-lg px-4 text-sm font-bold text-[hsl(var(--ledger))] hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="button-clear-guide-filters">Clear filters</button></div>
                : <div className="space-y-4">
                  <p className="text-xs text-muted-foreground" aria-live="polite">Showing {visibleLearners.length} of {dashboard.learnerCount} assigned {dashboard.learnerCount === 1 ? 'learner' : 'learners'}</p>
                  {visibleLearners.map((learner) => <details key={learner.id} className="group ink-card overflow-hidden" data-testid={`card-guide-learner-${learner.id}`}>
                    <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">{learner.name.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-primary" data-testid={`text-guide-learner-${learner.id}`}>{learner.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{learner.college} · {learner.discipline}</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="hidden rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground sm:inline">{learner.courses.length} {learner.courses.length === 1 ? 'pathway' : 'pathways'}</span>
                        <span className="hidden rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground sm:inline">{learner.reports.length} {learner.reports.length === 1 ? 'report' : 'reports'}</span>
                        <span className="hidden text-xs tabular-nums text-muted-foreground lg:inline">{learner.courses.length ? `${Math.round(learner.courses.reduce((sum, course) => sum + course.pacing.completedPercent, 0) / learner.courses.length)}% average completion` : 'No active pathway'}</span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <div className="border-t border-border bg-secondary/15 p-4 sm:p-5">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{learner.courses.length} {learner.courses.length === 1 ? 'pathway' : 'pathways'}</span>
                        <span>{learner.reports.length} saved {learner.reports.length === 1 ? 'report' : 'reports'}</span>
                        <span className="break-all">{learner.email}</span>
                      </div>
                    <div className="space-y-4">
                      {learner.courses.length ? <div className="grid gap-4 lg:grid-cols-2">{learner.courses.map((course) => <PaceCard key={course.enrollmentId} course={course} />)}</div> : <p className="rounded-xl bg-secondary/40 p-4 text-sm text-muted-foreground">No active pathway details are available for this learner.</p>}
                      <section className="rounded-xl border border-[hsl(var(--ledger))]/25 bg-[hsl(var(--ledger-soft))]/55 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--ledger))]" /><div><h4 className="text-sm font-bold text-primary">Saved learning reports</h4><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Report contents open through audited guide access. Each opening is recorded.</p></div></div>
                          {learner.reports.length === 0 && <span className="text-xs text-muted-foreground">No saved reports</span>}
                        </div>
                        {learner.reports.length > 0 && <ul className="mt-3 divide-y divide-[hsl(var(--ledger))]/15 overflow-hidden rounded-lg border border-[hsl(var(--ledger))]/20 bg-card">
                          {[...learner.reports].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).map((report) => <li key={report.id}><Link href={`/guide/learners/${learner.id}/reports/${report.id}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`link-guide-report-${report.id}`}><span className="inline-flex items-center gap-2 font-semibold text-primary"><FileText className="h-4 w-4 text-[hsl(var(--ledger))]" />Version {report.version} · {fmtDate(report.completedAt)}</span><span className="font-bold text-[hsl(var(--ledger))]">Open audited report</span></Link></li>)}
                        </ul>}
                      </section>
                    </div>
                    </div>
                  </details>)}
                </div>}
            </section>
          </>}
  </main>;
}

export function GuideLearningReportPage() {
  const { learnerId = '', reportId = '' } = useParams<{ learnerId: string; reportId: string }>();
  useTitle('Guide learning report');
  const { user, isLoading: authLoading } = useAuth();
  const q = useGetGuideLearningReport(learnerId, reportId, { query: { enabled: !!user?.isGuide && !!learnerId && !!reportId, queryKey: getGetGuideLearningReportQueryKey(learnerId, reportId) } });
  if (authLoading) return <div className="mx-auto max-w-4xl p-4 sm:p-8"><PageSkeleton /></div>;
  if (!user) return <AccessState title="Sign in to open this report" message="Only guide accounts can use audited report access." />;
  if (!user.isGuide) return <AccessState title="Guide access required" message="This report is only available to an authorised guide." />;
  return <main className="mx-auto max-w-4xl space-y-5 p-4 pb-24 sm:p-8">
    <Link href="/guide" className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-guide"><ArrowLeft className="mr-2 h-4 w-4" />Guide dashboard</Link>
    {q.isLoading ? <PageSkeleton /> : q.isError || !q.data ? <ErrorPanel title="We could not open this report" message={errMsg(q.error)} onRetry={() => q.refetch()} /> : <>
      <ReportHeading report={q.data} kicker="Learner report" />
      <aside className="flex gap-3 rounded-xl border-l-4 border-[hsl(var(--ledger))] bg-[hsl(var(--ledger-soft))] p-4 text-sm" data-testid="notice-audited-guide-report"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--ledger))]" /><p><strong>Audited guide access.</strong> Opening this report is recorded. Use it to support the learner, not to rank or label them.</p></aside>
      <ReportView report={q.data} audience="guide" />
    </>}
  </main>;
}
