import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Clock3, FileText, Search, X } from 'lucide-react';
import {
  getGetGuideDashboardQueryKey,
  type GetGuideDashboardParams,
  useGetGuideDashboard,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { EmptyPanel, ErrorPanel, PageSkeleton } from '@/components/assessment/parts';
import { errMsg, formatHours, formatIndiaDate, useAuth, useTitle } from '@/lib/app';

type LogbookRow = {
  id: string;
  date: string;
  hours: number;
  activity: string;
  learning: string;
  learnerId: string;
  learnerName: string;
  email: string;
  college: string;
  discipline: string;
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
};

function Summary({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="min-w-0 rounded-2xl border border-border bg-card px-4 py-3.5 sm:px-5">
    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-black tabular-nums text-primary">{value}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
  </article>;
}

export default function GuideLogbookPage() {
  useTitle('Learner logbooks');
  const { user, isLoading: authLoading } = useAuth();
  const params: GetGuideDashboardParams = {};
  const query = useGetGuideDashboard(params, {
    query: {
      enabled: !!user?.isGuide,
      queryKey: [...getGetGuideDashboardQueryKey(params), user?.id ?? 'anonymous'],
      refetchOnMount: 'always',
    },
  });
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState('');

  const learners = query.data?.learners ?? [];
  const entries = useMemo<LogbookRow[]>(() => learners.flatMap((learner) =>
    learner.courses.flatMap((course) => course.practicalLogs.map((entry) => ({
      ...entry,
      learnerId: learner.id,
      learnerName: learner.name,
      email: learner.email,
      college: learner.college,
      discipline: learner.discipline,
      enrollmentId: course.enrollmentId,
      courseId: course.courseId,
      courseTitle: course.courseTitle,
    }))),
  ).sort((a, b) => b.date.localeCompare(a.date) || a.learnerName.localeCompare(b.learnerName)), [learners]);

  const visibleEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      const matchesCourse = !courseId || entry.courseId === courseId;
      const matchesSearch = !term || [
        entry.learnerName, entry.email, entry.college, entry.discipline,
        entry.courseTitle, entry.activity, entry.learning,
      ].some((value) => value.toLocaleLowerCase().includes(term));
      return matchesCourse && matchesSearch;
    });
  }, [courseId, entries, search]);
  const totalHours = visibleEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const learnerCount = new Set(visibleEntries.map((entry) => entry.learnerId)).size;

  if (authLoading) return <main className="mx-auto max-w-6xl p-4 sm:p-8"><PageSkeleton /></main>;
  if (!user) return <main className="mx-auto max-w-4xl p-4 sm:p-8"><EmptyPanel title="Sign in to view learner logbooks" icon={<FileText className="h-6 w-6" />}><p>Only guides can review practical-hour entries from their assigned learners.</p><Button asChild variant="outline" className="mt-4"><Link href="/login">Sign in</Link></Button></EmptyPanel></main>;
  if (!user.isGuide) return <main className="mx-auto max-w-4xl p-4 sm:p-8"><EmptyPanel title="Guide access required" icon={<FileText className="h-6 w-6" />}><p>This view only shows practical logs for learners assigned to the signed-in guide.</p><Button asChild variant="outline" className="mt-4"><Link href="/">Go to Adhyayaan</Link></Button></EmptyPanel></main>;

  return <main className="mx-auto min-w-0 max-w-6xl space-y-5 pb-8">
    <Link href="/guide" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted-foreground hover:bg-secondary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="link-back-guide-dashboard"><ArrowLeft className="h-4 w-4" />Guide dashboard</Link>

    <header className="overflow-hidden rounded-2xl border border-primary/10 bg-card shadow-sm">
      <div className="bg-primary px-4 py-5 text-primary-foreground sm:px-7 sm:py-7">
        <p className="text-[11px] font-bold uppercase tracking-[.15em] text-[hsl(var(--turmeric))]">Guide workspace · Practical work</p>
        <h1 className="mt-2 font-display text-2xl font-black leading-tight sm:text-3xl">Learner logbooks</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-primary-foreground/80">Review what assigned learners did, what they learned, and how their recorded hours add up. Viewing an entry does not approve or certify hours.</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 sm:divide-y-0">
        <Summary label="Assigned learners" value={String(learnerCount)} note="with entries in this view" />
        <Summary label="Log entries" value={String(visibleEntries.length)} note="matching the filters" />
        <div className="col-span-2 sm:col-span-1"><Summary label="Hours recorded" value={formatHours(totalHours)} note="sum of visible entries" /></div>
      </div>
    </header>

    <section aria-label="Filter learner logbooks" className="grid min-w-0 gap-3 rounded-2xl border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,18rem)] sm:p-4">
      <label className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="sr-only">Search logbook entries</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search learner, course or entry text" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" data-testid="input-guide-logbook-search" />
        {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear logbook search" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-secondary" data-testid="button-clear-guide-logbook-search"><X className="h-4 w-4" /></button>}
      </label>
      <label className="min-w-0">
        <span className="sr-only">Filter logbook entries by course</span>
        <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="select-guide-logbook-course">
          <option value="">All assigned courses</option>
          {(query.data?.supportedCourses ?? []).map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
        </select>
      </label>
    </section>

    {query.isLoading ? <div className="space-y-3" aria-label="Loading learner logbooks" aria-busy="true">{[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-card" />)}</div>
      : query.isError ? <ErrorPanel title="Learner logbooks did not load" message={errMsg(query.error)} onRetry={() => void query.refetch()} />
        : visibleEntries.length === 0 ? <EmptyPanel title={entries.length ? 'No entries match these filters' : 'No logbook entries yet'} icon={<Clock3 className="h-6 w-6" />}><p>{entries.length ? 'Try a different learner name, course or search term.' : 'Practical-hour entries from learners assigned to you will appear here.'}</p>{(search || courseId) && <Button type="button" variant="outline" className="mt-4" onClick={() => { setSearch(''); setCourseId(''); }} data-testid="button-clear-guide-logbook-filters">Clear filters</Button>}</EmptyPanel>
          : <section aria-label="Assigned learners' practical-hour entries" className="space-y-3">
            <p className="px-1 text-xs text-muted-foreground" aria-live="polite">Showing {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'} for {learnerCount} {learnerCount === 1 ? 'learner' : 'learners'}</p>
            <ol className="space-y-3">
              {visibleEntries.map((entry) => <li key={entry.id} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm" data-testid={`card-guide-logbook-entry-${entry.id}`}>
                <details className="group">
                  <summary className="grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_minmax(10rem,.7fr)_auto] sm:p-4 [&::-webkit-details-marker]:hidden" data-testid={`summary-guide-logbook-entry-${entry.id}`}>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]"><Clock3 className="h-4 w-4" /></span>
                      <span className="min-w-0"><span className="block truncate text-sm font-bold text-primary">{entry.learnerName}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{entry.college || entry.discipline || entry.email}</span></span>
                    </span>
                    <span className="col-span-2 min-w-0 pl-[3.25rem] sm:col-span-1 sm:pl-0"><span className="block truncate text-xs font-semibold text-primary">{entry.courseTitle}</span><span className="mt-0.5 block text-xs text-muted-foreground">{formatIndiaDate(entry.date, true)}</span></span>
                    <span className="flex items-center gap-2 justify-self-end"><span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold tabular-nums text-primary">{formatHours(entry.hours)} {entry.hours === 1 ? 'hour' : 'hours'}</span><span className="hidden text-xs font-semibold text-[hsl(var(--ledger))] sm:inline group-open:hidden">Read entry</span><span className="hidden text-xs font-semibold text-[hsl(var(--ledger))] group-open:inline">Hide</span></span>
                  </summary>
                  <div className="grid min-w-0 gap-3 border-t border-border bg-secondary/15 p-3.5 sm:grid-cols-2 sm:p-4">
                    <div className="min-w-0 rounded-xl border border-border bg-card p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Activity</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{entry.activity}</p></div>
                    <div className="min-w-0 rounded-xl border border-border bg-card p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">What the learner learned</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{entry.learning}</p></div>
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:col-span-2">
                      <span className="min-w-0 truncate text-xs text-muted-foreground">{entry.discipline || entry.email}</span>
                      <Button asChild size="sm" variant="outline" className="min-h-10 shrink-0" data-testid={`button-guide-logbook-chat-${entry.id}`}><Link href={`/mentorship/${entry.enrollmentId}`}>Open conversation</Link></Button>
                    </div>
                  </div>
                </details>
              </li>)}
            </ol>
          </section>}
  </main>;
}
