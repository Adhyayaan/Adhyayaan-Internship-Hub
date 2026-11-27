import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AlertCircle, Check, CircleUserRound, ClipboardCheck, UserPlus, Users } from 'lucide-react';
import {
  getListAdminGuidesQueryKey,
  getListCoursesQueryKey,
  useAssignAdminGuide,
  useListAdminGuides,
  useListCourses,
  useProvisionAdminGuide,
  useUpdateAdminGuide,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { errMsg } from '@/lib/app';
import { EmptyPanel, ErrorPanel, SkeletonBlock } from '@/components/assessment/parts';

type Notice = { tone: 'success' | 'error'; text: string } | null;
const guideFormSchema = z.object({
  email: z.string().trim().email('Enter a valid account email.').max(254, 'Email must be 254 characters or fewer.'),
  courseIds: z.array(z.string()).min(1, 'Choose at least one course.').max(30),
  available: z.boolean(),
});
type GuideFormValues = z.infer<typeof guideFormSchema>;

function InlineNotice({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const isError = notice.tone === 'error';
  return <p role={isError ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${isError ? 'bg-destructive/10 text-destructive' : 'bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]'}`}><span className="mt-0.5">{isError ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}</span>{notice.text}</p>;
}

export function AdminGuidesPanel() {
  const queryClient = useQueryClient();
  const guidesQuery = useListAdminGuides({ query: { queryKey: getListAdminGuidesQueryKey() } });
  const coursesQuery = useListCourses({ query: { queryKey: getListCoursesQueryKey() } });
  const provision = useProvisionAdminGuide();
  const update = useUpdateAdminGuide();
  const assign = useAssignAdminGuide();
  const guideForm = useForm<GuideFormValues>({
    resolver: zodResolver(guideFormSchema),
    defaultValues: { email: '', courseIds: [], available: true },
  });
  const [notice, setNotice] = useState<Notice>(null);
  const [savingGuideId, setSavingGuideId] = useState<string | null>(null);
  const [assigningEnrollmentId, setAssigningEnrollmentId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { courseIds: string[]; available: boolean }>>({});

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: getListAdminGuidesQueryKey() });
  };
  const toggleCourse = (ids: string[], id: string) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  const submitGuide = async (values: GuideFormValues) => {
    setNotice(null);
    try {
      await provision.mutateAsync({ data: { email: values.email.trim().toLowerCase(), supportedCourseIds: values.courseIds, availableForAssignments: values.available } });
      await invalidate();
      guideForm.reset({ email: '', courseIds: [], available: true });
      setNotice({ tone: 'success', text: 'Guide access has been set up for this account.' });
    } catch (error) {
      setNotice({ tone: 'error', text: errMsg(error) });
    }
  };
  const saveGuide = async (id: string) => {
    const change = edits[id];
    if (!change) return;
    setNotice(null);
    setSavingGuideId(id);
    try {
      await update.mutateAsync({ id, data: { supportedCourseIds: change.courseIds, availableForAssignments: change.available } });
      await invalidate();
      setEdits((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setNotice({ tone: 'success', text: 'Guide coverage and availability were updated.' });
    } catch (error) {
      setNotice({ tone: 'error', text: errMsg(error) });
    } finally {
      setSavingGuideId(null);
    }
  };
  const assignGuide = async (enrollmentId: string) => {
    setNotice(null);
    setAssigningEnrollmentId(enrollmentId);
    try {
      await assign.mutateAsync({ id: enrollmentId });
      await invalidate();
      setNotice({ tone: 'success', text: 'A guide was assigned to the enrolment.' });
    } catch (error) {
      setNotice({ tone: 'error', text: errMsg(error) });
    } finally {
      setAssigningEnrollmentId(null);
    }
  };

  const pool = guidesQuery.data;
  const courses = coursesQuery.data ?? [];
  return <section id="guide-pool" className="space-y-6 scroll-mt-20" aria-labelledby="admin-guides-heading">
    <header className="flex flex-col gap-2 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">People & pathways</p><h2 id="admin-guides-heading" className="font-display mt-1 text-2xl font-black text-primary sm:text-3xl">Guide directory</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Set course coverage, control assignment availability and match eligible guides to unassigned enrolments.</p></div>
      {pool && <div className="flex gap-2"><span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">{pool.guides.length} guides</span><span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">{pool.unassignedEnrollments.length} awaiting guide</span></div>}
    </header>
    <InlineNotice notice={notice} />

    <section className="ink-card overflow-hidden" aria-labelledby="add-guide-heading">
      <div className="flex items-start gap-3 border-b border-border bg-secondary/40 p-4 sm:p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><UserPlus className="h-5 w-5" /></span>
        <div><h3 id="add-guide-heading" className="font-display text-lg font-bold text-primary">Add an existing account as a guide</h3><p className="mt-1 text-sm text-muted-foreground">Use the account email. Guide access is managed here; no other role is assigned.</p></div>
      </div>
      {coursesQuery.isLoading ? <div className="space-y-3 p-5" aria-busy="true">{[0, 1].map((i) => <SkeletonBlock key={i} className="h-9" />)}</div>
        : coursesQuery.isError ? <div className="p-4"><ErrorPanel title="Course choices are unavailable" message={errMsg(coursesQuery.error)} onRetry={() => coursesQuery.refetch()} /></div>
          : <Form {...guideForm}>
            <form onSubmit={guideForm.handleSubmit(submitGuide)} className="space-y-5 p-4 sm:p-5" noValidate>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <FormField control={guideForm.control} name="email" render={({ field }) => <FormItem className="block space-y-1.5">
                <FormLabel className="text-sm font-semibold">Account email</FormLabel>
                <FormControl><Input {...field} type="email" autoComplete="email" maxLength={254} placeholder="name@college.edu" className="h-11" data-testid="input-guide-email" /></FormControl>
                <FormDescription>This must match an existing account.</FormDescription>
                <FormMessage />
              </FormItem>} />
              <FormField control={guideForm.control} name="courseIds" render={({ field, fieldState }) => <FormItem>
                <fieldset aria-describedby={fieldState.error ? 'guide-course-error' : 'guide-course-description'} aria-invalid={!!fieldState.error}>
                  <legend className="mb-2 text-sm font-semibold">Course coverage <span className="font-normal text-muted-foreground">(choose at least one)</span></legend>
                  {courses.length === 0 ? <p className="text-sm text-muted-foreground">No course choices are available.</p> : <div className="grid gap-2 sm:grid-cols-2">
                    {courses.map((course) => <label key={course.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm hover:bg-secondary/50">
                      <Checkbox checked={field.value.includes(course.id)} onCheckedChange={(checked) => field.onChange(checked ? [...field.value, course.id] : field.value.filter((id) => id !== course.id))} aria-label={`Cover ${course.title}`} data-testid={`checkbox-new-guide-course-${course.id}`} />
                      <span className="min-w-0">{course.title}</span>
                    </label>)}
                  </div>}
                  <FormDescription id="guide-course-description" className="mt-2">Choose the courses this guide can support.</FormDescription>
                  {fieldState.error && <p id="guide-course-error" className="mt-1 text-[0.8rem] font-medium text-destructive" role="alert">{fieldState.error.message}</p>}
                </fieldset>
              </FormItem>} />
            </div>
            <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <FormField control={guideForm.control} name="available" render={({ field }) => <FormItem className="flex min-h-11 items-center gap-3 space-y-0 text-sm">
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Available for assignments" data-testid="switch-new-guide-availability" /></FormControl>
                <span><FormLabel className="block font-semibold">Available for assignments</FormLabel><FormDescription className="text-xs">Eligible for matching enrolments</FormDescription></span>
                <FormMessage />
              </FormItem>} />
              <Button type="submit" disabled={provision.isPending || courses.length === 0} className="min-h-11 w-full sm:w-auto" data-testid="button-add-guide">{provision.isPending ? 'Setting up guide…' : 'Add guide account'}</Button>
            </div>
            </form>
          </Form>}
    </section>

    {guidesQuery.isLoading ? <div className="space-y-3" aria-busy="true" aria-label="Loading guide directory">{[0, 1].map((i) => <SkeletonBlock key={i} className="h-32" />)}</div>
      : guidesQuery.isError || !pool ? <ErrorPanel title="We could not load the guide directory" message={errMsg(guidesQuery.error)} onRetry={() => guidesQuery.refetch()} />
        : pool.guides.length === 0 ? <EmptyPanel title="No guides set up yet" icon={<CircleUserRound className="h-6 w-6" />}><p>Add an existing account above and choose the courses it can support.</p></EmptyPanel>
          : <section className="space-y-3" aria-labelledby="guide-list-heading">
            <div className="flex items-center gap-2"><Users className="h-5 w-5 text-[hsl(var(--ledger))]" /><h3 id="guide-list-heading" className="text-lg font-black text-primary">Guides and coverage</h3></div>
            <div className="space-y-3">{pool.guides.map((guide) => {
              const values = edits[guide.id] ?? { courseIds: guide.supportedCourseIds, available: guide.availableForAssignments };
              const dirty = !!edits[guide.id];
              return <article key={guide.id} className="ink-card p-4 sm:p-5" data-testid={`card-admin-guide-${guide.id}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]"><CircleUserRound className="h-5 w-5" /></span><div className="min-w-0"><h4 className="font-bold text-primary">{guide.name}</h4><p className="break-all text-sm text-muted-foreground">{guide.email}</p><p className="mt-1 text-xs text-muted-foreground">{guide.activeLearners} active {guide.activeLearners === 1 ? 'learner' : 'learners'}</p></div></div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${values.available ? 'ledger-chip' : 'bg-muted text-muted-foreground'}`}>{values.available ? 'Available for assignments' : 'Not available'}</span>
                </div>
                <div className="mt-4 grid gap-4 border-t border-border pt-4 lg:grid-cols-[1fr_auto] lg:items-end">
                  <fieldset><legend className="mb-2 text-sm font-semibold">Supported courses</legend>
                    {coursesQuery.isError ? <p className="text-xs text-destructive">Course choices could not be refreshed.</p> : courses.length === 0 ? <p className="text-sm text-muted-foreground">No courses are available.</p> : <div className="grid gap-2 sm:grid-cols-2">
                      {courses.map((course) => <label key={course.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/50">
                        <Checkbox checked={values.courseIds.includes(course.id)} onCheckedChange={() => setEdits((old) => ({ ...old, [guide.id]: { ...values, courseIds: toggleCourse(values.courseIds, course.id) } }))} aria-label={`Set ${course.title} coverage for ${guide.name}`} data-testid={`checkbox-guide-${guide.id}-course-${course.id}`} />
                        <span className="min-w-0">{course.title}</span>
                      </label>)}
                    </div>}
                  </fieldset>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:min-w-64 lg:flex-col lg:items-stretch">
                    <label className="flex min-h-10 items-center gap-3 text-sm"><Switch checked={values.available} onCheckedChange={(available) => setEdits((old) => ({ ...old, [guide.id]: { ...values, available } }))} aria-label={`Set assignment availability for ${guide.name}`} data-testid={`switch-guide-${guide.id}-availability`} /><span>Available for assignments</span></label>
                    <Button disabled={!dirty || values.courseIds.length === 0 || savingGuideId === guide.id} onClick={() => saveGuide(guide.id)} variant={dirty ? 'default' : 'outline'} className="min-h-10" data-testid={`button-save-guide-${guide.id}`}>{savingGuideId === guide.id ? 'Saving…' : 'Save changes'}</Button>
                  </div>
                </div>
              </article>;
            })}</div>
          </section>}

    <section className="space-y-3" aria-labelledby="unassigned-heading">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-accent" /><h3 id="unassigned-heading" className="text-lg font-black text-primary">Enrolments awaiting a guide</h3></div><p className="text-xs text-muted-foreground">Only guides marked available with matching course coverage can be assigned.</p></div>
      {guidesQuery.isLoading ? <SkeletonBlock className="h-28" /> : guidesQuery.isError || !pool ? null : pool.unassignedEnrollments.length === 0
        ? <EmptyPanel title="No unassigned enrolments" icon={<ClipboardCheck className="h-6 w-6" />}><p>New enrolments that need a guide will appear here.</p></EmptyPanel>
        : <div className="space-y-3">{pool.unassignedEnrollments.map((enrollment) => {
          const eligible = pool.guides.filter((guide) => guide.availableForAssignments && guide.supportedCourseIds.includes(enrollment.courseId));
          return <article key={enrollment.id} className="ink-card p-4 sm:p-5" data-testid={`card-unassigned-enrollment-${enrollment.id}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">{enrollment.hours}-hour pathway · {enrollment.status.replace(/_/g, ' ')}</p><h4 className="mt-1 font-display text-lg font-bold text-primary">{enrollment.courseTitle}</h4><p className="mt-1 text-sm">{enrollment.learnerName} <span className="break-all text-muted-foreground">· {enrollment.learnerEmail}</span></p></div>
              <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-56">{eligible.length === 0 ? <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">No available guide covers this course yet.</p> : <>
                <p className="text-xs text-muted-foreground">Eligible: {eligible.map((guide) => guide.name).join(', ')}</p>
                <Button disabled={!!assigningEnrollmentId} onClick={() => assignGuide(enrollment.id)} className="min-h-11 justify-center gap-2" data-testid={`button-assign-${enrollment.id}`}>{assigningEnrollmentId === enrollment.id ? 'Assigning…' : 'Assign an eligible guide'}</Button>
              </>}</div>
            </div>
          </article>;
        })}</div>}
    </section>
  </section>;
}
