import { useState } from 'react';
import { Link } from 'wouter';
import { AlertCircle, Archive, Check, Circle, Clock3, FileText, Loader2, Send, Sparkles, UploadCloud, X } from 'lucide-react';
import {
  getListEnrollmentsQueryKey, getListStudentProjectAssignmentsQueryKey, useListEnrollments,
  useListStudentProjectAssignments, useRequestStudentProjectUpload, useSubmitStudentProject,
  useUpdateEnrollment, type Enrollment, type StudentProjectAssignment,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Coach, CoachToggle } from '@/components/app/coach';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CardSkeletons, Empty, ErrorPanel, PageHeader, SignInWall } from '@/components/app/bits';
import { errMsg, progressOf, statusLabel, useAuth, useInvalidateAll, useTitle } from '@/lib/app';
import { useQueryClient } from '@tanstack/react-query';

const validUrl = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };
const maxFileBytes = 25 * 1024 * 1024;
const maxTotalBytes = 40 * 1024 * 1024;
const supportedExtensions = new Set([
  '.zip', '.pdf', '.txt', '.md', '.csv', '.json', '.html', '.htm', '.xml', '.yaml', '.yml',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.h', '.cpp', '.hpp', '.cs', '.go', '.rs',
  '.php', '.rb', '.sh', '.sql', '.ipynb', '.png', '.jpg', '.jpeg', '.webp', '.docx', '.pptx', '.xlsx',
]);
const fileMimeFallback: Record<string, string> = {
  '.zip': 'application/zip', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.json': 'application/json',
  '.ipynb': 'application/x-ipynb+json',
};
const fileExtension = (name: string) => name.slice(name.lastIndexOf('.')).toLowerCase();
const displayDate = (value: string | Date | null) => {
  if (!value) return 'No deadline';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No deadline' : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
};

function AssignedProjectCard({ assignment }: { assignment: StudentProjectAssignment }) {
  const [files, setFiles] = useState<File[]>([]);
  const [reflection, setReflection] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [fileError, setFileError] = useState('');
  const requestUpload = useRequestStudentProjectUpload();
  const submit = useSubmitStudentProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const latest = assignment.latestSubmission;

  const chooseFiles = (selected: FileList | null) => {
    const next = [...(selected ?? [])];
    setFileError('');
    if (next.length > 5) { setFileError('Choose up to five files, or one ZIP archive.'); return; }
    const total = next.reduce((sum, file) => sum + file.size, 0);
    if (total > maxTotalBytes) { setFileError('The total upload size must be 40 MB or less.'); return; }
    if (next.some((file) => file.size < 1 || file.size > maxFileBytes)) { setFileError('Each file must be smaller than 25 MB.'); return; }
    if (next.some((file) => !supportedExtensions.has(fileExtension(file.name)))) { setFileError('That file type is not supported. See the file picker for accepted types.'); return; }
    if (next.some((file) => fileExtension(file.name) === '.zip') && next.length > 1) { setFileError('Upload a ZIP archive by itself, or choose several individual files.'); return; }
    setFiles(next);
  };

  const submitWork = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFileError('');
    if (!files.length) { setFileError('Add at least one file before submitting.'); return; }
    if (projectUrl.trim() && !validUrl(projectUrl.trim())) { setFileError('Enter a valid project link starting with http:// or https://.'); return; }
    setBusy(true);
    try {
      const uploadTokens: string[] = [];
      for (let index = 0; index < files.length; index++) {
        const file = files[index]!;
        const extension = fileExtension(file.name);
        const contentType = (file.type || fileMimeFallback[extension] || 'application/octet-stream').toLowerCase();
        setUploadProgress(`Uploading ${index + 1} of ${files.length}…`);
        const upload = await requestUpload.mutateAsync({
          targetId: assignment.targetId,
          data: { fileName: file.name, contentType, size: file.size },
        });
        const response = await fetch(upload.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: file,
        });
        if (!response.ok) throw new Error(`Could not upload ${file.name}. Please try again.`);
        uploadTokens.push(upload.uploadToken);
      }
      setUploadProgress('Sending for guide review…');
      await submit.mutateAsync({
        targetId: assignment.targetId,
        data: { uploadTokens, reflection: reflection.trim(), projectUrl: projectUrl.trim() },
      });
      await queryClient.invalidateQueries({ queryKey: getListStudentProjectAssignmentsQueryKey() });
      setFiles([]);
      setReflection('');
      setProjectUrl('');
      toast({ title: 'Project submitted', description: 'Your guide can review the files and AI feedback draft. The AI result is not a final grade.' });
    } catch (error) {
      setFileError(errMsg(error));
    } finally {
      setBusy(false);
      setUploadProgress('');
    }
  };

  return (
    <section className="ink-card overflow-hidden" data-testid={`assigned-project-${assignment.targetId}`}>
      <div className="grid gap-5 border-b border-border/80 bg-secondary/35 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{assignment.courseTitle}</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-primary">{assignment.title}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{assignment.instructions}</p>
        </div>
        <div className="flex items-start">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-primary">
            <Clock3 className="h-3.5 w-3.5 text-accent" /> Due {displayDate(assignment.dueAt)}
          </span>
        </div>
      </div>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.72fr)]">
        <form onSubmit={submitWork} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`files-${assignment.targetId}`}>Project files</Label>
            <label htmlFor={`files-${assignment.targetId}`} className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-background px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-secondary/40">
              <UploadCloud className="h-7 w-7 text-accent" />
              <span className="mt-2 text-sm font-semibold text-primary">Choose files or a ZIP archive</span>
              <span className="mt-1 text-xs text-muted-foreground">Up to 5 files · 25 MB each · 40 MB total</span>
            </label>
            <input id={`files-${assignment.targetId}`} type="file" multiple accept=".zip,.pdf,.txt,.md,.csv,.json,.html,.htm,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.java,.c,.h,.cpp,.hpp,.cs,.go,.rs,.php,.rb,.sh,.sql,.ipynb,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx" className="sr-only" onChange={(event) => { chooseFiles(event.currentTarget.files); event.currentTarget.value = ''; }} disabled={busy} />
            {files.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {files.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex min-h-10 items-center gap-2 rounded-lg bg-secondary/60 px-3 text-sm">
                    {fileExtension(file.name) === '.zip' ? <Archive className="h-4 w-4 shrink-0 text-accent" /> : <FileText className="h-4 w-4 shrink-0 text-accent" />}
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(file.size < 1024 * 1024 ? 2 : 1)} MB</span>
                    <button type="button" aria-label={`Remove ${file.name}`} className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} disabled={busy}><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`project-reflection-${assignment.targetId}`}>What did you make and learn? <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id={`project-reflection-${assignment.targetId}`} value={reflection} onChange={(event) => setReflection(event.target.value)} rows={4} maxLength={12000} placeholder="Briefly explain what you built, what changed while you worked, and what you would improve." disabled={busy} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`project-url-${assignment.targetId}`}>Project link <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input id={`project-url-${assignment.targetId}`} value={projectUrl} onChange={(event) => setProjectUrl(event.target.value)} placeholder="https://…" maxLength={2000} disabled={busy} />
          </div>
          {fileError && <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{fileError}</p>}
          {uploadProgress && <p role="status" className="text-sm text-muted-foreground">{uploadProgress}</p>}
          <Button type="submit" disabled={busy} className="min-h-11 w-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto" data-testid={`button-submit-assignment-${assignment.targetId}`}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {latest ? 'Submit an updated version' : 'Submit project'}
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/35 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-primary"><ClipboardListIcon />How your guide will review it</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{assignment.rubric}</p>
          </div>
          <div className="rounded-xl border border-[hsl(var(--ledger))]/20 bg-[hsl(var(--ledger))]/[0.035] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles className="h-4 w-4 text-accent" />AI-assisted review</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Your files are checked against the guide’s rubric. The AI feedback is shared with your guide for review; it is not an official grade or certification.</p>
            {latest && (
              <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-medium text-foreground/80">
                {latest.evaluationStatus === 'pending' ? 'Your submission is being reviewed.' : latest.evaluationStatus === 'ready' ? 'AI review is ready for your guide.' : 'Your guide can retry the AI review.'}
              </p>
            )}
          </div>
          {latest && (
            <div className="rounded-xl border border-border bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest submission · {displayDate(latest.submittedAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {latest.files.map((file) => (
                  <a key={file.id} href={file.downloadUrl} className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm hover:bg-secondary">
                    {file.isArchive ? <Archive className="h-4 w-4 shrink-0 text-accent" /> : <FileText className="h-4 w-4 shrink-0 text-accent" />}
                    <span className="max-w-[170px] truncate">{file.fileName}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function ClipboardListIcon() {
  return <FileText className="h-4 w-4 text-accent" />;
}

function ProjectCard({ e }: { e: Enrollment }) {
  const [url, setUrl] = useState(e.projectUrl);
  const [refl, setRefl] = useState(e.reflection);
  const upd = useUpdateEnrollment();
  const inval = useInvalidateAll();
  const { toast } = useToast();
  const [mode, setMode] = useState<'draft' | 'submit' | null>(null);
  const [coach, setCoach] = useState(false);
  const p = progressOf(e);
  const submitted = statusLabel(e.status) === 'Awaiting mentor review';
  const checks = [
    { ok: validUrl(url), l: 'A valid http(s) repository or project link' },
    { ok: refl.trim().length >= 30, l: `Reflection of at least 30 characters (${refl.trim().length})` },
    { ok: e.loggedHours >= e.hours, l: `Logged hours ${e.loggedHours}/${e.hours}` },
    { ok: p.done === p.mods.length && p.mods.length > 0, l: `All applicable modules done (${p.done}/${p.mods.length})` },
  ];
  const ready = checks.every((c) => c.ok);

  const save = async (submit: boolean) => {
    setMode(submit ? 'submit' : 'draft');
    try {
      await upd.mutateAsync({ id: e.id, data: { projectUrl: url.trim(), reflection: refl, submit } });
      await inval();
      toast({ title: submit ? 'Sent for mentor review' : 'Draft saved', description: submit ? 'Your mentor will review it. This is not automatic grading or approval.' : undefined });
    } catch (err) {
      toast({ title: 'Could not save', description: errMsg(err), variant: 'destructive' });
    } finally {
      setMode(null);
    }
  };

  return (
    <section className="ink-card rise grid gap-6 p-6 lg:grid-cols-[1.4fr_1fr]" data-testid={`project-${e.id}`}>
      <div className="space-y-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{e.hours}-hour pathway · {statusLabel(e.status)}</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-primary">{e.course.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Deliverable: {e.course.deliverable}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`url-${e.id}`}>Repository or project URL</Label>
          <Input id={`url-${e.id}`} value={url} onChange={(ev) => setUrl(ev.target.value)} placeholder="https://github.com/you/project" disabled={submitted} maxLength={2000} data-testid={`input-url-${e.id}`} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`refl-${e.id}`}>Reflection</Label>
          <Textarea id={`refl-${e.id}`} value={refl} onChange={(ev) => setRefl(ev.target.value)} rows={7} maxLength={12000} disabled={submitted} placeholder="What did you build, what broke, what would you do differently? Bangla or English is fine." data-testid={`input-reflection-${e.id}`} />
        </div>
      </div>
      <div className="rounded-2xl bg-secondary/60 p-5">
        <h3 className="font-display text-lg font-semibold text-primary">Ready for your mentor?</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {checks.map((c) => (
            <li key={c.l} className={`flex items-start gap-2 ${c.ok ? '' : 'text-muted-foreground'}`}>
              {c.ok ? <Check className="mt-0.5 h-4 w-4 text-accent" /> : <Circle className="mt-0.5 h-4 w-4" />}{c.l}
            </li>
          ))}
        </ul>
        {submitted ? (
          <p className="mt-5 rounded-xl bg-primary p-3 text-sm text-primary-foreground" data-testid={`status-submitted-${e.id}`}>Awaiting mentor review. This is a submission, not approval or certification.</p>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            <Button variant="outline" onClick={() => save(false)} disabled={!!mode} data-testid={`button-save-draft-${e.id}`}>{mode === 'draft' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save draft</Button>
            <Button onClick={() => save(true)} disabled={!ready || !!mode} className="bg-accent hover:bg-accent/90" data-testid={`button-submit-${e.id}`}>{mode === 'submit' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Submit for mentor review</Button>
            {!ready && <p className="text-xs text-muted-foreground">Finish the checklist to submit. You can save a draft anytime.</p>}
          </div>
        )}
        <div className="mt-4"><CoachToggle open={coach} onClick={() => setCoach((o) => !o)} label="Feedback on this draft" testId={`button-coach-project-${e.id}`} /></div>
      </div>
      {coach && (
        <div className="lg:col-span-2">
          <Coach
            contextKey={`project:${e.id}`}
            contextLabel={`Project draft · ${e.course.title}`}
            courseId={e.course.id}
            tool="review"
            moves={[
              { id: 'reflection', level: 'Reflect', label: 'Feedback on my reflection', request: 'Give formative feedback on my current reflection draft against the deliverable: what is specific and strong, what is vague, and two questions that would push it toward analysis. Do not rewrite it for me.' },
              { id: 'deliverable', level: 'Apply', label: 'Does my description fit the deliverable?', request: 'Compare what my reflection says I built with the stated deliverable. List gaps I should check or explain. You cannot see my repository; base this only on my written text.' },
              { id: 'viva', level: 'Analyse', label: 'One viva question', tool: 'viva', request: 'Based only on my reflection text, ask me one probing viva question a mentor might ask about this project. Wait for my answer.' },
            ]}
            getContext={() => [
              `Internship: ${e.course.title}`,
              `Deliverable: ${e.course.deliverable}`,
              `Status: ${statusLabel(e.status)}. Modules ${p.done}/${p.mods.length}. Hours ${e.loggedHours}/${e.hours}.`,
              `Project link entered (as text only; the coach has NOT opened it and must not claim to have seen its contents): ${url.trim() || '(none yet)'}`,
              `Current reflection draft (may be unsaved):\n${refl.trim() || '(empty)'}`,
            ].join('\n')}
            intro="The coach reads the reflection text currently in the box, including unsaved edits. It cannot open your link."
            onClose={() => setCoach(false)}
            testId={`coach-project-${e.id}`}
          />
        </div>
      )}
    </section>
  );
}

export default function Projects() {
  useTitle('Projects');
  const { user, isLoading } = useAuth();
  const q = useListEnrollments({ query: { enabled: !!user, queryKey: getListEnrollmentsQueryKey() } });
  const assigned = useListStudentProjectAssignments({
    query: {
      enabled: !!user && !user.isGuide && !user.isAdmin,
      refetchInterval: (query) => query.state.data?.some((project) =>
        project.latestSubmission?.evaluationStatus === 'pending') ? 12_000 : false,
    },
  });
  return (
    <div>
      <PageHeader kicker="Projects" title="Show the work, then say what you learned" sub="Upload project files for a guide-assigned brief. AI can prepare review notes for your guide, but it does not give an official grade." />
      {isLoading ? <CardSkeletons n={1} h="h-80" /> : !user ? <SignInWall what="manage your projects" /> : q.isLoading ? <CardSkeletons n={1} h="h-80" /> : q.error ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <Empty title="No project yet" body="Projects belong to a pathway. Enroll first, then return here." action={<Button asChild data-testid="button-empty-explore"><Link href="/explore">Explore internships</Link></Button>} />
      ) : (
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">Assigned by your guide</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-primary">Project briefs</h2>
              </div>
              {assigned.data?.length ? <span className="text-sm text-muted-foreground">{assigned.data.length} assigned</span> : null}
            </div>
            {assigned.isLoading ? <CardSkeletons n={1} h="h-72" /> : assigned.error ? (
              <ErrorPanel error={assigned.error} onRetry={() => assigned.refetch()} />
            ) : assigned.data?.length ? (
              <div className="space-y-5">{assigned.data.map((assignment) => <AssignedProjectCard key={assignment.targetId} assignment={assignment} />)}</div>
            ) : (
              <div className="ink-card flex items-start gap-3 p-4">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div><p className="font-semibold text-primary">No guide-assigned projects yet</p><p className="mt-1 text-sm text-muted-foreground">When your guide assigns work, the brief and file submission form will appear here.</p></div>
              </div>
            )}
          </section>
          <section className="space-y-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Portfolio</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-primary">Pathway reflection</h2>
            </div>
            <div className="space-y-6">{q.data.map((e) => <ProjectCard key={e.id} e={e} />)}</div>
          </section>
        </div>
      )}
    </div>
  );
}
