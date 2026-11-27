import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'wouter';
import { Activity, ArrowRight, BookOpenCheck, Check, ChevronLeft, ChevronRight, Clock3, Copy, GraduationCap, Search, ShieldAlert, ShieldCheck, Users, UserCog, UserRoundCheck, X } from 'lucide-react';
import {
  getGetSuperadminAnalyticsQueryKey,
  getListAdminGuidesQueryKey,
  getListCoursesQueryKey,
  getListSuperadminAccountsQueryKey,
  useCreateSuperadminGuide,
  useGetSuperadminAnalytics,
  useListCourses,
  useListSuperadminAccounts,
  useUpdateSuperadminAccountRole,
  type SuperadminAccount,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { EmptyPanel, ErrorPanel, SkeletonBlock } from '@/components/assessment/parts';
import { authHref, errMsg, useAuth, useTitle } from '@/lib/app';

type RoleFilter = 'all' | 'student' | 'admin' | 'guide' | 'superadmin';
type EditableRole = 'student' | 'admin' | 'superadmin';
const guideFormSchema = z.object({
  name: z.string().trim().min(2, 'Enter the guide’s full name.').max(100, 'Name must be 100 characters or fewer.'),
  email: z.string().trim().email('Enter a valid guide email address.').max(254, 'Email must be 254 characters or fewer.'),
  supportedCourseIds: z.array(z.string()).min(1, 'Choose at least one supported internship.').max(30),
  availableForAssignments: z.boolean(),
});
type GuideFormValues = z.infer<typeof guideFormSchema>;

const roles: { value: RoleFilter; label: string }[] = [
  { value: 'all', label: 'All accounts' },
  { value: 'student', label: 'Students' },
  { value: 'admin', label: 'Admins' },
  { value: 'guide', label: 'Guides' },
  { value: 'superadmin', label: 'Superadmins' },
];

function formatCount(value: number) {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function roleLabel(role: string) {
  return role === 'superadmin' ? 'Superadmin' : role.charAt(0).toUpperCase() + role.slice(1);
}

function RoleBadge({ role, testId }: { role: string; testId: string }) {
  const style = role === 'superadmin'
    ? 'bg-primary text-primary-foreground'
    : role === 'admin'
      ? 'bg-accent/10 text-accent'
      : role === 'guide'
        ? 'ledger-chip'
        : 'bg-secondary text-secondary-foreground';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${style}`} data-testid={testId}>{roleLabel(role)}</span>;
}

function Gate({ loading, isSuperadmin }: { loading: boolean; isSuperadmin: boolean }) {
  const { user } = useAuth();
  if (loading) return <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-8" aria-busy="true" data-testid="status-superadmin-loading"><SkeletonBlock className="h-10 w-1/3" /><SkeletonBlock className="h-44" /><SkeletonBlock className="h-64" /></div>;
  if (!user) return <div className="mx-auto max-w-xl p-4 sm:p-8"><EmptyPanel title="Sign in to continue" icon={<ShieldCheck className="h-6 w-6" />}><p>This workspace is restricted to trusted platform operators.</p><Button asChild className="mt-3"><Link href={authHref('login', '/superadmin')} data-testid="link-superadmin-login">Sign in</Link></Button></EmptyPanel></div>;
  if (!isSuperadmin) return <div className="mx-auto max-w-xl p-4 sm:p-8"><EmptyPanel title="Superadmin access required" icon={<ShieldCheck className="h-6 w-6" />}><p>Your account does not have platform operator access. Superadmin controls are not available to ordinary admins.</p><Button asChild variant="outline" className="mt-3"><Link href={user.isGuide ? '/guide' : user.isAdmin ? '/admin' : '/'} data-testid="link-superadmin-home">Return to your workspace</Link></Button></EmptyPanel></div>;
  return null;
}

function Metric({ label, value, icon: Icon, note, testId }: { label: string; value: number | string; icon: typeof Users; note: string; testId: string }) {
  return <article className="ink-card flex min-w-0 items-start gap-3 p-4 sm:p-5" data-testid={`card-${testId}`}>
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary"><Icon className="h-5 w-5" /></span>
    <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-black leading-none text-primary sm:text-3xl" data-testid={`text-${testId}`}>{formatCount(Number(value))}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>
  </article>;
}

export default function SuperadminPage() {
  useTitle('Superadmin workspace');
  const { user, isLoading: sessionLoading } = useAuth();
  const allowed = !!user?.isSuperadmin;
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const guideForm = useForm<GuideFormValues>({
    resolver: zodResolver(guideFormSchema),
    defaultValues: { name: '', email: '', supportedCourseIds: [], availableForAssignments: true },
  });
  const [guideFormError, setGuideFormError] = useState('');
  const [guideCredential, setGuideCredential] = useState<{ name: string; email: string; password: string } | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const params = { search: search || undefined, role, page };
  const analytics = useGetSuperadminAnalytics({ query: { enabled: allowed, queryKey: getGetSuperadminAnalyticsQueryKey() } });
  const directory = useListSuperadminAccounts(params, { query: { enabled: allowed, queryKey: getListSuperadminAccountsQueryKey(params), placeholderData: (previous) => previous } });
  const courses = useListCourses({ query: { enabled: allowed, queryKey: getListCoursesQueryKey() } });
  const updateRole = useUpdateSuperadminAccountRole();
  const createGuide = useCreateSuperadminGuide();

  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onSearch = (value: string) => {
    setDraft(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setSearch(value.trim().slice(0, 120)); setPage(1); }, 300);
  };
  const changeRole = async (account: SuperadminAccount, nextRole: EditableRole) => {
    if (account.role === nextRole || account.id === user?.id) return;
    const guideNote = account.role === 'guide'
      ? ' Their active learner assignments will become unassigned so the guide pool can reassign them.'
      : '';
    const message = `Change ${account.name}'s role from ${roleLabel(account.role)} to ${roleLabel(nextRole)}?${guideNote}`;
    if (!window.confirm(message)) return;
    setSavingId(account.id);
    setNotice('');
    try {
      await updateRole.mutateAsync({ id: account.id, data: { role: nextRole } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListSuperadminAccountsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetSuperadminAnalyticsQueryKey() }),
      ]);
      setNotice(`${account.name}'s role is now ${roleLabel(nextRole)}.`);
    } catch (error) {
      setNotice(`Role could not be changed. ${errMsg(error)}`);
    } finally {
      setSavingId(null);
    }
  };
  const submitGuide = async (values: GuideFormValues) => {
    setGuideFormError('');
    try {
      const result = await createGuide.mutateAsync({
        data: {
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          supportedCourseIds: values.supportedCourseIds,
          availableForAssignments: values.availableForAssignments,
        },
      });
      setGuideCredential({ name: result.guide.name, email: result.guide.email, password: result.temporaryPassword });
      setPasswordCopied(false);
      guideForm.reset({ name: '', email: '', supportedCourseIds: [], availableForAssignments: true });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListSuperadminAccountsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetSuperadminAnalyticsQueryKey() }),
        qc.invalidateQueries({ queryKey: getListAdminGuidesQueryKey() }),
      ]);
    } catch (error) {
      setGuideFormError(errMsg(error));
    }
  };
  const copyTemporaryPassword = async () => {
    if (!guideCredential) return;
    try {
      await navigator.clipboard.writeText(guideCredential.password);
      setPasswordCopied(true);
    } catch {
      setPasswordCopied(false);
      setGuideFormError('Copy was not available in this browser. Select the temporary password and copy it manually.');
    }
  };
  const dismissGuideCredential = () => {
    setGuideCredential(null);
    setPasswordCopied(false);
    setGuideFormError('');
    createGuide.reset();
  };

  if (sessionLoading) return <Gate loading isSuperadmin={false} />;
  if (!user) return <Gate loading={false} isSuperadmin={false} />;
  if (!allowed) return <Gate loading={false} isSuperadmin={false} />;
  const a = analytics.data;
  const d = directory.data;
  const totalPages = d ? Math.max(1, Math.ceil(d.matchCount / Math.max(1, d.pageSize))) : 1;
  const completionRate = a?.enrollmentCount ? Math.round((a.completedEnrollmentCount / a.enrollmentCount) * 100) : 0;

  return <div className="mx-auto max-w-6xl space-y-7 p-4 sm:p-8">
    <header className="rise flex flex-col gap-5 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-accent"><span className="h-px w-6 bg-accent" />Platform operations</p>
        <h1 className="font-display mt-2 text-3xl font-black leading-tight text-primary sm:text-4xl" data-testid="text-superadmin-title">Superadmin workspace</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">A platform-wide view of internship progress, account access and the people supporting each pathway.</p>
      </div>
      <Link href="/admin#guide-pool" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="link-guide-pool">
        <UserRoundCheck className="h-4 w-4 text-[hsl(var(--ledger))]" /> Guide pool workflow <ArrowRight className="h-4 w-4" />
      </Link>
    </header>

    {analytics.isLoading ? <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading platform overview" aria-busy="true">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-28" />)}</section>
      : analytics.isError || !a ? <ErrorPanel title="Platform overview is unavailable" message={errMsg(analytics.error)} onRetry={() => analytics.refetch()} />
        : <section aria-label="Platform overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Accounts" value={a.totalAccounts} icon={Users} note={`${formatCount(a.studentCount)} student accounts`} testId="accounts-total" />
            <Metric label="Enrolments" value={a.enrollmentCount} icon={GraduationCap} note={`${formatCount(a.activeEnrollmentCount)} currently active`} testId="enrollments-total" />
            <Metric label="Practical hours" value={a.loggedPracticalHours} icon={Clock3} note="Recorded across internship work" testId="hours-total" />
            <Metric label="Saved reports" value={a.savedReportCount} icon={BookOpenCheck} note={`${formatCount(a.adminReportViews + a.guideReportViews)} staff views recorded`} testId="reports-total" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
            <section className="ink-card p-5 sm:p-6" aria-labelledby="account-mix-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Access map</p><h2 id="account-mix-heading" className="mt-1 text-xl font-black text-primary">Accounts by role</h2></div>
                <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary" data-testid="text-role-count-total">{formatCount(a.totalAccounts)} total accounts</span>
              </div>
              <div className="mt-5 space-y-4">
                {[
                  { title: 'Students', count: a.studentCount, tone: 'bg-primary', icon: GraduationCap },
                  { title: 'Admins', count: a.adminCount, tone: 'bg-accent', icon: UserCog },
                  { title: 'Guides', count: a.guideCount, tone: 'bg-[hsl(var(--ledger))]', icon: UserRoundCheck },
                  { title: 'Superadmins', count: a.superadminCount, tone: 'bg-[hsl(var(--turmeric))]', icon: ShieldCheck },
                ].map((item) => {
                  const pct = a.totalAccounts ? Math.max(2, (item.count / a.totalAccounts) * 100) : 0;
                  return <div key={item.title} className="grid grid-cols-[minmax(96px,.65fr)_minmax(0,2fr)_auto] items-center gap-3" data-testid={`row-role-total-${item.title.toLowerCase()}`}>
                    <span className="flex items-center gap-2 text-sm font-semibold"><item.icon className="h-4 w-4 text-muted-foreground" />{item.title}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${item.title}: ${item.count} accounts`}>
                      <div className={`h-full origin-left rounded-full ${item.tone} transition-transform duration-700`} style={{ transform: `scaleX(${pct / 100})` }} />
                    </div>
                    <span className="w-12 text-right font-mono text-sm font-bold text-primary">{formatCount(item.count)}</span>
                  </div>;
                })}
              </div>
            </section>

            <section className="ink-card p-5 sm:p-6" aria-labelledby="internship-health-heading">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Learning delivery</p><h2 id="internship-health-heading" className="mt-1 text-xl font-black text-primary">Internship health</h2></div>
                <Activity className="h-5 w-5 text-[hsl(var(--ledger))]" />
              </div>
              <div className="mt-5 flex items-end justify-between gap-4">
                <div><p className="font-display text-4xl font-black text-primary" data-testid="text-completion-rate">{completionRate}<span className="text-xl">%</span></p><p className="text-sm text-muted-foreground">enrolments completed</p></div>
                <p className="text-right text-xs text-muted-foreground">{formatCount(a.completedEnrollmentCount)} completed<br />of {formatCount(a.enrollmentCount)} total</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${completionRate}% of enrolments completed`}><div className="h-full origin-left rounded-full bg-[hsl(var(--ledger))] transition-transform duration-700" style={{ transform: `scaleX(${completionRate / 100})` }} /></div>
              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
                <div><p className="text-xs text-muted-foreground">Admin report views</p><p className="mt-1 text-lg font-black text-primary" data-testid="text-admin-report-views">{formatCount(a.adminReportViews)}</p></div>
                <div><p className="text-xs text-muted-foreground">Guide report views</p><p className="mt-1 text-lg font-black text-primary" data-testid="text-guide-report-views">{formatCount(a.guideReportViews)}</p></div>
              </div>
            </section>
          </div>
          <section className="ink-card overflow-hidden" aria-labelledby="course-overview-heading">
            <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:px-6">
              <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Pathway pulse</p><h2 id="course-overview-heading" className="mt-1 text-xl font-black text-primary">Course enrolments</h2></div>
              <p className="text-xs text-muted-foreground">Active and completed pathways at a glance</p>
            </div>
            {a.courseTotals.length ? <div className="divide-y divide-border border-t border-border">
              {a.courseTotals.map((course) => {
                const pct = course.enrollmentCount ? Math.round((course.completedEnrollmentCount / course.enrollmentCount) * 100) : 0;
                return <div key={course.courseId} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6" data-testid={`row-course-${course.courseId}`}>
                  <div className="min-w-0"><h3 className="font-bold text-primary">{course.title}</h3><div className="mt-2 h-1.5 max-w-lg overflow-hidden rounded-full bg-secondary"><div className="h-full origin-left rounded-full bg-[hsl(var(--ledger))] transition-transform duration-700" style={{ transform: `scaleX(${pct / 100})` }} /></div></div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span><strong className="text-primary">{formatCount(course.enrollmentCount)}</strong> enrolled</span><span><strong className="text-primary">{formatCount(course.activeEnrollmentCount)}</strong> active</span><span><strong className="text-primary">{formatCount(course.completedEnrollmentCount)}</strong> complete</span></div>
                </div>;
              })}
            </div> : <div className="p-5"><EmptyPanel title="No course activity yet"><p>Course totals will appear when learners enrol in a pathway.</p></EmptyPanel></div>}
          </section>
        </section>}

    <section aria-labelledby="accounts-heading" className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Trusted access</p><h2 id="accounts-heading" className="mt-1 text-2xl font-black text-primary">Account roles</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Search the platform directory and carefully grant or remove admin access. Create guide accounts here; manage course coverage and assignment matching in the guide pool.</p></div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><ShieldCheck className="mr-1.5 inline h-4 w-4 text-accent" />Role changes are recorded</div>
      </div>
      {notice && <p role="status" className={`rounded-xl border px-4 py-3 text-sm ${notice.startsWith('Role could not') ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-[hsl(var(--ledger)/.25)] bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]'}`} data-testid="status-role-change">{notice}</p>}
      <section className="ink-card overflow-hidden" aria-labelledby="create-guide-heading" data-testid="panel-create-guide">
        <div className="flex items-start gap-3 border-b border-border bg-secondary/40 p-4 sm:p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><UserRoundCheck className="h-5 w-5" /></span>
          <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Guide provisioning</p><h3 id="create-guide-heading" className="mt-1 text-lg font-black text-primary">Create a guide account</h3><p className="mt-1 text-sm text-muted-foreground">Create a dedicated guide login and set the internships they can support.</p></div>
        </div>
        {guideCredential ? <div className="space-y-4 p-4 sm:p-5" data-testid="panel-guide-temporary-password">
          <div className="flex items-start gap-3 rounded-xl border border-[hsl(var(--ledger)/.25)] bg-[hsl(var(--ledger-soft))] p-4">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--ledger))]" />
            <div className="min-w-0"><p className="font-bold text-primary" data-testid="text-guide-created">Guide account created for {guideCredential.name}</p><p className="mt-1 break-all text-sm text-muted-foreground">{guideCredential.email}</p></div>
          </div>
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-primary"><ShieldAlert className="h-4 w-4 text-accent" />Temporary password — show once</p>
            <p className="mt-1 text-sm text-muted-foreground">Share this through a secure channel. The guide will be required to change it at first sign-in. Do not send it in a public or group channel.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <code className="flex min-h-11 min-w-0 flex-1 select-all items-center break-all rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-primary" data-testid="text-temporary-guide-password">{guideCredential.password}</code>
              <Button type="button" variant="outline" onClick={copyTemporaryPassword} className="min-h-11 shrink-0" data-testid="button-copy-guide-password">{passwordCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{passwordCopied ? 'Copied' : 'Copy password'}</Button>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={dismissGuideCredential} className="min-h-11" data-testid="button-dismiss-guide-password"><X className="mr-2 h-4 w-4" />Dismiss and clear password</Button>
        </div> : courses.isLoading ? <div className="space-y-3 p-4 sm:p-5" aria-busy="true" data-testid="status-guide-courses-loading"><SkeletonBlock className="h-10" /><SkeletonBlock className="h-24" /></div>
          : courses.isError ? <div className="p-4 sm:p-5"><ErrorPanel title="Internship choices are unavailable" message={errMsg(courses.error)} onRetry={() => courses.refetch()} /></div>
            : <Form {...guideForm}>
              <form onSubmit={guideForm.handleSubmit(submitGuide)} className="space-y-5 p-4 sm:p-5" noValidate data-testid="form-create-guide">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={guideForm.control} name="name" render={({ field }) => <FormItem><FormLabel className="text-sm font-semibold text-primary">Guide name</FormLabel><FormControl><Input {...field} required minLength={2} maxLength={100} autoComplete="name" placeholder="Full name" className="h-11" data-testid="input-create-guide-name" /></FormControl><FormMessage /></FormItem>} />
                <FormField control={guideForm.control} name="email" render={({ field }) => <FormItem><FormLabel className="text-sm font-semibold text-primary">Guide email address</FormLabel><FormControl><Input {...field} required type="email" maxLength={254} autoComplete="email" placeholder="guide@college.ac.in" className="h-11" data-testid="input-create-guide-email" /></FormControl><FormDescription>This will be the guide’s sign-in email.</FormDescription><FormMessage /></FormItem>} />
              </div>
              <FormField control={guideForm.control} name="supportedCourseIds" render={({ field, fieldState }) => <FormItem><fieldset className="space-y-2" aria-invalid={!!fieldState.error}><legend className="text-sm font-bold text-primary">Supported internships <span className="font-normal text-muted-foreground">(choose at least one)</span></legend>
                {courses.data?.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {courses.data.map((course) => <label key={course.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm transition-colors hover:bg-secondary/50">
                    <FormControl><input type="checkbox" checked={field.value.includes(course.id)} onChange={() => field.onChange(field.value.includes(course.id) ? field.value.filter((id) => id !== course.id) : [...field.value, course.id])} className="h-4 w-4 accent-[hsl(var(--ledger))]" data-testid={`checkbox-create-guide-course-${course.id}`} /></FormControl>
                    <span className="min-w-0">{course.title}</span>
                  </label>)}
                </div> : <p className="text-sm text-muted-foreground">No internship pathways are available yet.</p>}
              </fieldset><FormDescription>This controls which unassigned enrolments the guide is eligible to support.</FormDescription><FormMessage /></FormItem>} />
              <FormField control={guideForm.control} name="availableForAssignments" render={({ field }) => <FormItem><div className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm" data-testid="label-guide-availability">
                <FormControl><input id="guide-availability" type="checkbox" checked={field.value} onChange={field.onChange} className="h-4 w-4 accent-[hsl(var(--ledger))]" data-testid="checkbox-guide-availability" /></FormControl>
                <span><FormLabel htmlFor="guide-availability" className="block cursor-pointer font-bold text-primary">Available for assignments</FormLabel><FormDescription className="text-xs">Eligible for matching enrolments after creation</FormDescription></span>
              </div><FormMessage /></FormItem>} />
              {guideFormError && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-guide-create-error">{guideFormError}</p>}
              <Button type="submit" disabled={createGuide.isPending || !courses.data?.length} className="min-h-11 w-full sm:w-auto" data-testid="button-create-guide">{createGuide.isPending ? 'Creating guide account…' : 'Create guide account'}</Button>
              </form>
            </Form>}
      </section>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block md:w-80"><span className="sr-only">Search accounts</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={draft} onChange={(event) => onSearch(event.target.value)} maxLength={120} placeholder="Name, email or college" className="h-11 pl-9" data-testid="input-account-search" /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground"><span>Role</span><select value={role} onChange={(event) => { setRole(event.target.value as RoleFilter); setPage(1); }} className="h-11 min-w-40 rounded-lg border border-input bg-card px-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="select-account-role">{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
      {directory.isLoading ? <div className="space-y-2" aria-busy="true" aria-label="Loading account directory">{[0, 1, 2, 3].map((item) => <SkeletonBlock key={item} className="h-16" />)}</div>
        : directory.isError || !d ? <ErrorPanel title="Account directory is unavailable" message={errMsg(directory.error)} onRetry={() => directory.refetch()} />
          : d.accounts.length === 0 ? <EmptyPanel title={search || role !== 'all' ? 'No accounts match this search' : 'No accounts yet'} icon={<Users className="h-6 w-6" />}><p>Try another name, college or role filter.</p></EmptyPanel>
            : <>
              <p className="text-sm text-muted-foreground" data-testid="text-account-match-count">{formatCount(d.matchCount)} {d.matchCount === 1 ? 'account' : 'accounts'} found</p>
              <div className={`ink-card overflow-hidden transition-opacity ${directory.isFetching ? 'opacity-60' : ''}`}>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-secondary/70 text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-5 py-3">Account</th><th className="px-4 py-3">College / discipline</th><th className="px-4 py-3">Enrolments</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Role access</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {d.accounts.map((account) => <tr key={account.id} className="transition-colors hover:bg-secondary/30" data-testid={`row-account-${account.id}`}>
                        <td className="max-w-[240px] px-5 py-3"><p className="truncate font-bold text-primary" data-testid={`text-account-name-${account.id}`}>{account.name}</p><p className="truncate text-xs text-muted-foreground">{account.email}</p></td>
                        <td className="max-w-[220px] px-4 py-3"><p className="truncate">{account.college || '—'}</p><p className="truncate text-xs text-muted-foreground">{account.discipline || '—'}</p></td>
                        <td className="px-4 py-3 font-semibold">{formatCount(account.enrollmentCount)}</td><td className="px-4 py-3 text-muted-foreground">{formatDate(account.createdAt)}</td>
                        <td className="px-4 py-3"><div className="flex items-center gap-2">
                          <RoleBadge role={account.role} testId={`badge-role-desktop-${account.id}`} />
                          <select aria-label={`Change role for ${account.name}`} value={account.role} disabled={account.id === user?.id || savingId === account.id} onChange={(event) => changeRole(account, event.target.value as EditableRole)} className="h-9 max-w-32 rounded-lg border border-input bg-card px-2 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" data-testid={`select-role-${account.id}`}>
                            {account.role === 'guide' && <option value="guide" disabled>Guide</option>}
                            {(['student', 'admin', 'superadmin'] as EditableRole[]).map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}
                          </select>
                        </div></td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
                <div className="divide-y divide-border sm:hidden">
                  {d.accounts.map((account) => <article key={account.id} className="space-y-3 p-4" data-testid={`card-account-${account.id}`}>
                     <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-bold text-primary">{account.name}</p><p className="break-all text-xs text-muted-foreground">{account.email}</p></div><RoleBadge role={account.role} testId={`badge-role-mobile-${account.id}`} /></div>
                    <p className="text-xs text-muted-foreground">{account.college || '—'} · {account.discipline || '—'}<br />{formatCount(account.enrollmentCount)} enrolments · joined {formatDate(account.createdAt)}</p>
                      <label className="flex items-center justify-between gap-3 text-sm font-semibold"><span>Role access</span><select aria-label={`Change role for ${account.name}`} value={account.role} disabled={account.id === user?.id || savingId === account.id} onChange={(event) => changeRole(account, event.target.value as EditableRole)} className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" data-testid={`select-role-mobile-${account.id}`}>{account.role === 'guide' && <option value="guide" disabled>Guide</option>}{(['student', 'admin', 'superadmin'] as EditableRole[]).map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></label>
                  </article>)}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground" data-testid="text-account-page">Page {d.page} of {totalPages}</span>
                <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} data-testid="button-account-prev"><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} data-testid="button-account-next">Next<ChevronRight className="ml-1 h-4 w-4" /></Button></div>
              </div>
            </>}
    </section>

    {a?.recentRoleChanges && <section className="space-y-3" aria-labelledby="audit-heading">
      <div className="flex items-end justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Recent activity</p><h2 id="audit-heading" className="mt-1 text-xl font-black text-primary">Role change record</h2></div><span className="text-xs text-muted-foreground">Most recent first</span></div>
      {a.recentRoleChanges.length ? <ol className="ink-card divide-y divide-border overflow-hidden" data-testid="list-role-audit">
        {a.recentRoleChanges.map((change) => <li key={change.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5" data-testid={`row-role-audit-${change.id}`}>
          <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-primary"><UserCog className="h-4 w-4" /></span><p className="min-w-0 text-sm"><span className="font-bold text-primary">{change.actorName || 'Platform operator'}</span><span className="text-muted-foreground"> changed </span><span className="font-semibold">{change.targetName || 'an account'}</span><span className="ml-1 inline-flex items-center gap-1 text-muted-foreground"><span className="line-through">{roleLabel(change.previousRole)}</span><ArrowRight className="h-3 w-3" /><span className="font-semibold text-primary no-underline">{roleLabel(change.newRole)}</span></span></p></div>
          <time dateTime={change.createdAt} className="pl-12 text-xs text-muted-foreground sm:pl-0">{new Date(change.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time>
        </li>)}
      </ol> : <EmptyPanel title="No role changes recorded"><p>Account role updates will appear here.</p></EmptyPanel>}
    </section>}

    <aside className="flex flex-col gap-3 rounded-2xl border border-border bg-secondary/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" data-testid="panel-guide-workflow">
      <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card text-[hsl(var(--ledger))]"><UserRoundCheck className="h-5 w-5" /></span><div><h2 className="font-bold text-primary">Guide access has its own workflow</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Provision guides from existing accounts, set supported internship coverage and assign eligible learners in the Admin guide pool.</p></div></div>
      <Button asChild variant="outline" className="min-h-11 shrink-0"><Link href="/admin#guide-pool" data-testid="link-open-guide-pool">Open guide pool <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
    </aside>
  </div>;
}
