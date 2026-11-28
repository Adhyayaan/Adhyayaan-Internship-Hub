import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, ArrowRight, BookOpen, Clock3, GraduationCap, LockKeyhole, ShieldCheck, Target, Users, MessagesSquare, Search, ArrowUpDown, ChartNoAxesCombined, CircleAlert, FileText, Filter, ChevronDown } from 'lucide-react';
import {
  getGetGuideDashboardQueryKey,
  getGetGuideLearningReportQueryKey,
  type GetGuideDashboardParams,
  type GuideCourseProgress,
  useGetGuideDashboard,
  useGetGuideLearningReport,
} from '@workspace/api-client-react';
import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
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

function safeProjectUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : '';
  } catch {
    return '';
  }
}

function PaceCard({ course }: { course: GuideCourseProgress }) {
  const p = course.pacing;
  const projectUrl = safeProjectUrl(course.projectUrl);
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
    <section className="mt-4 border-t border-border pt-4" aria-label={`Pathway project submission for ${course.courseTitle}`}>
      <h4 className="text-sm font-bold text-primary">Pathway reflection</h4>
      {!course.projectUrl && !course.reflection && course.portfolioFiles.length === 0 ? (
        <p className="mt-3 rounded-lg bg-secondary/35 px-3 py-3 text-sm text-muted-foreground">No project link, reflection, or files have been added yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {projectUrl && <a href={projectUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-primary underline underline-offset-4"><ArrowRight className="h-4 w-4 shrink-0" />Open project link</a>}
          {course.reflection && <div className="rounded-lg bg-secondary/35 p-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Student reflection</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{course.reflection}</p></div>}
          {course.portfolioFiles.length > 0 && <ul className="space-y-2">{course.portfolioFiles.map((file) => <li key={file.id}><a href={file.downloadUrl} className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-secondary" data-testid={`link-portfolio-file-${file.id}`}><FileText className="h-4 w-4 shrink-0 text-accent" /><span className="min-w-0 flex-1 truncate">{file.fileName}</span><span className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(file.size < 1024 * 1024 ? 2 : 1)} MB</span></a></li>)}</ul>}
        </div>
      )}
    </section>
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
  pathwayCount: number;
  completion: number;
  expected: number;
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
  return <article className={`grid min-w-0 gap-4 p-4 xl:grid-cols-[minmax(220px,1.5fr)_1fr_1fr_minmax(230px,1fr)] xl:items-center xl:px-5 ${selected ? 'bg-[hsl(var(--ledger-soft))]/35' : ''}`} data-testid={`card-guide-course-analysis-${analysis.id}`}>
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h3 className="text-sm font-bold leading-snug text-primary">{analysis.title}</h3><p className="mt-1 text-xs text-muted-foreground">{analysis.learnerCount} assigned {analysis.learnerCount === 1 ? 'learner' : 'learners'}</p></div>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="min-h-11 shrink-0 self-start rounded-lg border border-border bg-card px-3 text-xs font-bold text-primary hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto" data-testid={`button-filter-course-${analysis.id}`}>{selected ? 'Show all courses' : 'View course'}</button>
    </div>
    <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Module completion</p><p className="mt-1 text-sm font-bold tabular-nums text-primary md:mt-0">{analysis.modules} / {analysis.totalModules}</p><p className="text-xs text-muted-foreground">{modulePercent}% complete</p></div>
    <div><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Practical hours</p><p className="mt-1 text-sm font-bold tabular-nums text-primary md:mt-0">{formatHours(analysis.logged)} / {formatHours(analysis.target)} hrs</p><p className="text-xs text-muted-foreground">{hoursPercent}% of assigned hours</p></div>
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:hidden">Pathways by pace</p>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-secondary xl:mt-0" role="img" aria-label={`${analysis.behind} behind plan, ${analysis.steady} on track or complete, ${analysis.ahead} ahead`}>
        {analysis.pathwayCount > 0 && <>
          <span className="bg-accent" style={{ width: `${analysis.behind / analysis.pathwayCount * 100}%` }} />
          <span className="bg-[hsl(var(--ledger))]" style={{ width: `${analysis.steady / analysis.pathwayCount * 100}%` }} />
          <span className="bg-primary" style={{ width: `${analysis.ahead / analysis.pathwayCount * 100}%` }} />
        </>}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold"><span className="text-accent">{analysis.behind} behind</span><span className="text-[hsl(var(--ledger))]">{analysis.steady} steady</span><span className="text-primary">{analysis.ahead} ahead</span></p>
    </div>
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-4 xl:col-span-4 xl:px-1">
      <div><p className="text-xs text-muted-foreground">Practice average</p><p className="mt-1 text-sm font-bold tabular-nums text-primary">{analysis.practiceAverage === null ? '—' : analysis.practiceAverage.toFixed(1)}</p><p className="text-xs text-muted-foreground">{analysis.practiceRuns} practice {analysis.practiceRuns === 1 ? 'set' : 'sets'}</p></div>
      <div><p className="text-xs text-muted-foreground">Lessons read</p><p className="mt-1 text-sm font-bold tabular-nums text-primary">{analysis.lessons}</p></div>
      <div><p className="text-xs text-muted-foreground">Study checks</p><p className="mt-1 text-sm font-bold tabular-nums text-primary">{analysis.checks}</p></div>
      <div><p className="text-xs text-muted-foreground">Average completion</p><p className="mt-1 text-sm font-bold tabular-nums text-primary">{analysis.completion}% <span className="text-xs font-medium text-muted-foreground">of {analysis.expected}% expected</span></p></div>
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
  const steadyCount = allCourses.filter((course) => course.pacing.status === 'on_track' || course.pacing.status === 'complete').length;
  const aheadCount = allCourses.filter((course) => course.pacing.status === 'ahead').length;
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
      pathwayCount: entries.length,
      completion: entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.pacing.completedPercent, 0) / entries.length) : 0,
      expected: entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.pacing.expectedPercent, 0) / entries.length) : 0,
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
    const result = enrolledLearners.filter((learner) => {
      const matchesIdentity = [learner.name, learner.email, learner.college, learner.discipline].some((value) => value.toLocaleLowerCase().includes(needle));
      const matchesCourse = learner.courses.some((course) => course.courseTitle.toLocaleLowerCase().includes(needle));
      return !needle || matchesIdentity || matchesCourse;
    });
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
  const checkInPathways = useMemo(() => visibleLearners
    .flatMap((learner) => learner.courses
      .filter((course) => course.pacing.status === 'behind')
      .map((course) => ({ learner, course })))
    .sort((a, b) => Math.abs(b.course.pacing.deltaDays) - Math.abs(a.course.pacing.deltaDays)), [visibleLearners]);
  const chartHeight = Math.max(240, courseAnalyses.length * 70 + 40);
  if (authLoading) return <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-8"><PageSkeleton /></div>;
  if (!user) return <AccessState title="Sign in to view your learners" message="Guide accounts can view progress for learners assigned to them." />;
  if (!user.isGuide) return <AccessState title="Guide access required" message="This dashboard is only available to guide accounts. Ask an administrator if you need guide access." />;
  return <div className="mx-auto min-h-[70dvh] w-full space-y-7">
    <header className="rise overflow-hidden rounded-[1.4rem] border border-primary/10 bg-card shadow-sm">
      <div className="grid gap-5 bg-primary px-5 py-6 text-primary-foreground sm:grid-cols-[1fr_auto] sm:items-end sm:px-8 sm:py-7">
        <div className="max-w-3xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[hsl(var(--turmeric))]"><ChartNoAxesCombined className="h-4 w-4" />Guide workspace <span className="text-primary-foreground/35">/</span> Portfolio analytics</p>
          <h1 className="mt-3 font-display text-3xl font-black leading-tight sm:text-[2.55rem]">Progress, with the plan beside it.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-primary-foreground/80">Compare course completion with expected pace, then open the learner context behind a pattern.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 px-3 py-2.5 text-xs text-primary-foreground/80 sm:mb-1"><LockKeyhole className="h-4 w-4 text-[hsl(var(--turmeric))]" /><span>Private workspace<br /><strong className="text-primary-foreground">Assigned learners only</strong></span></div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border xl:grid-cols-4 xl:divide-y-0">
        <SummaryMetric label="Assigned learners" value={dashboard?.learnerCount ?? '—'} detail="across supported courses" />
        <SummaryMetric label="Pathways" value={dashboard ? allCourses.length : '—'} detail="assigned course records" />
        <SummaryMetric label="Practical hours" value={dashboard ? formatHours(totalHours) : '—'} detail={`${formatHours(hoursTarget)} hrs assigned`} />
        <SummaryMetric label="Average completion" value={dashboard && allCourses.length ? `${Math.round(avgCompletion)}%` : '—'} detail={dashboard ? `${behindCount} pathways behind plan` : 'across pathways'} />
      </div>
    </header>

    {q.isLoading ? <div className="space-y-4" aria-label="Loading assigned learners" aria-busy="true">{[0, 1].map((i) => <SkeletonBlock key={i} className="h-44" />)}</div>
      : q.isError || !dashboard ? <ErrorPanel title="We could not load your assigned learners" message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : dashboard.learners.length === 0 ? <EmptyPanel title="No learners assigned yet" icon={<Users className="h-6 w-6" />}><p>{selectedLabel ? `There are no assigned learners in ${selectedLabel} yet.` : 'Your assigned learners will appear here when the programme team adds them.'}</p></EmptyPanel>
          : <>
            <section aria-labelledby="pace-heading" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--ledger))]">01 / Course signals</p><h2 id="pace-heading" className="mt-1 text-xl font-black text-primary sm:text-2xl">Completion against expected pace</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Each comparison shows average module completion beside the course plan. Pace is not a measure of learner ability.</p></div>
                <label className="flex min-h-11 w-full shrink-0 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm sm:w-auto">
                  <Filter className="h-4 w-4 shrink-0 text-[hsl(var(--ledger))]" /><span className="sr-only">Filter by course</span>
                  <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[235px]" data-testid="select-course-view">
                    <option value="">All courses</option>{dashboard.supportedCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(255px,.7fr)]">
                <article className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                    <div><h3 className="font-bold text-primary">Course pace comparison</h3><p className="mt-1 text-xs text-muted-foreground">Average completion compared with expected pace</p></div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-primary" aria-label="Chart legend"><span className="inline-flex items-center gap-2"><i aria-hidden="true" className="h-3 w-3 rounded-sm bg-[hsl(var(--ledger))]" />Completed</span><span className="inline-flex items-center gap-2"><i aria-hidden="true" className="h-3 w-3 rounded-sm bg-accent" />Expected</span></div>
                  </div>
                  {courseAnalyses.length ? <div className="mt-4 max-h-[520px] overflow-y-auto overscroll-contain" role="region" aria-label="Course completion comparison chart">
                    <div className="w-full" style={{ height: chartHeight }} role="img" aria-label={`Average completion compared with expected pace: ${courseAnalyses.map((course) => `${course.title}, ${course.completion}% complete, ${course.expected}% expected`).join('; ')}`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={courseAnalyses.map((course) => ({ title: course.title, label: course.title.length > 20 ? `${course.title.slice(0, 19).trim()}…` : course.title, completed: course.completion, expected: course.expected }))} layout="vertical" margin={{ top: 8, right: 30, left: 4, bottom: 8 }} barCategoryGap={17}>
                          <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="label" width={122} tick={{ fill: 'hsl(var(--foreground))', fontSize: 10, fontWeight: 700 }} interval={0} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{ fill: 'hsl(var(--secondary) / .45)' }} content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0]?.payload as { title: string; completed: number; expected: number } | undefined;
                            if (!row) return null;
                            return <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg"><p className="max-w-56 font-bold text-primary">{row.title}</p><p className="mt-1"><span className="font-semibold text-[hsl(var(--ledger))]">{row.completed}% complete</span><span className="text-muted-foreground"> · </span><span className="font-semibold text-accent">{row.expected}% expected</span></p></div>;
                          }} />
                          <Bar dataKey="completed" name="Completed" fill="hsl(var(--ledger))" radius={[0, 4, 4, 0]} barSize={13} isAnimationActive={false}>
                            <LabelList dataKey="completed" position="right" formatter={(value: number) => `${value}%`} className="fill-foreground" fontSize={10} fontWeight={700} />
                          </Bar>
                          <Bar dataKey="expected" name="Expected" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} barSize={13} isAnimationActive={false}>
                            <LabelList dataKey="expected" position="right" formatter={(value: number) => `${value}%`} className="fill-foreground" fontSize={10} fontWeight={700} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div> : <p className="py-8 text-center text-sm text-muted-foreground">No course progress is available for this view.</p>}
                  {courseAnalyses.length > 0 && <div className="mt-2 space-y-3 border-t border-border pt-4">
                    {courseAnalyses.map((course) => <div key={course.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs" data-testid={`text-course-pace-gap-${course.id}`}>
                      <span className="truncate font-semibold text-primary">{course.title}</span>
                      <span className={`font-bold tabular-nums ${course.completion < course.expected ? 'text-accent' : 'text-[hsl(var(--ledger))]'}`}>{course.completion < course.expected ? '−' : '+'}{Math.abs(course.completion - course.expected)} pts vs plan</span>
                    </div>)}
                  </div>}
                </article>

                <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[hsl(var(--ledger))]">Across {allCourses.length} pathways</p><h3 className="mt-1 font-bold text-primary">Pace distribution</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Count of pathways by course-plan status.</p></div><ChartNoAxesCombined className="h-5 w-5 shrink-0 text-[hsl(var(--ledger))]" /></div>
                  <div className="mt-5 space-y-4">
                    {[
                      { label: 'On track or complete', value: steadyCount, mark: '01', tone: 'bg-[hsl(var(--ledger))]' },
                      { label: 'Ahead of plan', value: aheadCount, mark: '02', tone: 'bg-primary' },
                      { label: 'Behind plan', value: behindCount, mark: '03', tone: 'bg-accent' },
                    ].map((item) => <div key={item.label}>
                      <div className="mb-1.5 flex items-end justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold text-primary"><span className="font-mono text-[10px] text-muted-foreground">{item.mark}</span>{item.label}</span><span className="text-sm font-black tabular-nums text-primary">{item.value}<span className="ml-1 text-[10px] font-medium text-muted-foreground">pathways</span></span></div>
                      <div className="h-2.5 overflow-hidden rounded-sm bg-secondary" role="img" aria-label={`${item.label}: ${item.value} of ${allCourses.length} pathways`}><div className={`h-full ${item.tone}`} style={{ width: `${allCourses.length ? item.value / allCourses.length * 100 : 0}%` }} /></div>
                    </div>)}
                  </div>
                  <div className="mt-5 rounded-xl border border-accent/25 bg-accent/5 p-3.5">
                    <p className="flex items-center gap-2 text-sm font-bold text-primary"><CircleAlert className="h-4 w-4 shrink-0 text-accent" />{behindCount} {behindCount === 1 ? 'pathway' : 'pathways'} behind plan</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Use this as a prompt to review timing with each learner. It does not describe their ability.</p>
                    <a href="#roster" className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-xs font-bold text-[hsl(var(--ledger))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="link-review-learner-roster">Review learner roster <ArrowRight className="h-3.5 w-3.5" /></a>
                  </div>
                </article>
              </div>
            </section>

            <section aria-labelledby="course-detail-heading" className="space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--ledger))]">02 / Course detail</p><h2 id="course-detail-heading" className="mt-1 text-xl font-black text-primary">Where the activity sits</h2><p className="mt-1 text-sm text-muted-foreground">Module progress and practical hours are separate signals.</p></div><span className="text-xs text-muted-foreground">{courseAnalyses.length} {courseAnalyses.length === 1 ? 'course' : 'courses'} in view</span></div>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="hidden grid-cols-[minmax(220px,1.5fr)_1fr_1fr_minmax(230px,1fr)] gap-4 border-b border-border bg-secondary/55 px-5 py-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground xl:grid"><span>Course · learners</span><span>Module completion</span><span>Practical hours</span><span>Pace status</span></div>
                <div className="divide-y divide-border">
                  {courseAnalyses.length ? courseAnalyses.map((analysis) => <CourseAnalysis key={analysis.id} analysis={analysis} onSelect={() => setCourseId(courseId === analysis.id ? '' : analysis.id)} selected={courseId === analysis.id} />) : <p className="p-5 text-sm text-muted-foreground">There are no course records in this view.</p>}
                </div>
              </div>
            </section>

            <section aria-labelledby="roster-heading" id="roster" className="space-y-4">
              <div className="border-b border-border pb-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-accent">03 / Review workspace</p><h2 id="roster-heading" className="mt-1 text-xl font-black text-primary sm:text-2xl">Assigned learner roster</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Search by learner, college, discipline or course. Open a row for the learner report and private conversation.</p></div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
                <label className="relative block"><span className="sr-only">Search assigned learners</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search name, email, college or discipline" className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="input-guide-roster-search" /></label>
                <label className="relative block"><span className="sr-only">Sort learner roster</span><ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="h-11 w-full appearance-none rounded-xl border border-input bg-card pl-10 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="select-guide-roster-sort"><option value="name">Sort: learner name</option><option value="pace">Sort: pace signal</option><option value="hours">Sort: practical hours</option><option value="reports">Sort: saved reports</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 text-muted-foreground" /></label>
              </div>
              {visibleLearners.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center"><Filter className="mx-auto h-5 w-5 text-muted-foreground" /><h3 className="mt-2 font-bold text-primary">No learners match this view</h3><p className="mt-1 text-sm text-muted-foreground">Try a different search or course filter.</p><button type="button" onClick={() => { setSearch(''); setCourseId(''); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold text-[hsl(var(--ledger))] hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="button-clear-guide-filters">Clear filters</button></div>
                : <div className="space-y-3">
                  <p className="text-xs text-muted-foreground" aria-live="polite">Showing {visibleLearners.length} of {dashboard.learnerCount} assigned {dashboard.learnerCount === 1 ? 'learner' : 'learners'}</p>
                  {visibleLearners.map((learner) => <details key={learner.id} className="group ink-card overflow-hidden" data-testid={`card-guide-learner-${learner.id}`}>
                    <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 [&::-webkit-details-marker]:hidden">
                      <span className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground">{learner.name.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</span><span className="min-w-0"><span className="block truncate font-bold text-primary" data-testid={`text-guide-learner-${learner.id}`}>{learner.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{learner.college} · {learner.discipline}</span></span></span>
                      <span className="flex shrink-0 items-center gap-2"><span className="hidden rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground sm:inline">{learner.courses.length} {learner.courses.length === 1 ? 'pathway' : 'pathways'}</span><span className="hidden rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground sm:inline">{learner.reports.length} {learner.reports.length === 1 ? 'report' : 'reports'}</span><span className="hidden text-xs tabular-nums text-muted-foreground lg:inline">{learner.courses.length ? `${Math.round(learner.courses.reduce((sum, course) => sum + course.pacing.completedPercent, 0) / learner.courses.length)}% average completion` : 'No active pathway'}</span><ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" /></span>
                    </summary>
                    <div className="border-t border-border bg-secondary/15 p-4 sm:p-5">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{learner.courses.length} {learner.courses.length === 1 ? 'pathway' : 'pathways'}</span><span>{learner.reports.length} saved {learner.reports.length === 1 ? 'report' : 'reports'}</span><span className="break-all">{learner.email}</span></div>
                      <div className="space-y-4">
                        {learner.courses.length ? <div className="grid gap-4 lg:grid-cols-2">{learner.courses.map((course) => <PaceCard key={course.enrollmentId} course={course} />)}</div> : <p className="rounded-xl bg-secondary/40 p-4 text-sm text-muted-foreground">No active pathway details are available for this learner.</p>}
                        <section className="rounded-xl border border-[hsl(var(--ledger))]/25 bg-[hsl(var(--ledger-soft))]/55 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--ledger))]" /><div><h4 className="text-sm font-bold text-primary">Saved learning reports</h4><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Report contents open through audited guide access. Each opening is recorded.</p></div></div>{learner.reports.length === 0 && <span className="text-xs text-muted-foreground">No saved reports</span>}</div>
                          {learner.reports.length > 0 && <ul className="mt-3 divide-y divide-[hsl(var(--ledger))]/15 overflow-hidden rounded-lg border border-[hsl(var(--ledger))]/20 bg-card">{[...learner.reports].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).map((report) => <li key={report.id}><Link href={`/guide/learners/${learner.id}/reports/${report.id}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`link-guide-report-${report.id}`}><span className="inline-flex items-center gap-2 font-semibold text-primary"><FileText className="h-4 w-4 text-[hsl(var(--ledger))]" />Version {report.version} · {fmtDate(report.completedAt)}</span><span className="font-bold text-[hsl(var(--ledger))]">Open audited report</span></Link></li>)}</ul>}
                        </section>
                      </div>
                    </div>
                  </details>)}
                </div>}
            </section>
          </>}
  </div>;
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
