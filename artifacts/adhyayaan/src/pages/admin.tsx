import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowLeft, ChevronLeft, ChevronRight, Lock, Search, ShieldCheck, Users } from 'lucide-react';
import {
  useListAdminLearners,
  useGetAdminLearner,
  useGetAdminLearningReport,
  getListAdminLearnersQueryKey,
  getGetAdminLearnerQueryKey,
  getGetAdminLearningReportQueryKey,
  type ListAdminLearnersAssessment,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authHref, errMsg, useAuth, useTitle } from '@/lib/app';
import { EmptyPanel, ErrorPanel, PageSkeleton, ReportHeading, ReportHistory, ReportView, SkeletonBlock, fmtDate } from '@/components/assessment/parts';
import { AdminGuidesPanel } from '@/pages/admin-guides';

function useAdminGate(path: string) {
  const { user, isLoading } = useAuth();
  const ok = !!user?.isAdmin;
  let gate = null;
  if (isLoading) gate = <div className="mx-auto max-w-5xl p-4 sm:p-8"><PageSkeleton /></div>;
  else if (!user) gate = (
    <div className="mx-auto max-w-xl p-4 sm:p-8">
      <EmptyPanel title="Sign in to continue" icon={<Lock className="h-6 w-6" />}>
        <p>This area is for authorised admins.</p>
        <Button asChild className="mt-3"><Link href={authHref('login', path)} data-testid="link-login">Sign in</Link></Button>
      </EmptyPanel>
    </div>
  );
  else if (!ok) gate = (
    <div className="mx-auto max-w-xl p-4 sm:p-8">
      <EmptyPanel title="This area is for admins" icon={<Lock className="h-6 w-6" />}>
        <p>Your account does not have admin access. Ask your programme lead if you need it.</p>
        <Button asChild variant="outline" className="mt-3"><Link href="/" data-testid="link-home">Go to Today</Link></Button>
      </EmptyPanel>
    </div>
  );
  return { ok, gate };
}

function Kicker({ children }: { children: string }) {
  return <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{children}</p>;
}

function Stat({ n, label, testid }: { n: number | string; label: string; testid: string }) {
  return (
    <div className="ink-card p-4">
      <div className="text-2xl font-black text-primary sm:text-3xl" data-testid={testid}>{n}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

/* ---------------- Directory ---------------- */

export function AdminDirectoryPage() {
  useTitle('Admin directory');
  const { ok, gate } = useAdminGate('/admin');
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [assessment, setAssessment] = useState<ListAdminLearnersAssessment>('all');
  const [page, setPage] = useState(1);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onSearch = (v: string) => {
    setDraft(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setSearch(v.trim().slice(0, 120)); setPage(1); }, 300);
  };

  const params = { search: search || undefined, assessment, page };
  const q = useListAdminLearners(params, { query: { enabled: ok, queryKey: getListAdminLearnersQueryKey(params), placeholderData: (p) => p } });

  if (gate) return gate;
  const d = q.data;
  const pages = d ? Math.max(1, Math.ceil(d.matchCount / Math.max(1, d.pageSize))) : 1;
  const filters: [ListAdminLearnersAssessment, string][] = [['all', 'All'], ['completed', 'Report saved'], ['pending', 'No report yet']];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <div className="rise">
        <Kicker>Admin</Kicker>
        <h1 className="font-display mt-1 text-3xl font-black text-primary sm:text-4xl">Learner directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">Open a learner to see course progress and saved reports. Drafts stay private.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {d ? (<>
          <Stat n={d.learnerCount} label="learners" testid="text-learner-count" />
          <Stat n={d.completedCount} label="with a saved report" testid="text-completed-count" />
          <Stat n={d.learnerCount - d.completedCount} label="without a report" testid="text-pending-count" />
          <Stat n={d.enrollmentCount} label="enrolments" testid="text-enrollment-count" />
        </>) : [0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-20" />)}
      </div>

      <AdminGuidesPanel />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block md:w-80">
          <span className="sr-only">Search learners</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={draft} onChange={(e) => onSearch(e.target.value)} maxLength={120} placeholder="Search name, email or college" className="pl-9" data-testid="input-search" />
        </label>
        <div role="tablist" aria-label="Report filter" className="inline-flex rounded-full border border-border bg-card p-1">
          {filters.map(([v, l]) => (
            <button key={v} role="tab" aria-selected={assessment === v} onClick={() => { setAssessment(v); setPage(1); }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${assessment === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-primary'}`}
              data-testid={`button-filter-${v}`}>{l}</button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <SkeletonBlock key={i} className="h-14" />)}</div>
      ) : q.isError || !d ? (
        <ErrorPanel title="We could not load learners" message={errMsg(q.error)} onRetry={() => q.refetch()} />
      ) : d.students.length === 0 ? (
        <EmptyPanel title={search || assessment !== 'all' ? 'No learners match' : 'No learners yet'} icon={<Users className="h-6 w-6" />}>
          {search || assessment !== 'all' ? 'Change the search or the filter.' : 'Learners show here after they sign up.'}
        </EmptyPanel>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="text-match-count">{d.matchCount} {d.matchCount === 1 ? 'learner' : 'learners'} found</p>
          <div className={`ink-card overflow-x-auto transition-opacity ${q.isFetching ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-4 py-3">Learner</th><th className="px-4 py-3">College</th><th className="px-4 py-3">Courses</th><th className="px-4 py-3">Report</th><th className="px-4 py-3">Joined</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.students.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-secondary/40" data-testid={`row-learner-${s.id}`}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/learners/${s.id}`} className="font-bold text-primary hover:text-accent" data-testid={`link-learner-${s.id}`}>{s.name}</Link>
                      <div className="text-xs text-muted-foreground">{s.email}</div>
                    </td>
                    <td className="px-4 py-3">{s.college}<div className="text-xs text-muted-foreground">{s.discipline}</div></td>
                    <td className="px-4 py-3 font-semibold">{s.enrollmentCount}</td>
                    <td className="px-4 py-3">{s.assessmentCompletedAt
                      ? <span className="ledger-chip rounded-full px-2.5 py-0.5 text-xs font-semibold">Saved {fmtDate(s.assessmentCompletedAt)}</span>
                      : <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Not yet</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground" data-testid="text-page">Page {d.page} of {pages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="button-prev-page"><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="button-next-page">Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Learner ---------------- */

export function AdminLearnerPage() {
  const { id = '' } = useParams<{ id: string }>();
  useTitle('Learner progress');
  const { ok, gate } = useAdminGate(`/admin/learners/${id}`);
  const q = useGetAdminLearner(id, { query: { enabled: ok && !!id, queryKey: getGetAdminLearnerQueryKey(id) } });
  if (gate) return gate;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <Link href="/admin" className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-directory"><ArrowLeft className="mr-1 h-4 w-4" />Directory</Link>
      {q.isLoading ? <PageSkeleton /> : q.isError || !q.data ? (
        <ErrorPanel title="We could not load this learner" message={errMsg(q.error)} onRetry={() => q.refetch()} />
      ) : (() => {
        const { student: s, courses, reports } = q.data;
        return (
          <>
            <div className="rise">
              <Kicker>Learner</Kicker>
              <h1 className="font-display mt-1 text-3xl font-black text-primary" data-testid="text-learner-name">{s.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{s.email} · {s.college} · {s.discipline} · joined {fmtDate(s.createdAt)}</p>
            </div>
            <section>
              <h2 className="mb-3 text-lg font-black text-primary">Courses ({courses.length})</h2>
              {courses.length === 0 ? <EmptyPanel title="No courses yet">This learner has not enrolled in a course.</EmptyPanel> : (
                <div className="grid gap-4 md:grid-cols-2">
                  {courses.map((c) => {
                    const mp = c.totalModules ? Math.round((c.completedModules / c.totalModules) * 100) : 0;
                    const hp = c.targetHours ? Math.min(100, Math.round((c.loggedHours / c.targetHours) * 100)) : 0;
                    return (
                      <article key={c.courseId} className="ink-card lift p-5" data-testid={`card-course-${c.courseId}`}>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-black text-primary">{c.title}</h3>
                          <span className="ledger-chip flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize">{c.projectStatus.replace(/_/g, ' ')}</span>
                        </div>
                        <Meter label="Modules" value={`${c.completedModules} / ${c.totalModules}`} pct={mp} />
                        <Meter label="Hours logged" value={`${c.loggedHours} / ${c.targetHours}`} pct={hp} />
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                          <dt className="text-muted-foreground">Practice sets</dt><dd className="text-right font-semibold">{c.practiceCount}</dd>
                          <dt className="text-muted-foreground">Practice average</dt><dd className="text-right font-semibold">{c.practiceAverage === null ? 'None yet' : `${Math.round(c.practiceAverage * 10) / 10}`}</dd>
                          <dt className="text-muted-foreground">Lessons read</dt><dd className="text-right font-semibold">{c.lessonsRead}</dd>
                          <dt className="text-muted-foreground">Study checks</dt><dd className="text-right font-semibold">{c.studyChecks} <span className="font-normal text-muted-foreground">({c.secureChecks} secure)</span></dd>
                        </dl>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <section>
              <h2 className="mb-1 text-lg font-black text-primary">Saved learning reports</h2>
              <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Opening a report is recorded. Drafts are not visible.</p>
              <ReportHistory reports={reports} hrefFor={(r) => `/admin/learners/${s.id}/reports/${r.id}`} emptyText="This learner has no saved report yet." />
            </section>
          </>
        );
      })()}
    </div>
  );
}

function Meter({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left rounded-full bg-accent motion-safe:transition-transform motion-safe:duration-700" style={{ transform: `scaleX(${pct / 100})` }} /></div>
    </div>
  );
}

/* ---------------- Report (audited) ---------------- */

export function AdminLearningReportPage() {
  const { id = '', reportId = '' } = useParams<{ id: string; reportId: string }>();
  useTitle('Learner report');
  const { ok, gate } = useAdminGate(`/admin/learners/${id}/reports/${reportId}`);
  const q = useGetAdminLearningReport(id, reportId, { query: { enabled: ok && !!id && !!reportId, queryKey: getGetAdminLearningReportQueryKey(id, reportId) } });
  if (gate) return gate;
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <Link href={`/admin/learners/${id}`} className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-learner"><ArrowLeft className="mr-1 h-4 w-4" />Learner</Link>
      {q.isLoading ? <PageSkeleton /> : q.isError || !q.data ? (
        <ErrorPanel title="We could not open this report" message={errMsg(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <>
          <ReportHeading report={q.data} kicker="Learner report" />
          <p className="flex items-start gap-2 rounded-xl border-l-4 border-[hsl(var(--ledger))] bg-card p-4 text-sm"><ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-[hsl(var(--ledger))]" />This view is recorded. Use it to support the learner. Do not use it to rank or label them.</p>
          <ReportView report={q.data} audience="admin" />
        </>
      )}
    </div>
  );
}
