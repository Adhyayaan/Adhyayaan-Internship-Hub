import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, BookOpen, Clock3, GraduationCap, LockKeyhole, ShieldCheck, Target, Users, MessagesSquare } from 'lucide-react';
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
      {p.cohortPercentile !== null && <p className="mt-1.5 text-xs text-muted-foreground">Around the {ordinal(p.cohortPercentile)} percentile for this course and pathway.</p>}
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

export function GuideDashboardPage() {
  useTitle('Guide dashboard');
  const { user, isLoading: authLoading } = useAuth();
  const [courseId, setCourseId] = useState('');
  const params: GetGuideDashboardParams = courseId ? { courseId } : {};
  const q = useGetGuideDashboard(params, { query: { enabled: !!user?.isGuide, queryKey: getGetGuideDashboardQueryKey(params) } });
  if (authLoading) return <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-8"><PageSkeleton /></div>;
  if (!user) return <AccessState title="Sign in to view your learners" message="Guide accounts can view progress for learners assigned to them." />;
  if (!user.isGuide) return <AccessState title="Guide access required" message="This dashboard is only available to guide accounts. Ask an administrator if you need guide access." />;
  const dashboard = q.data;
  const selectedLabel = dashboard?.supportedCourses.find((c) => c.id === courseId)?.title;
  const courses = dashboard?.learners.flatMap((l) => l.courses) ?? [];
  const behindCount = courses.filter((c) => c.pacing.status === 'behind').length;
  const loggedHours = courses.reduce((sum, c) => sum + c.loggedHours, 0);
  return <main className="mx-auto min-h-[70dvh] max-w-6xl space-y-6 p-4 pb-24 sm:space-y-8 sm:p-8">
    <header className="rise relative overflow-hidden rounded-[1.5rem] bg-primary px-5 py-6 text-primary-foreground sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 opacity-20 sm:block" aria-hidden="true"><div className="alpona-dots h-full w-full" /></div>
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[hsl(var(--turmeric))]">Guide workspace</p>
          <h1 className="font-display mt-2 text-3xl font-black leading-tight sm:text-4xl">A clearer view of each pathway.</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-primary-foreground/80">Review progress, practical hours and learning activity for learners assigned to you.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3"><p className="text-2xl font-black tabular-nums">{dashboard?.learnerCount ?? '—'}</p><p className="text-xs text-primary-foreground/75">assigned learners</p></div>
          <div className="rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3"><p className="text-2xl font-black tabular-nums">{dashboard ? formatHours(loggedHours) : '—'}</p><p className="text-xs text-primary-foreground/75">practical hours</p></div>
        </div>
      </div>
    </header>
    <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Learner roster</p><h2 className="mt-1 text-xl font-black text-primary">Assigned to you</h2><p className="mt-1 text-sm text-muted-foreground">Only learners assigned by the programme are shown here.</p></div>
      <label className="block w-full sm:w-72"><span className="mb-1.5 block text-sm font-semibold">Course view</span><select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="select-course-view"><option value="">All supported courses</option>{dashboard?.supportedCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
    </section>
    {q.isLoading ? <div className="space-y-4" aria-label="Loading assigned learners" aria-busy="true">{[0, 1].map((i) => <SkeletonBlock key={i} className="h-44" />)}</div>
      : q.isError || !dashboard ? <ErrorPanel title="We could not load your assigned learners" message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : dashboard.learners.length === 0 ? <EmptyPanel title="No learners assigned yet" icon={<Users className="h-6 w-6" />}><p>{selectedLabel ? `There are no assigned learners in ${selectedLabel} yet.` : 'Your assigned learners will appear here when the programme team adds them.'}</p></EmptyPanel>
          : <div className="space-y-5">
            {behindCount > 0 && <p className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-sm text-foreground" role="status"><span className="font-bold">{behindCount} pathway{behindCount === 1 ? '' : 's'} behind pace.</span> Use this as a prompt for a supportive check-in, not a label of ability.</p>}
            {dashboard.learners.map((learner) => <article key={learner.id} className="ink-card overflow-hidden" data-testid={`card-guide-learner-${learner.id}`}>
              <div className="flex flex-col gap-3 border-b border-border bg-secondary/35 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-sm font-black text-primary-foreground">{learner.name.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</div>
                  <div className="min-w-0"><h3 className="font-display text-lg font-bold text-primary" data-testid={`text-guide-learner-${learner.id}`}>{learner.name}</h3><p className="break-all text-xs text-muted-foreground">{learner.email}</p><p className="mt-1 text-sm text-foreground">{learner.college} <span className="text-muted-foreground">· {learner.discipline}</span></p></div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-card px-3 py-1.5 font-semibold">{learner.courses.length} {learner.courses.length === 1 ? 'pathway' : 'pathways'}</span><span className="rounded-full bg-card px-3 py-1.5 font-semibold">{learner.reports.length} saved {learner.reports.length === 1 ? 'report' : 'reports'}</span></div>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                {learner.courses.length ? <div className="grid gap-4 lg:grid-cols-2">{learner.courses.map((course) => <PaceCard key={course.enrollmentId} course={course} />)}</div> : <p className="rounded-xl bg-secondary/40 p-4 text-sm text-muted-foreground">No active pathway details are available for this learner.</p>}
                <section className="rounded-xl border border-[hsl(var(--ledger))]/25 bg-[hsl(var(--ledger-soft))]/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--ledger))]" /><div><h4 className="text-sm font-bold text-primary">Saved learning reports</h4><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Report contents are opened only through the audited guide access.</p></div></div>
                    {learner.reports.length === 0 && <span className="text-xs text-muted-foreground">No saved reports</span>}
                  </div>
                  {learner.reports.length > 0 && <ul className="mt-3 divide-y divide-[hsl(var(--ledger))]/15 overflow-hidden rounded-lg border border-[hsl(var(--ledger))]/20 bg-card">
                    {[...learner.reports].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).map((report) => <li key={report.id}><Link href={`/guide/learners/${learner.id}/reports/${report.id}`} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`link-guide-report-${report.id}`}><span className="font-semibold text-primary">Version {report.version} · {fmtDate(report.completedAt)}</span><span className="font-bold text-[hsl(var(--ledger))]">Open audited report</span></Link></li>)}
                  </ul>}
                </section>
              </div>
            </article>)}
          </div>}
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
