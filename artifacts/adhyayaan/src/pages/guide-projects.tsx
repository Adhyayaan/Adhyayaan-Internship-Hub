import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, CalendarDays, Check, ClipboardList, FileArchive, FileText,
  Loader2, Plus, RefreshCw, Sparkles, UsersRound,
} from 'lucide-react';
import {
  getListGuideProjectsQueryKey, useCreateGuideProjectAssignment, useListGuideProjects,
  useRetryGuideProjectEvaluation,
} from '@workspace/api-client-react';
import type { GuideProjectAssignment, GuideProjectSubmission, ProjectAiEvaluation } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CardSkeletons, Empty, ErrorPanel, PageHeader, SignInWall } from '@/components/app/bits';
import { errMsg, useAuth, useTitle } from '@/lib/app';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

function fmtDate(value: string | Date | null | undefined) {
  if (!value) return 'No deadline';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'No deadline'
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

function EvaluationPanel({ evaluation }: { evaluation: ProjectAiEvaluation | null }) {
  if (!evaluation) return null;
  return (
    <div className="mt-4 space-y-4 rounded-xl border border-[hsl(var(--ledger))]/20 bg-[hsl(var(--ledger))]/[0.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Sparkles className="h-4 w-4 text-accent" /> AI review draft
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {evaluation.overallScore === null ? 'Not enough evidence to score' : `Suggested score ${evaluation.overallScore}/100`}
        </span>
      </div>
      <p className="text-sm leading-6 text-foreground/85">{evaluation.summary}</p>
      {evaluation.criteria.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Rubric evidence</h5>
          {evaluation.criteria.map((criterion, index) => (
            <div key={`${criterion.criterion}-${index}`} className="rounded-lg bg-white/80 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{criterion.criterion}</span>
                <span className="text-xs font-bold text-primary">{criterion.score}/{criterion.maxScore}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{criterion.feedback}</p>
              {criterion.evidence && <p className="mt-1 text-xs text-foreground/70">Evidence: {criterion.evidence}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {evaluation.strengths.length > 0 && (
          <div className="rounded-lg bg-white/80 p-3">
            <h5 className="text-xs font-bold uppercase tracking-wide text-emerald-800">What is working</h5>
            <ul className="mt-2 space-y-1.5 text-sm">{evaluation.strengths.map((text, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />{text}</li>)}</ul>
          </div>
        )}
        {evaluation.improvements.length > 0 && (
          <div className="rounded-lg bg-white/80 p-3">
            <h5 className="text-xs font-bold uppercase tracking-wide text-primary">Suggested improvements</h5>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm">{evaluation.improvements.map((text, i) => <li key={i}>{text}</li>)}</ul>
          </div>
        )}
      </div>
      {evaluation.guideQuestions.length > 0 && (
        <div>
          <h5 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Questions for your conversation</h5>
          <ul className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">{evaluation.guideQuestions.map((text, i) => <li key={i}>{text}</li>)}</ul>
        </div>
      )}
      {evaluation.limitations.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          Review limits: {evaluation.limitations.join(' ')}
        </p>
      )}
    </div>
  );
}

function LearnerSubmission({
  target,
}: {
  target: GuideProjectAssignment['targets'][number];
}) {
  const retry = useRetryGuideProjectEvaluation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const submission = target.latestSubmission as GuideProjectSubmission | null;

  const retryEvaluation = async () => {
    if (!submission) return;
    try {
      await retry.mutateAsync({ submissionId: submission.id });
      await queryClient.invalidateQueries({ queryKey: getListGuideProjectsQueryKey() });
      toast({ title: 'Evaluation started', description: 'The AI review will appear here when it is ready.' });
    } catch (error) {
      toast({ title: 'Could not start evaluation', description: errMsg(error), variant: 'destructive' });
    }
  };

  return (
    <article className="rounded-xl border border-border/80 bg-white/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-primary">{target.learnerName}</p>
          <p className="mt-0.5 break-all text-xs text-muted-foreground">{target.learnerEmail}</p>
        </div>
        {!submission ? (
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">Not submitted</span>
        ) : submission.evaluationStatus === 'pending' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reviewing</span>
        ) : submission.evaluationStatus === 'failed' ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900"><AlertTriangle className="h-3.5 w-3.5" />Review needs retry</span>
        ) : (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">AI review ready</span>
        )}
      </div>
      {submission && (
        <div className="mt-4 border-t border-border/70 pt-4">
          <p className="text-xs text-muted-foreground">Submitted {fmtDate(submission.submittedAt)} · Version {submission.version}</p>
          {submission.reflection && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{submission.reflection}</p>}
          {submission.projectUrl && (
            <a href={submission.projectUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-sm font-semibold text-primary underline underline-offset-4">
              Project link <ArrowUpRight className="h-4 w-4 shrink-0" />
            </a>
          )}
          {submission.files.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {submission.files.map((file) => (
                <a key={file.id} href={file.downloadUrl} className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium hover:bg-secondary">
                  {file.isArchive ? <FileArchive className="h-4 w-4 shrink-0 text-accent" /> : <FileText className="h-4 w-4 shrink-0 text-accent" />}
                  <span className="max-w-[220px] truncate">{file.fileName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(file.size < 1024 * 1024 ? 2 : 1)} MB</span>
                </a>
              ))}
            </div>
          )}
          {submission.evaluationStatus === 'failed' && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3">
              <p className="text-sm text-amber-950">The AI could not complete its review. The original files are saved.</p>
              <Button type="button" size="sm" variant="outline" onClick={retryEvaluation} disabled={retry.isPending}>
                {retry.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Try again
              </Button>
            </div>
          )}
          {submission.evaluationStatus === 'ready' && <EvaluationPanel evaluation={submission.evaluation ?? null} />}
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            AI feedback is a draft for your review. Your judgement and discussion with the learner remain authoritative.
          </p>
        </div>
      )}
    </article>
  );
}

export default function GuideProjectsPage() {
  useTitle('Guide projects');
  const { user, isLoading: authLoading } = useAuth();
  const q = useListGuideProjects({
    query: {
      enabled: !!user?.isGuide,
      refetchInterval: (query) => query.state.data?.assignments.some((assignment) =>
        assignment.targets.some((target) => target.latestSubmission?.evaluationStatus === 'pending')) ? 10_000 : false,
    },
  });
  const create = useCreateGuideProjectAssignment();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [rubric, setRubric] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const projects = q.data;
  const courses = projects?.courses ?? [];
  const learners = useMemo(
    () => (projects?.learners ?? []).filter((learner) => !courseId || learner.courseId === courseId),
    [projects?.learners, courseId],
  );
  const totalSubmissions = projects?.assignments.reduce(
    (count, assignment) => count + assignment.targets.filter((target) => !!target.latestSubmission).length,
    0,
  ) ?? 0;
  const awaitingReview = projects?.assignments.reduce(
    (count, assignment) => count + assignment.targets.filter((target) =>
      target.latestSubmission?.evaluationStatus === 'ready' || target.latestSubmission?.evaluationStatus === 'failed').length,
    0,
  ) ?? 0;

  const selectCourse = (nextCourse: string) => {
    setCourseId(nextCourse);
    setSelectedIds([]);
  };
  const toggleLearner = (enrollmentId: string) => {
    setSelectedIds((current) => current.includes(enrollmentId)
      ? current.filter((id) => id !== enrollmentId)
      : [...current, enrollmentId]);
  };
  const toggleAll = () => {
    const ids = learners.map((learner) => learner.enrollmentId);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  };

  const submitAssignment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (!courseId || !selectedIds.length) {
      setFormError('Choose a course and at least one learner.');
      return;
    }
    try {
      await create.mutateAsync({
        data: {
          courseId,
          title: title.trim(),
          instructions: instructions.trim(),
          rubric: rubric.trim(),
          dueAt: dueAt ? new Date(`${dueAt}T23:59:59+05:30`).toISOString() : null,
          enrollmentIds: selectedIds,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListGuideProjectsQueryKey() });
      setTitle('');
      setInstructions('');
      setRubric('');
      setDueAt('');
      setSelectedIds([]);
      toast({ title: 'Project assigned', description: `Assigned to ${selectedIds.length} learner${selectedIds.length === 1 ? '' : 's'}.` });
    } catch (error) {
      setFormError(errMsg(error));
    }
  };

  if (authLoading) return <CardSkeletons n={1} h="h-80" />;
  if (!user) return <SignInWall what="manage student projects" />;
  if (!user.isGuide) return <Empty title="Guide access required" body="This workspace is available to internship guides." />;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Guide workspace · Projects"
        title="Set work. Review evidence."
        sub="Assign a practical project to selected learners, then review their files and the AI-generated feedback draft."
      />
      {q.isLoading ? <CardSkeletons n={2} h="h-64" /> : q.error ? (
        <ErrorPanel error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Project briefs', value: projects?.assignments.length ?? 0, icon: ClipboardList },
              { label: 'Submissions received', value: totalSubmissions, icon: FileText },
              { label: 'Reviews to check', value: awaitingReview, icon: Sparkles },
            ].map((stat) => (
              <div key={stat.label} className="ink-card flex items-center gap-4 p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><stat.icon className="h-5 w-5" /></span>
                <div><p className="text-2xl font-semibold text-primary">{stat.value}</p><p className="text-xs text-muted-foreground">{stat.label}</p></div>
              </div>
            ))}
          </div>

          <section className="ink-card overflow-hidden">
            <div className="bg-primary px-5 py-5 text-primary-foreground sm:px-7">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary-foreground/65">Build the brief</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">Assign a new project</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-primary-foreground/75">Choose one pathway, select the learners, and give them a clear task and review rubric.</p>
            </div>
            <form onSubmit={submitAssignment} className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="project-course">Internship pathway</Label>
                  <select id="project-course" value={courseId} onChange={(event) => selectCourse(event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" required>
                    <option value="">Choose a course</option>
                    {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="project-title">Project title</Label>
                  <Input id="project-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: Map local water access" maxLength={160} required minLength={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="project-instructions">Instructions</Label>
                  <Textarea id="project-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Explain the task, expected outputs, and any privacy or fieldwork rules." rows={5} maxLength={10000} required minLength={20} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="project-rubric">Review rubric</Label>
                  <Textarea id="project-rubric" value={rubric} onChange={(event) => setRubric(event.target.value)} placeholder="List the criteria you will use to review the work." rows={4} maxLength={5000} required minLength={10} />
                  <p className="text-xs text-muted-foreground">The AI uses this rubric to prepare feedback for you. You make the final judgement.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="project-deadline">Target deadline <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="project-deadline" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-secondary/40 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-primary">Select learners</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{selectedIds.length} selected · only your current learners are listed</p>
                  </div>
                  {learners.length > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
                      {learners.every((learner) => selectedIds.includes(learner.enrollmentId)) ? 'Clear course' : 'Select all'}
                    </Button>
                  )}
                </div>
                {!courseId ? (
                  <p className="mt-5 rounded-lg bg-white p-4 text-sm text-muted-foreground">Choose a course to see its assigned learners.</p>
                ) : learners.length === 0 ? (
                  <p className="mt-5 rounded-lg bg-white p-4 text-sm text-muted-foreground">No learners are currently assigned to this pathway.</p>
                ) : (
                  <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {learners.map((learner) => (
                      <label key={learner.enrollmentId} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${selectedIds.includes(learner.enrollmentId) ? 'border-primary/50 bg-white' : 'border-transparent bg-white/70 hover:border-border'}`}>
                        <input type="checkbox" checked={selectedIds.includes(learner.enrollmentId)} onChange={() => toggleLearner(learner.enrollmentId)} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">{learner.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{learner.college || 'College not listed'}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {formError && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
                <Button type="submit" disabled={create.isPending || !courses.length} className="mt-5 min-h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Assign project to {selectedIds.length || 'selected'} learner{selectedIds.length === 1 ? '' : 's'}
                </Button>
              </div>
            </form>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Submitted work and review</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-primary">Your project briefs</h2>
              </div>
              {projects?.assignments.length ? <span className="text-sm text-muted-foreground">{projects.assignments.length} brief{projects.assignments.length === 1 ? '' : 's'}</span> : null}
            </div>
            {!projects?.assignments.length ? (
              <Empty title="No project briefs yet" body="Create a brief above. It will appear here with the selected learners and their submissions." />
            ) : (
              <div className="space-y-4">
                {projects.assignments.map((assignment) => (
                  <article key={assignment.id} className="ink-card overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 p-5 sm:p-6">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">{assignment.courseTitle}</p>
                        <h3 className="mt-1 font-display text-xl font-semibold text-primary">{assignment.title}</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{assignment.instructions}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5"><UsersRound className="h-3.5 w-3.5" />{assignment.targets.length} learners</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(assignment.dueAt)}</span>
                      </div>
                    </div>
                    <div className="space-y-3 p-4 sm:p-5">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><UsersRound className="h-4 w-4" />Assigned learners</div>
                      <div className="grid gap-3 xl:grid-cols-2">
                        {assignment.targets.map((target) => <LearnerSubmission key={target.id} target={target} />)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
