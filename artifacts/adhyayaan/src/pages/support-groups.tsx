import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronRight, CircleAlert, FileText,
  LockKeyhole, MessageCircle, Paperclip, Plus, Send, ShieldCheck, UsersRound, Video,
} from 'lucide-react';
import {
  getDownloadSupportGroupAttachmentQueryKey, getGetGuideSupportReviewQueryKey,
  getListSupportGroupMessagesQueryKey, getListSupportGroupsQueryKey,
  useAnswerSupportGroupQuestion, useCreateGuideSupportGroup, useDownloadSupportGroupAttachment,
  useGetGuideSupportReview, useListSupportGroupMessages, useListSupportGroups,
  useRequestSupportGroupUpload, useSendSupportGroupMessage,
  useUpdateGuideSupportGroupMembers, type GuideSupportLearner, type SupportGroup,
  type SupportGroupMessage, type SupportGroupMember,
  type AnswerSupportGroupQuestionMutationVariables, type CreateGuideSupportGroupMutationVariables,
  type RequestSupportGroupUploadMutationVariables, type SendSupportGroupMessageMutationVariables,
  type UpdateGuideSupportGroupMembersMutationVariables,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { useAuth, errMsg, useTitle } from '@/lib/app';
import { EmptyPanel, ErrorPanel, PageSkeleton } from '@/components/assessment/parts';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const inputClass = 'min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const softButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold text-primary transition-colors hover:bg-secondary/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55';

function stamp(date: string | null | undefined) {
  if (!date) return 'No messages yet';
  const d = new Date(date);
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function LoadingCards() { return <div className="grid gap-3 sm:grid-cols-2" aria-label="Loading support groups" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-border bg-card/70" />)}</div>; }

function GroupCard({ group }: { group: SupportGroup }) {
  return <Link href={`/support-groups/${encodeURIComponent(group.id)}`} data-testid={`link-support-group-${group.id}`}
    className="support-enter group min-w-0 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--support-moss))]/45 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5">
    <span className="flex min-w-0 items-start justify-between gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[hsl(var(--support-wash))] text-[hsl(var(--support-moss))]"><UsersRound className="h-5 w-5" /></span>
      <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">{group.memberCount} members <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
    </span>
    <span className="mt-4 block text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--support-moss))]">{group.courseTitle}</span>
    <span className="mt-1 block break-words font-display text-lg font-black leading-snug text-primary">{group.name}</span>
    <span className="mt-1 block line-clamp-2 text-sm leading-relaxed text-muted-foreground">{group.purpose}</span>
    <span className="mt-4 flex min-w-0 items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
      <span className="min-w-0 truncate">{group.lastMessagePreview || 'A new shared space'}</span>
      <span className="shrink-0">{stamp(group.lastMessageAt)}</span>
    </span>
  </Link>;
}

function GroupConversationLink({ group, selected }: { group: SupportGroup; selected: boolean }) {
  return <Link href={`/support-groups/${encodeURIComponent(group.id)}`} aria-current={selected ? 'page' : undefined}
    className={`block min-w-0 rounded-xl border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-[hsl(var(--support-moss))]/40 bg-[hsl(var(--support-wash))]/70' : 'border-transparent hover:border-border hover:bg-background'}`}
    data-testid={`link-support-chat-${group.id}`}>
    <span className="flex min-w-0 items-start justify-between gap-2">
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-primary">{group.name}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{group.courseTitle}</span>
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{stamp(group.lastMessageAt)}</span>
    </span>
    <span className="mt-2 block truncate text-xs text-muted-foreground">{group.lastMessagePreview || 'Start a group conversation'}</span>
    <span className="mt-1 block text-[11px] text-muted-foreground">{group.memberCount} members</span>
  </Link>;
}

export function SupportGroupsPage() {
  useTitle('Support groups');
  const { user, isLoading: authLoading } = useAuth();
  const query = useListSupportGroups({ query: { enabled: !!user, queryKey: getListSupportGroupsQueryKey() } });
  if (authLoading) return <main className="mx-auto max-w-5xl p-4 sm:p-8"><PageSkeleton /></main>;
  if (!user) return <main className="mx-auto max-w-4xl p-4 sm:p-8"><EmptyPanel title="Sign in to view support groups" icon={<LockKeyhole className="h-6 w-6" />}><p>Groups are private. Sign in to see groups that you can access.</p><Button asChild variant="outline" className="mt-4"><Link href="/login">Sign in</Link></Button></EmptyPanel></main>;
  return <main className="mx-auto max-w-6xl space-y-6 p-3 pb-24 sm:space-y-8 sm:p-7">
    <header className="support-enter overflow-hidden rounded-[1.5rem] border border-primary/10 bg-card">
      <div className="relative overflow-hidden bg-primary px-5 py-6 text-primary-foreground sm:px-8 sm:py-8">
        <div className="absolute -right-5 -top-6 h-40 w-40 rounded-full border border-primary-foreground/10" aria-hidden />
        <div className="absolute -right-1 top-0 h-28 w-28 rounded-full border border-primary-foreground/10" aria-hidden />
        <p className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[hsl(var(--turmeric))]"><UsersRound className="h-4 w-4" /> Shared course spaces</p>
        <div className="relative mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="font-display text-3xl font-black sm:text-4xl">Learn better, together.</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-primary-foreground/80">A private place to ask, share progress and work through course ideas with your group.</p></div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-2 text-xs font-semibold"><LockKeyhole className="h-4 w-4" /> Private to members and guide</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm sm:px-8"><span className="font-semibold text-primary">Your groups</span><span className="text-xs text-muted-foreground">{query.data ? `${query.data.length} ${query.data.length === 1 ? 'group' : 'groups'}` : 'Only invited groups appear here'}</span></div>
    </header>
    {query.isLoading ? <LoadingCards /> : query.isError ? <ErrorPanel title="Support groups did not load" message={errMsg(query.error)} onRetry={() => void query.refetch()} />
      : !query.data?.length ? <EmptyPanel title="No groups yet" icon={<MessageCircle className="h-6 w-6" />}><p>A guide will invite you to a course group when there is a shared reason to work together. Groups are never created automatically.</p></EmptyPanel>
        : <section className="grid min-w-0 gap-3 sm:grid-cols-2" aria-label="Available support groups">{query.data.map((group) => <GroupCard key={group.id} group={group} />)}</section>}
  </main>;
}

function SupportLearnerRow({ learner, checked, onChange }: { learner: GuideSupportLearner; checked: boolean; onChange: () => void }) {
  return <label className={`block cursor-pointer rounded-xl border p-3.5 transition-colors ${checked ? 'border-[hsl(var(--support-moss))]/55 bg-[hsl(var(--support-wash))]/70' : 'border-border bg-card hover:bg-secondary/30'}`}>
    <span className="flex min-w-0 items-start gap-3">
      <input aria-label={`Invite ${learner.name}`} type="checkbox" checked={checked} onChange={onChange} className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--support-moss))]" data-testid={`checkbox-support-learner-${learner.enrollmentId}`} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5"><span className="font-bold text-primary">{learner.name}</span><span className="text-xs tabular-nums text-muted-foreground">{learner.completedPercent}% complete · {learner.expectedPercent}% expected</span></span>
        <span className="mt-0.5 block break-all text-xs text-muted-foreground">{learner.email} · {learner.hours} hours</span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          {learner.pace.triggered && <span className="rounded-md bg-accent/10 px-2 py-1 text-[11px] font-bold text-foreground">Pace: {Math.abs(learner.pace.deltaDays)} days behind plan</span>}
          {learner.learningChecks.count < learner.learningChecks.minimumChecks
            ? <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-muted-foreground">Learning checks: not enough evidence ({learner.learningChecks.count}/{learner.learningChecks.minimumChecks})</span>
            : learner.learningChecks.triggered && <span className="rounded-md bg-[hsl(var(--support-wash))] px-2 py-1 text-[11px] font-bold text-[hsl(var(--support-moss))]">Learning checks: {learner.learningChecks.securePercent ?? 0}% secure</span>}
        </span>
        {learner.reasons.length > 0 && <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">{learner.reasons.join(' · ')}</span>}
      </span>
    </span>
  </label>;
}

export function GuideSupportPage() {
  useTitle('Course support');
  const { user, isLoading: authLoading } = useAuth();
  const [courseId, setCourseId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [creationStep, setCreationStep] = useState<1 | 2 | 3>(1);
  const [createError, setCreateError] = useState('');
  const [notice, setNotice] = useState('');
  const qc = useQueryClient();
  const reviewParams = courseId ? { courseId } : {};
  const query = useGetGuideSupportReview(reviewParams, { query: { enabled: !!user?.isGuide, queryKey: getGetGuideSupportReviewQueryKey(reviewParams) } });
  const groups = useListSupportGroups({ query: { enabled: !!user?.isGuide, queryKey: getListSupportGroupsQueryKey() } });
  const create = useCreateGuideSupportGroup();
  const review = query.data;
  useEffect(() => { if (review?.selectedCourseId && !courseId) setCourseId(review.selectedCourseId); }, [review?.selectedCourseId, courseId]);
  const selectedMembers = useMemo(() => review?.learners.filter((learner) => selected.includes(learner.enrollmentId)) ?? [], [review?.learners, selected]);

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreateError(''); setNotice('');
    if (!review?.selectedCourseId || selected.length < 2 || selected.length > 20) { setCreateError('Choose a course and 2 to 20 learners. You decide who to invite.'); return; }
    try {
      const selectedCourseId = review.selectedCourseId;
      const variables: CreateGuideSupportGroupMutationVariables = { data: { courseId: selectedCourseId, name: name.trim(), purpose: purpose.trim(), enrollmentIds: selected } };
      const group = await create.mutateAsync(variables);
      await Promise.all([qc.invalidateQueries({ queryKey: getListSupportGroupsQueryKey() }), qc.invalidateQueries({ queryKey: getGetGuideSupportReviewQueryKey({ courseId: selectedCourseId }) })]);
      setSelected([]); setName(''); setPurpose(''); setFormOpen(false); setNotice(`“${group.name}” is ready. The selected learners were invited.`);
    } catch (error) { setCreateError(errMsg(error)); }
  }
  if (authLoading) return <main className="mx-auto max-w-6xl p-4 sm:p-8"><PageSkeleton /></main>;
  if (!user) return <main className="mx-auto max-w-4xl p-4 sm:p-8"><EmptyPanel title="Sign in to review course support" icon={<LockKeyhole className="h-6 w-6" />}><p>Guide access is needed to review course signals and invite learners.</p><Button asChild variant="outline" className="mt-4"><Link href="/login">Sign in</Link></Button></EmptyPanel></main>;
  if (!user.isGuide) return <main className="mx-auto max-w-4xl p-4 sm:p-8"><EmptyPanel title="Guide access required" icon={<ShieldCheck className="h-6 w-6" />}><p>This workspace is for authorised guides.</p></EmptyPanel></main>;
  return <main className="mx-auto max-w-6xl space-y-6 p-3 pb-24 sm:space-y-7 sm:p-7">
    <header className="support-enter rounded-[1.5rem] border border-primary/10 bg-card">
      <div className="rounded-t-[1.5rem] bg-primary px-5 py-6 text-primary-foreground sm:px-8 sm:py-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[hsl(var(--turmeric))]"><ShieldCheck className="h-4 w-4" /> Guide workspace</p>
        <h1 className="mt-2 font-display text-3xl font-black sm:text-4xl">A timely check-in can help.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-primary-foreground/80">Review course activity, then decide whether a shared group would be useful. These signals describe course activity, not a learner’s ability.</p>
      </div>
       <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
         <label className="block min-w-0 flex-1"><span className="mb-1.5 block text-sm font-bold text-primary">Course to review</span><select value={courseId} onChange={(e) => { setCourseId(e.target.value); setSelected([]); setCreationStep(1); setCreateError(''); }} className={inputClass} data-testid="select-support-course"><option value="">Choose a course</option>{review?.supportedCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
         <Button type="button" onClick={() => { setFormOpen((open) => !open); setCreationStep(1); }} disabled={!review?.supportedCourses.length} className="min-h-11 w-full sm:w-auto" data-testid="button-create-support-group"><Plus className="mr-2 h-4 w-4" />{formOpen ? 'Close group form' : 'Create a group'}</Button>
      </div>
    </header>
    {notice && <p role="status" className="flex items-start gap-2 rounded-xl border border-[hsl(var(--support-moss))]/25 bg-[hsl(var(--support-wash))]/70 p-3.5 text-sm text-[hsl(var(--support-moss))]" data-testid="status-support-created"><Check className="mt-0.5 h-4 w-4 shrink-0" />{notice}</p>}
     {formOpen && <section className="support-enter rounded-2xl border border-[hsl(var(--support-moss))]/30 bg-[hsl(var(--support-wash))]/35 p-4 sm:p-5" aria-labelledby="create-support-heading">
       <div className="flex flex-col gap-4 border-b border-[hsl(var(--support-moss))]/15 pb-4 sm:flex-row sm:items-start sm:justify-between">
         <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-[hsl(var(--support-moss))]"><UsersRound className="h-5 w-5" /></span><div><h2 id="create-support-heading" className="font-display text-lg font-black text-primary">Create a course group</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">You choose the course, every member and the shared purpose. No one is added automatically.</p></div></div>
         <ol className="grid grid-cols-3 gap-1 text-center text-[11px] sm:w-[24rem]" aria-label="Group creation steps">
           {(['Course', 'Learners', 'Details'] as const).map((label, index) => <li key={label} aria-current={creationStep === index + 1 ? 'step' : undefined} className={`rounded-lg px-2 py-2 font-bold ${creationStep === index + 1 ? 'bg-primary text-primary-foreground' : creationStep > index + 1 ? 'bg-card text-[hsl(var(--support-moss))]' : 'bg-card/60 text-muted-foreground'}`}><span className="mr-1">{index + 1}.</span>{label}</li>)}
         </ol>
       </div>
       <form onSubmit={createGroup} className="mt-4 space-y-4">
         {creationStep === 1 && <div className="max-w-xl space-y-3">
           <div><h3 className="text-sm font-bold text-primary">Step 1 · Confirm the course</h3><p className="mt-1 text-xs text-muted-foreground">Use the course selector above. Group members must be assigned to the same course.</p></div>
           <p className="rounded-xl border border-border bg-card px-3 py-3 text-sm font-semibold text-primary">{review?.supportedCourses.find((course) => course.id === courseId)?.title || 'Choose a course above to continue'}</p>
         </div>}
         {creationStep === 2 && <div className="space-y-3">
           <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h3 className="text-sm font-bold text-primary">Step 2 · Choose learners</h3><p className="mt-1 text-xs text-muted-foreground">Select 2–20 learners. Review the course evidence, then make your own decision.</p></div><span className="text-xs font-bold text-[hsl(var(--support-moss))]">{selected.length} selected</span></div>
           <div className="grid gap-2 md:grid-cols-2">{review?.learners.map((learner) => <SupportLearnerRow key={learner.enrollmentId} learner={learner} checked={selected.includes(learner.enrollmentId)} onChange={() => setSelected((prev) => prev.includes(learner.enrollmentId) ? prev.filter((id) => id !== learner.enrollmentId) : prev.length < 20 ? [...prev, learner.enrollmentId] : prev)} />)}</div>
           <p className="rounded-xl border border-border bg-card/80 p-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-primary">Reading the evidence:</strong> Pace compares progress with the course plan. Learning checks show recorded course work only. Fewer than {review?.learners[0]?.learningChecks.minimumChecks ?? 3} checks is insufficient evidence, not a support flag.</p>
         </div>}
         {creationStep === 3 && <div className="grid gap-3 sm:grid-cols-2">
           <div className="sm:col-span-2"><h3 className="text-sm font-bold text-primary">Step 3 · Give the group a name and purpose</h3><p className="mt-1 text-xs text-muted-foreground">{selected.length} learners invited · {review?.supportedCourses.find((c) => c.id === review.selectedCourseId)?.title}</p></div>
           <label className="block"><span className="mb-1.5 block text-sm font-semibold">Group name</span><input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="For example, Project planning circle" data-testid="input-support-group-name" /></label>
           <label className="block"><span className="mb-1.5 block text-sm font-semibold">Shared purpose</span><input required minLength={10} maxLength={500} value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputClass} placeholder="What could the group work through together?" data-testid="input-support-group-purpose" /></label>
           <div className="sm:col-span-2 rounded-xl border border-border bg-card p-3">
             <h4 className="text-xs font-bold text-primary">Confirm invited learners</h4>
             <ul className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="list-support-group-invite-preview">
               {selectedMembers.map((learner) => <li key={learner.enrollmentId} className="flex min-w-0 items-center gap-2 rounded-lg bg-background px-3 py-2">
                 <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--support-wash))] text-xs font-bold text-[hsl(var(--support-moss))]">{initials(learner.name)}</span>
                 <span className="min-w-0"><span className="block truncate text-sm font-semibold text-primary">{learner.name}</span><span className="block truncate text-xs text-muted-foreground">{learner.email}</span></span>
               </li>)}
             </ul>
             <button type="button" className="mt-2 min-h-10 rounded-lg px-2 text-xs font-bold text-[hsl(var(--support-moss))] hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setCreationStep(2)} data-testid="button-edit-support-group-members">Edit learner selection</button>
           </div>
         </div>}
         {createError && <p className="text-sm text-destructive" role="alert" data-testid="status-create-group-error">{createError}</p>}
         <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--support-moss))]/15 pt-3">
           <button type="button" className={softButton} onClick={() => { if (creationStep === 1) { setFormOpen(false); setCreateError(''); } else setCreationStep((creationStep - 1) as 1 | 2 | 3); }} data-testid="button-group-step-back">{creationStep === 1 ? 'Cancel' : 'Back'}</button>
           {creationStep < 3 ? <Button type="button" className="min-h-11" disabled={creationStep === 1 ? !courseId || query.isLoading || review?.selectedCourseId !== courseId : selected.length < 2} onClick={() => { setCreateError(''); setCreationStep((creationStep + 1) as 1 | 2 | 3); }} data-testid="button-group-step-next">{creationStep === 1 ? 'Choose learners' : 'Review group details'}</Button>
             : <Button type="submit" disabled={create.isPending || selected.length < 2 || review?.selectedCourseId !== courseId} className="min-h-11" data-testid="button-save-support-group">{create.isPending ? 'Creating group…' : 'Create group and invite selected learners'}</Button>}
         </div>
       </form>
     </section>}
    <section aria-labelledby="signals-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-[hsl(var(--support-moss))]">Course review</p><h2 id="signals-heading" className="mt-1 font-display text-xl font-black text-primary">Support signals</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">A review prompt appears when one or both signals apply: pace is at least 7 days behind, or at least 3 recorded study checks are fewer than 50% secure. This is a prompt for a human check-in, not a diagnosis or fixed label.</p></div>{review && <span className="text-xs text-muted-foreground">{review.learners.filter((l) => l.needsSupportReview).length} learners marked for review</span>}</div>
      {query.isLoading ? <div className="space-y-2" aria-busy="true" aria-label="Loading course support review">{[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />)}</div>
        : query.isError ? <ErrorPanel title="Course support review did not load" message={errMsg(query.error)} onRetry={() => void query.refetch()} />
          : !courseId ? <div className="rounded-2xl border border-dashed border-border bg-card p-7 text-center"><CircleAlert className="mx-auto h-5 w-5 text-[hsl(var(--support-moss))]" /><p className="mt-2 font-bold text-primary">Choose a course to review</p><p className="mt-1 text-sm text-muted-foreground">The course list will appear after the review loads.</p></div>
            : !review?.learners.length ? <EmptyPanel title="No learners in this course view" icon={<UsersRound className="h-6 w-6" />}><p>There are no learner records to review for this course.</p></EmptyPanel>
              : <div className="space-y-2">{review.learners.map((learner) => <article key={learner.enrollmentId} className="rounded-2xl border border-border bg-card p-4 sm:p-5" data-testid={`card-support-learner-${learner.enrollmentId}`}>
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--support-wash))] font-bold text-[hsl(var(--support-moss))]">{initials(learner.name)}</span><div className="min-w-0"><h3 className="break-words font-bold text-primary">{learner.name}</h3><p className="break-all text-xs text-muted-foreground">{learner.email} · {learner.hours} hour pathway</p></div></div><span className={`rounded-lg px-3 py-1.5 text-xs font-bold ${learner.needsSupportReview ? 'bg-accent/10 text-foreground' : 'bg-[hsl(var(--support-wash))] text-[hsl(var(--support-moss))]'}`}>{learner.needsSupportReview ? 'Review may help' : 'No current review signal'}</span></div>
                <div className="mt-4 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                  <div><p className="text-xs font-bold text-primary">Progress against course plan</p><p className="mt-1 text-sm text-muted-foreground">{learner.completedPercent}% complete · {learner.expectedPercent}% expected · {learner.pace.status.replace(/_/g, ' ')}</p>{learner.pace.triggered && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">The current pace is {Math.abs(learner.pace.deltaDays)} days behind the plan threshold of {learner.pace.thresholdDays} days. Ask about timing or barriers before deciding what support fits.</p>}</div>
                  <div><p className="text-xs font-bold text-primary">Learning checks</p><p className="mt-1 text-sm text-muted-foreground">{learner.learningChecks.count} checks · {learner.learningChecks.secureCount} secure · {learner.learningChecks.nonSecureCount} still developing</p>{learner.learningChecks.count < learner.learningChecks.minimumChecks ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Insufficient evidence: the sample is below {learner.learningChecks.minimumChecks} checks. This is not a support flag.</p> : <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{learner.learningChecks.securePercent ?? 0}% secure against a {learner.learningChecks.requiredSecurePercent}% review threshold. This describes checks, not ability.</p>}</div>
                </div>
                {!!learner.reasons.length && <p className="mt-3 rounded-xl bg-secondary/45 px-3 py-2.5 text-xs leading-relaxed text-foreground"><strong>Observed reasons:</strong> {learner.reasons.join(' · ')}</p>}
              </article>)}</div>}
    </section>
    <section className="space-y-3" aria-labelledby="groups-managed-heading"><div className="flex items-end justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-accent">Private spaces</p><h2 id="groups-managed-heading" className="mt-1 font-display text-xl font-black text-primary">Groups you guide</h2></div><Link href="/support-groups" className="text-sm font-bold text-[hsl(var(--support-moss))] underline underline-offset-4">View all groups</Link></div>
      {groups.isLoading ? <LoadingCards /> : groups.isError ? <ErrorPanel title="Your groups did not load" message={errMsg(groups.error)} onRetry={() => void groups.refetch()} /> : !groups.data?.length ? <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">Groups you create will appear here. A guide creates each group after reviewing the course context and choosing its members.</div> : <div className="grid gap-3 sm:grid-cols-2">{groups.data.map((group) => <GroupCard key={group.id} group={group} />)}</div>}
    </section>
  </main>;
}

function GroupAttachment({ id, onError }: { id: string; onError: (message: string) => void }) {
  const query = useDownloadSupportGroupAttachment(id, { query: { enabled: false, queryKey: getDownloadSupportGroupAttachmentQueryKey(id) } });
  async function open() {
    onError('');
    try {
      const result = await query.refetch();
      if (!result.data) throw new Error('This file could not be opened. Try again.');
      const url = URL.createObjectURL(result.data);
      const a = document.createElement('a'); a.href = url; a.download = 'shared-file'; a.rel = 'noopener'; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    } catch (error) { onError(errMsg(error)); }
  }
  return <Button type="button" variant="outline" size="sm" onClick={() => void open()} disabled={query.isFetching} className="min-h-10 max-w-full justify-start" data-testid={`button-open-group-attachment-${id}`}><FileText className="mr-2 h-4 w-4 shrink-0" />{query.isFetching ? 'Opening file…' : 'Open attachment'}</Button>;
}

function QuestionThread({ question, messages, groupId }: { question: SupportGroupMessage; messages: SupportGroupMessage[]; groupId: string }) {
  const answer = useAnswerSupportGroupQuestion();
  const qc = useQueryClient();
  const [response, setResponse] = useState('');
  const [choice, setChoice] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const responses = messages.filter((m) => m.replyToMessageId === question.id);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); const clean = (question.question?.type === 'multiple_choice' ? choice : response).trim(); if (!clean) return;
    setError(''); setSaved(false);
    try {
      const variables: AnswerSupportGroupQuestionMutationVariables = { groupId, questionId: question.id, data: { response: clean } };
      await answer.mutateAsync(variables);
      await qc.invalidateQueries({ queryKey: getListSupportGroupMessagesQueryKey(groupId) });
      setResponse(''); setChoice(''); setSaved(true);
    }
    catch (cause) { setError(errMsg(cause)); }
  }
  const choices = question.question?.options ?? [];
  return <article className="support-message w-full max-w-3xl rounded-2xl border border-[hsl(var(--support-moss))]/25 bg-card shadow-sm" data-testid={`support-question-${question.id}`}>
    <div className="border-b border-[hsl(var(--support-moss))]/15 bg-[hsl(var(--support-wash))]/55 px-4 py-3 sm:px-5">
      <p className="flex items-center gap-2 text-xs font-bold text-[hsl(var(--support-moss))]"><MessageCircle className="h-4 w-4" /> A question to think through · not graded</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-foreground">{question.body}</p><p className="mt-2 text-xs text-muted-foreground">{question.senderName} · {stamp(question.createdAt)}</p>
    </div>
    <div className="space-y-3 p-4 sm:p-5">
      {responses.map((item) => <div key={item.id} className="rounded-xl border border-border bg-background p-3"><div className="flex flex-wrap justify-between gap-2 text-xs"><strong className="text-primary">{item.senderName}</strong><time className="text-muted-foreground">{stamp(item.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{item.body}</p></div>)}
      <form onSubmit={submit} className="space-y-2">
        <label className="block text-xs font-bold text-primary" htmlFor={`reply-${question.id}`}>Your thinking</label>
        {question.question?.type === 'multiple_choice' ? <select id={`reply-${question.id}`} value={choice} onChange={(e) => setChoice(e.target.value)} className={inputClass}><option value="">Choose an option</option>{choices.map((option, i) => <option key={`${i}-${option}`} value={option}>{option}</option>)}</select>
          : <textarea id={`reply-${question.id}`} value={response} onChange={(e) => setResponse(e.target.value)} maxLength={3000} rows={3} className={inputClass} placeholder="Share your response with the group" />}
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">Responses are for learning, not grading.</span><Button type="submit" disabled={answer.isPending || !(question.question?.type === 'multiple_choice' ? choice : response.trim())} className="min-h-11" data-testid={`button-answer-group-question-${question.id}`}>{answer.isPending ? 'Sending…' : 'Share response'}</Button></div>
      </form>
      {saved && <p role="status" className="text-xs font-semibold text-[hsl(var(--support-moss))]">Your response is shared with the group.</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  </article>;
}

function MessageItem({ message, own, groupId, messages }: { message: SupportGroupMessage; own: boolean; groupId: string; messages: SupportGroupMessage[] }) {
  const [attachmentError, setAttachmentError] = useState('');
  if (message.kind === 'question_response') return null;
  if (message.kind === 'question') return <QuestionThread question={message} messages={messages} groupId={groupId} />;
  return <article className={`support-message w-fit max-w-[min(42rem,92%)] rounded-2xl px-3.5 py-2.5 shadow-[0_1px_2px_hsl(232_45%_16%/.08)] sm:px-4 ${own ? 'ml-auto rounded-br-md bg-[hsl(var(--support-wash))]' : 'mr-auto rounded-bl-md border border-border/75 bg-card'}`} data-testid={`support-message-${message.id}`}>
    <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span className="text-xs font-bold text-primary">{message.senderName}{own ? ' · You' : message.senderRole === 'guide' ? ' · Guide' : ''}</span><time className="text-[10px] tabular-nums text-muted-foreground" dateTime={message.createdAt}>{stamp(message.createdAt)}</time></div>
    {message.kind === 'meeting' ? <div className="rounded-xl border border-[hsl(var(--support-moss))]/25 bg-background/80 p-3.5">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--support-wash))] text-[hsl(var(--support-moss))]"><Video className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-bold text-primary">Group Meet</p>{message.meetingStartsAt && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{stamp(message.meetingStartsAt)}</p>}{message.meetingAgenda && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{message.meetingAgenda}</p>}</div></div>
      {message.meetingUrl && <a href={message.meetingUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[hsl(var(--support-moss))] px-4 text-sm font-bold text-white hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`link-join-group-meet-${message.id}`}>Open Meet <ArrowUpRight className="h-4 w-4" /></a>}
    </div> : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{message.body}</p>}
    {message.attachments.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{message.attachments.map((file) => <span key={file.id} className="min-w-0"><GroupAttachment id={file.id} onError={setAttachmentError} /><span className="ml-2 break-all text-xs text-muted-foreground">{file.fileName}</span></span>)}</div>}
    {attachmentError && <p role="alert" className="mt-2 text-xs text-destructive">{attachmentError}</p>}
  </article>;
}

function MemberPanel({ group, members, onUpdate }: { group: SupportGroup; members: SupportGroupMember[]; onUpdate: (add: string[], remove: string[]) => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const review = useGetGuideSupportReview({ courseId: group.courseId }, { query: { enabled: group.canManageMembers, queryKey: getGetGuideSupportReviewQueryKey({ courseId: group.courseId }) } });
  const candidates = review.data?.learners.filter((learner) => !members.some((m) => m.enrollmentId === learner.enrollmentId)) ?? [];
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(''); setSaved(false); try { await onUpdate(selected, removed); setSelected([]); setRemoved([]); setSaved(true); } catch (cause) { setError(errMsg(cause)); } }
  if (!group.canManageMembers) return <div className="rounded-xl border border-border bg-background p-4"><p className="flex items-center gap-2 text-sm font-bold text-primary"><LockKeyhole className="h-4 w-4 text-[hsl(var(--support-moss))]" /> Group membership is private</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Only the creating guide can change the member list.</p></div>;
  return <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-background p-4" data-testid="form-manage-group-members">
    <h3 className="font-bold text-primary">Manage members</h3><p className="text-xs leading-relaxed text-muted-foreground">Only you, as the creating guide, can add or remove learners.</p>
    <div className="space-y-2">{members.map((member) => <label key={member.userId} className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3 text-sm"><input type="checkbox" checked={removed.includes(member.userId)} onChange={() => setRemoved((prev) => prev.includes(member.userId) ? prev.filter((id) => id !== member.userId) : [...prev, member.userId])} className="h-4 w-4 accent-destructive" /><span className="min-w-0 flex-1 truncate">{member.name}</span><span className="text-xs text-muted-foreground">Remove</span></label>)}</div>
    <div className="block"><p className="mb-1.5 text-xs font-bold">Add learners from this course</p><div className="max-h-44 space-y-1 overflow-y-auto">{review.isLoading ? <p className="text-xs text-muted-foreground">Loading learners…</p> : review.isError ? <div className="text-xs text-destructive"><p>Learners could not load.</p><button type="button" onClick={() => void review.refetch()} className="mt-1 min-h-9 rounded-lg px-2 font-bold underline underline-offset-2">Try again</button></div> : candidates.length ? candidates.map((learner) => <label key={learner.enrollmentId} className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3 text-sm"><input type="checkbox" checked={selected.includes(learner.enrollmentId)} onChange={() => setSelected((prev) => prev.includes(learner.enrollmentId) ? prev.filter((id) => id !== learner.enrollmentId) : prev.length < 20 ? [...prev, learner.enrollmentId] : prev)} className="h-4 w-4 accent-[hsl(var(--support-moss))]" /><span className="min-w-0 flex-1 truncate">{learner.name}</span></label>) : <p className="rounded-lg bg-card p-3 text-xs text-muted-foreground">All assigned learners are already in this group.</p>}</div></div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}{saved && <p role="status" className="text-xs font-semibold text-[hsl(var(--support-moss))]">Member list updated.</p>}
    <Button type="submit" variant="outline" className="min-h-11 w-full" disabled={selected.length === 0 && removed.length === 0 || review.isLoading} data-testid="button-save-group-members"><Check className="mr-2 h-4 w-4" />Save member changes</Button>
  </form>;
}

function GroupComposer({ group, canGuide, afterSend }: { group: SupportGroup; canGuide: boolean; afterSend: () => Promise<void> }) {
  const qc = useQueryClient();
  const send = useSendSupportGroupMessage();
  const upload = useRequestSupportGroupUpload();
  const [mode, setMode] = useState<'text' | 'meeting' | 'question'>('text');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [agenda, setAgenda] = useState('');
  const [questionType, setQuestionType] = useState<'open_response' | 'multiple_choice'>('open_response');
  const [optionsText, setOptionsText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  async function post(event: React.FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    if (!body.trim() && mode === 'text' && !files.length) { setError('Write a message or attach a file first.'); return; }
     if (mode === 'meeting') {
       try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.hostname !== 'meet.google.com' || parsed.port || parsed.username || parsed.password || !/^\/[a-z0-9-]+\/?$/i.test(parsed.pathname)) throw new Error('Use a valid Google Meet link.'); } catch { setError('Use a valid link from meet.google.com.'); return; }
    }
    const options = optionsText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
     if (mode === 'question' && questionType === 'multiple_choice' && (options.length < 2 || options.length > 6 || options.some((option) => option.length > 200) || new Set(options.map((s) => s.toLowerCase())).size !== options.length)) { setError('Add 2–6 different options of 200 characters or less, one on each line.'); return; }
    setBusy(true);
    try {
      const uploadTokens: string[] = [];
      if (mode === 'text') for (const file of files) {
        if (!ACCEPTED.includes(file.type) || !file.size || file.size > MAX_FILE_SIZE) throw new Error(`${file.name} is not supported. Choose an image or document under 10 MB.`);
        const uploadVariables: RequestSupportGroupUploadMutationVariables = { groupId: group.id, data: { fileName: file.name, contentType: file.type, size: file.size } };
        const signed = await upload.mutateAsync(uploadVariables);
        const result = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!result.ok) throw new Error(`Upload failed for ${file.name}. Try again.`);
        uploadTokens.push(signed.uploadToken);
      }
      const data = mode === 'text' ? { kind: 'text' as const, ...(body.trim() ? { body: body.trim() } : {}), ...(uploadTokens.length ? { uploadTokens } : {}) }
        : mode === 'meeting' ? { kind: 'meeting' as const, meetingUrl: url.trim(), ...(startsAt ? { meetingStartsAt: new Date(startsAt).toISOString() } : {}), ...(agenda.trim() ? { meetingAgenda: agenda.trim() } : {}) }
          : { kind: 'question' as const, body: body.trim(), question: { type: questionType, ...(questionType === 'multiple_choice' ? { options } : {}) } };
      const sendVariables: SendSupportGroupMessageMutationVariables = { groupId: group.id, data };
      await send.mutateAsync(sendVariables);
      setBody(''); setFiles([]); setUrl(''); setStartsAt(''); setAgenda(''); setOptionsText('');
      if (inputRef.current) inputRef.current.value = '';
      setNotice(mode === 'question' ? 'Question shared. It is for learning, not grading.' : 'Your message is shared with the group.');
      await afterSend(); await qc.invalidateQueries({ queryKey: getListSupportGroupsQueryKey() });
    } catch (cause) { setError(errMsg(cause)); }
    finally { setBusy(false); }
  }
  return <form onSubmit={post} className="space-y-3 border-t border-border bg-card p-3 sm:p-4" data-testid="form-group-message">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Message type">
      <button type="button" aria-pressed={mode === 'text'} className={`${softButton} ${mode === 'text' ? 'border-primary/30 bg-primary/5' : ''}`} onClick={() => setMode('text')} data-testid="button-compose-text"><MessageCircle className="h-4 w-4" />Message</button>
      {canGuide && <><button type="button" aria-pressed={mode === 'meeting'} className={`${softButton} ${mode === 'meeting' ? 'border-primary/30 bg-primary/5' : ''}`} onClick={() => setMode('meeting')} data-testid="button-compose-meeting"><Video className="h-4 w-4" />Meet</button><button type="button" aria-pressed={mode === 'question'} className={`${softButton} ${mode === 'question' ? 'border-primary/30 bg-primary/5' : ''}`} onClick={() => setMode('question')} data-testid="button-compose-question"><MessageCircle className="h-4 w-4" />Ask a question</button></>}
    </div>
    {mode === 'text' && <><label className="sr-only" htmlFor="group-message-body">Write a message</label><textarea id="group-message-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={3} className={`${inputClass} resize-y`} placeholder="Share a thought, question or useful detail…" data-testid="input-group-message" />
      <div className="flex flex-wrap items-center gap-2"><input ref={inputRef} type="file" multiple accept={ACCEPTED.join(',')} onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} className="sr-only" id="group-file-input" data-testid="input-group-attachments" /><label htmlFor="group-file-input" className={`${softButton} cursor-pointer`}><Paperclip className="h-4 w-4" />Attach files</label><span className="text-xs text-muted-foreground">Up to 5 files · 10 MB each</span></div>
      {files.length > 0 && <p className="text-xs text-muted-foreground">{files.map((f) => f.name).join(' · ')}</p>}</>}
    {mode === 'meeting' && <div className="grid gap-3 sm:grid-cols-2"><label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-bold">Google Meet link</span><input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} className={inputClass} placeholder="https://meet.google.com/..." data-testid="input-group-meet-url" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">Date and time</span><input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} data-testid="input-group-meet-date" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">Agenda</span><input value={agenda} onChange={(e) => setAgenda(e.target.value)} maxLength={1000} className={inputClass} placeholder="What will the group discuss?" data-testid="input-group-meet-agenda" /></label></div>}
     {mode === 'question' && <div className="space-y-3"><label className="block"><span className="mb-1.5 block text-sm font-bold">Question for the group</span><textarea required value={body} onChange={(e) => setBody(e.target.value)} maxLength={1200} rows={3} className={inputClass} placeholder="Invite learners to explain their thinking…" data-testid="input-group-question" /></label><label className="block"><span className="mb-1.5 block text-sm font-bold">Response type</span><select value={questionType} onChange={(e) => setQuestionType(e.target.value as typeof questionType)} className={inputClass} data-testid="select-group-question-type"><option value="open_response">Open response</option><option value="multiple_choice">Choose an option</option></select></label>{questionType === 'multiple_choice' && <label className="block"><span className="mb-1.5 block text-sm font-bold">Options, one per line</span><textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={3} className={inputClass} placeholder={'First option\\nSecond option'} data-testid="input-group-question-options" /></label>}<p className="rounded-lg bg-[hsl(var(--support-wash))]/70 p-3 text-xs leading-relaxed text-[hsl(var(--support-moss))]">Responses are shared with group members. This is a formative question, not a grade.</p></div>}
    {error && <p role="alert" className="text-sm text-destructive" data-testid="status-group-send-error">{error}</p>}{notice && <p role="status" className="text-xs font-semibold text-[hsl(var(--support-moss))]" data-testid="status-group-send-success">{notice}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] leading-relaxed text-muted-foreground">{mode === 'text' ? 'Only group members and the creating guide can see this space.' : 'Guide action · visible only in this private group.'}</p><Button type="submit" disabled={busy || send.isPending || upload.isPending} className="min-h-11" data-testid="button-send-group-message"><Send className="mr-2 h-4 w-4" />{busy ? 'Sharing…' : mode === 'question' ? 'Share question' : mode === 'meeting' ? 'Post Meet details' : 'Send message'}</Button></div>
  </form>;
}

export function SupportGroupPage() {
  const { groupId = '' } = useParams<{ groupId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const messageKey = useMemo(() => getListSupportGroupMessagesQueryKey(groupId), [groupId]);
  const groupsKey = getListSupportGroupsQueryKey();
  const query = useListSupportGroupMessages(groupId, { query: { enabled: !!user && !!groupId, queryKey: messageKey } });
  const groupListQuery = useListSupportGroups({ query: { enabled: !!user, queryKey: groupsKey } });
  const manage = useUpdateGuideSupportGroupMembers();
  const data = query.data;
  const endRef = useRef<HTMLDivElement>(null);
  useTitle(data?.group.name || 'Support group');

  useEffect(() => {
    if (!groupId || !user) return;
    const source = new EventSource(`/api/support-groups/${encodeURIComponent(groupId)}/events`, { withCredentials: true });
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: getListSupportGroupMessagesQueryKey(groupId) });
      void qc.invalidateQueries({ queryKey: getListSupportGroupsQueryKey() });
    };
    const revoke = () => { source.close(); refresh(); };
    source.addEventListener('support-group-message', refresh);
    source.addEventListener('support-group-access-revoked', revoke);
    source.onopen = refresh;
    return () => {
      source.removeEventListener('support-group-message', refresh);
      source.removeEventListener('support-group-access-revoked', revoke);
      source.close();
    };
  }, [groupId, qc, user]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [data?.messages.length]);
  async function refreshAfterSend() { await Promise.all([qc.invalidateQueries({ queryKey: messageKey }), qc.invalidateQueries({ queryKey: groupsKey })]); }
  async function updateMembers(addEnrollmentIds: string[], removeUserIds: string[]) {
    const variables: UpdateGuideSupportGroupMembersMutationVariables = { groupId, data: { ...(addEnrollmentIds.length ? { addEnrollmentIds } : {}), ...(removeUserIds.length ? { removeUserIds } : {}) } };
    await manage.mutateAsync(variables);
    await refreshAfterSend();
  }
  if (authLoading) return <main className="mx-auto max-w-6xl p-4 sm:p-8"><PageSkeleton /></main>;
  if (!user) return <main className="mx-auto max-w-4xl p-4 sm:p-8"><EmptyPanel title="Sign in to open this group" icon={<LockKeyhole className="h-6 w-6" />}><p>Group conversations are private. Sign in with an invited account to continue.</p><Button asChild variant="outline" className="mt-4"><Link href="/login">Sign in</Link></Button></EmptyPanel></main>;
  return <main className="mx-auto max-w-6xl space-y-4 p-3 pb-24 sm:space-y-5 sm:p-6">
     <Link href="/support-groups" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-[hsl(var(--support-moss))] hover:bg-[hsl(var(--support-wash))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden" data-testid="link-back-support-groups"><ArrowLeft className="h-4 w-4" />All groups</Link>
    {query.isLoading ? <div className="space-y-3" aria-label="Loading group conversation" aria-busy="true"><div className="h-36 animate-pulse rounded-2xl bg-card" /><div className="h-[26rem] animate-pulse rounded-2xl bg-card" /></div>
      : query.isError || !data ? <ErrorPanel title="This group could not be opened" message={errMsg(query.error)} onRetry={() => void query.refetch()} />
        : <>
          <header className="support-enter rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-6">
              <div className="flex min-w-0 items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[hsl(var(--support-wash))] text-[hsl(var(--support-moss))]"><UsersRound className="h-6 w-6" /></span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.12em] text-[hsl(var(--support-moss))]">{data.group.courseTitle}</p><h1 className="mt-1 break-words font-display text-2xl font-black leading-tight text-primary sm:text-3xl">{data.group.name}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{data.group.purpose}</p></div></div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[hsl(var(--support-moss))]/20 bg-[hsl(var(--support-wash))]/60 px-3 py-2 text-xs font-semibold text-[hsl(var(--support-moss))]"><LockKeyhole className="h-3.5 w-3.5" />Private group</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-6"><span className="flex flex-wrap gap-x-3 gap-y-1"><span>{data.members.length} members</span><span>Guide: {data.group.guideName}</span><span>{data.messages.length} messages</span></span><span>Only group members and the creating guide can read this</span></div>
          </header>
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[15rem_minmax(0,1fr)_17rem]">
            <aside className="hidden min-w-0 xl:block">
              <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="Your course group conversations">
                <header className="border-b border-border px-3.5 py-4">
                  <h2 className="font-display font-bold text-primary">Course groups</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{groupListQuery.data?.length ?? 0} available to you</p>
                </header>
                <nav className="max-h-[68dvh] space-y-1 overflow-y-auto p-2" aria-label="Choose a group conversation">
                  {groupListQuery.isLoading ? <div className="space-y-2 p-1" aria-busy="true" aria-label="Loading groups">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-secondary/50" />)}</div>
                    : groupListQuery.isError ? <div className="p-3 text-xs text-muted-foreground"><p>Groups did not load.</p><button type="button" onClick={() => void groupListQuery.refetch()} className="mt-2 min-h-9 font-bold text-primary underline underline-offset-4" data-testid="button-retry-group-list">Try again</button></div>
                      : groupListQuery.data?.length ? groupListQuery.data.map((group) => <GroupConversationLink key={group.id} group={group} selected={group.id === groupId} />)
                        : <p className="p-3 text-xs leading-relaxed text-muted-foreground">Groups you can access will appear here.</p>}
                </nav>
              </section>
            </aside>
            <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-background" aria-label="Group conversation">
              <div className="flex min-h-14 items-center justify-between gap-2 border-b border-border bg-card px-4"><h2 className="font-bold text-primary">Conversation</h2><span className="text-xs text-muted-foreground">{data.messages.length ? `${data.messages.length} messages` : 'Start with a thought'}</span></div>
              <div className="support-scroll flex min-h-64 max-h-[64dvh] flex-col gap-2.5 overflow-y-auto bg-secondary/35 p-3 sm:gap-3 sm:p-5" aria-live="polite">
                {!data.messages.length ? <div className="my-auto rounded-2xl border border-dashed border-border bg-card p-6 text-center"><MessageCircle className="mx-auto h-6 w-6 text-[hsl(var(--support-moss))]" /><p className="mt-3 font-bold text-primary">A quiet start</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Share a useful question, resource or next step with the group.</p></div>
                  : data.messages.map((message) => <MessageItem key={message.id} message={message} own={message.senderId === user.id} groupId={groupId} messages={data.messages} />)}
                <div ref={endRef} />
              </div>
              <GroupComposer group={data.group} canGuide={!!user.isGuide && data.group.canManageMembers} afterSend={refreshAfterSend} />
            </section>
            <aside className="space-y-3">
              <section className="rounded-2xl border border-border bg-card p-4" aria-label="Group members"><h2 className="flex items-center gap-2 font-bold text-primary"><UsersRound className="h-4 w-4 text-[hsl(var(--support-moss))]" />Members</h2><ul className="mt-3 space-y-2">{data.members.map((member) => <li key={member.userId} className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-[11px] font-bold text-primary">{initials(member.name)}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{member.name}</span>{member.userId === data.group.guideId && <span className="text-[10px] font-bold text-[hsl(var(--support-moss))]">Guide</span>}</li>)}</ul></section>
              <MemberPanel group={data.group} members={data.members} onUpdate={updateMembers} />
              <p className="rounded-xl border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-[hsl(var(--support-moss))]" />Shared with invited members and the creating guide. This space does not use one-to-one mentorship messages.</p>
            </aside>
          </div>
        </>}
  </main>;
}
