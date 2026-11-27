import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowUpRight, Bell, CalendarDays, Check, CheckCircle2, ChevronRight, FileText, Image as ImageIcon,
  LockKeyhole, MessageCircle, Paperclip, Send, ShieldCheck, Video, X,
} from 'lucide-react';
import {
  getDownloadMentorshipAttachmentQueryKey, getGetMentorshipNotificationPreferenceQueryKey,
  getListMentorshipMessagesQueryKey, getListMentorshipThreadsQueryKey,
  useAnswerMentorshipQuestion, useDownloadMentorshipAttachment, useListMentorshipMessages, useListMentorshipThreads,
  useGetMentorshipNotificationPreference, useRequestMentorshipUpload, useSendMentorshipMessage,
  useUpdateMentorshipNotificationPreference,
  type MentorshipAttachment, type MentorshipMessage, type MentorshipThread,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth, errMsg, useTitle } from '@/lib/app';
import { EmptyPanel, ErrorPanel, PageSkeleton } from '@/components/assessment/parts';

const ACCEPTED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const messageSchema = z.object({ body: z.string().max(5000, 'Use no more than 5,000 characters.') });
const questionResponseSchema = z.object({
  response: z.string().trim().min(1, 'Add a response before saving.').max(3000, 'Keep your response to 3,000 characters or fewer.'),
});
const guideQuestionSchema = z.object({
  prompt: z.string().trim().min(1, 'Write a question prompt first.').max(1200, 'Use no more than 1,200 characters.'),
  type: z.enum(['multiple_choice', 'open_response']),
  optionsText: z.string(),
}).superRefine((question, context) => {
  if (question.type !== 'multiple_choice') return;
  const options = question.optionsText.split(/\r?\n/).map((option) => option.trim()).filter(Boolean);
  const distinct = new Set(options.map((option) => option.toLowerCase()));
  if (options.length < 2 || options.length > 6 || distinct.size !== options.length || options.some((option) => option.length > 200)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add 2–6 distinct options of 200 characters or fewer, one per line.',
      path: ['optionsText'],
    });
  }
});
const meetingSchema = z.object({
  url: z.string().url('Enter a valid Google Meet link.').refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && parsed.hostname === 'meet.google.com' && /^\/[a-z0-9-]+\/?$/i.test(parsed.pathname) && !parsed.port && !parsed.username && !parsed.password;
    } catch { return false; }
  }, 'Use a link from meet.google.com.'),
  startsAt: z.string().refine((value) => !value || Number.isFinite(Date.parse(value)), 'Enter a valid session date and time.'),
  agenda: z.string().max(1000, 'Use no more than 1,000 characters.'),
});

function when(date: string | null) {
  if (!date) return 'No messages yet';
  const value = new Date(date);
  return `${value.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${value.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}

function ThreadRow({ thread, selected = false, isGuide = false }: { thread: MentorshipThread; selected?: boolean; isGuide?: boolean }) {
  return <Link aria-current={selected ? 'page' : undefined} href={`/mentorship/${thread.enrollmentId}`} className={`group grid min-w-0 gap-2 rounded-xl border p-3.5 transition-colors sm:p-4 ${selected ? 'border-[hsl(var(--ledger))]/60 bg-[hsl(var(--ledger-soft))]/75 ring-1 ring-[hsl(var(--ledger))]/15' : 'border-border bg-card hover:border-[hsl(var(--ledger))]/45 hover:bg-[hsl(var(--ledger-soft))]/35'}`} data-testid={`link-mentorship-thread-${thread.enrollmentId}`}>
    <span className="min-w-0">
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 font-display text-base font-bold leading-snug text-primary">{thread.courseTitle}</span>
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{thread.hours}h</span>
      </span>
      <span className="mt-1 block truncate text-xs text-muted-foreground">{isGuide ? `Learner · ${thread.studentName}` : thread.guideName ? `Guide · ${thread.guideName}` : 'Guide assignment pending'}</span>
      <span className="mt-2 flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/75">{thread.lastMessagePreview || 'Start a private project conversation'}</span>
        {thread.unreadCount > 0 && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground" data-testid={`status-unread-${thread.enrollmentId}`}>{thread.unreadCount}</span>}
      </span>
    </span>
    <span className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
      <span>{thread.messageCount} {thread.messageCount === 1 ? 'message' : 'messages'}</span>
      <span className="flex items-center gap-1">{when(thread.lastMessageAt)}<ChevronRight className="h-3.5 w-3.5 shrink-0 text-accent transition-transform group-hover:translate-x-0.5" /></span>
    </span>
  </Link>;
}

function ThreadList({ threads, selectedId, loading, error, onRetry, isGuide = false }: {
  threads?: MentorshipThread[]; selectedId?: string; loading?: boolean; error?: string; onRetry?: () => void; isGuide?: boolean;
}) {
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card" aria-label="Mentorship conversations">
    <header className="border-b border-border px-4 py-4 sm:px-5">
      <div className="flex items-end justify-between gap-2">
        <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Your private spaces</p><h2 className="mt-1 font-display text-lg font-bold text-primary">Conversations</h2></div>
        {threads && <span className="text-xs text-muted-foreground">{threads.length} {threads.length === 1 ? 'pathway' : 'pathways'}</span>}
      </div>
    </header>
    <div className="max-h-[calc(100dvh-15rem)] space-y-2 overflow-y-auto p-3 sm:max-h-[calc(100dvh-17rem)] sm:p-3.5">
      {loading ? <div className="space-y-2" aria-busy="true" aria-label="Loading conversations">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-secondary/60" />)}</div>
        : error ? <div className="rounded-xl bg-destructive/5 p-4"><p className="text-sm font-semibold text-foreground">Conversations did not load</p><p className="mt-1 text-xs text-muted-foreground">{error}</p><button type="button" onClick={onRetry} className="mt-3 min-h-10 text-sm font-bold text-primary underline underline-offset-4" data-testid="button-retry-mentorship-threads">Try again</button></div>
          : !threads?.length ? <div className="px-3 py-9 text-center"><MessageCircle className="mx-auto h-6 w-6 text-[hsl(var(--ledger))]" /><p className="mt-3 text-sm font-semibold text-primary">No conversations yet</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{isGuide ? 'Learner pathways assigned to you will appear here.' : 'Your guide space appears here when you join an internship pathway.'}</p></div>
            : threads.map((thread) => <ThreadRow key={thread.enrollmentId} thread={thread} selected={selectedId === thread.enrollmentId} isGuide={isGuide} />)}
    </div>
  </section>;
}

export function MentorshipListPage() {
  useTitle('Mentorship');
  const { user, isLoading: authLoading } = useAuth();
  const q = useListMentorshipThreads({ query: { enabled: !!user, queryKey: getListMentorshipThreadsQueryKey() } });
  const queryClient = useQueryClient();
  const notificationPreference = useGetMentorshipNotificationPreference({
    query: { enabled: !!user, queryKey: getGetMentorshipNotificationPreferenceQueryKey() },
  });
  const updateNotificationPreference = useUpdateMentorshipNotificationPreference();
  const [notificationError, setNotificationError] = useState('');

  async function toggleBrowserNotifications() {
    const enabled = !notificationPreference.data?.browserNotificationsEnabled;
    setNotificationError('');
    try {
      if (enabled) {
        if (!('Notification' in window)) {
          setNotificationError('This browser does not support browser notifications.');
          return;
        }
        let permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setNotificationError(permission === 'denied'
            ? 'Notifications are blocked in this browser. Allow them in browser settings, then try again.'
            : 'Allow browser notifications to turn this on.');
          return;
        }
      }
      const saved = await updateNotificationPreference.mutateAsync({
        data: { browserNotificationsEnabled: enabled },
      });
      queryClient.setQueryData(getGetMentorshipNotificationPreferenceQueryKey(), saved);
    } catch (error) {
      setNotificationError(errMsg(error));
    }
  }

  if (authLoading) return <main className="mx-auto max-w-5xl p-4 sm:p-8"><PageSkeleton /></main>;
  if (!user) return <main className="mx-auto max-w-5xl p-4 sm:p-8"><EmptyPanel title="Sign in to view your conversations" icon={<LockKeyhole className="h-6 w-6" />}><p>Your private guide conversations are available after you sign in.</p><Button asChild variant="outline" className="mt-4"><Link href="/login">Sign in</Link></Button></EmptyPanel></main>;
  return <main className="mx-auto max-w-[1440px] min-w-0 space-y-5 p-3 pb-24 sm:space-y-6 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-end justify-between gap-3 px-1">
      <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Project guidance · private space</p><h1 className="mt-1 font-display text-2xl font-black text-primary sm:text-3xl">Mentorship</h1><p className="mt-1 max-w-xl text-sm text-muted-foreground">A quiet place to think through your project with the guide assigned to your pathway.</p></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-[hsl(var(--ledger))]"><LockKeyhole className="h-3.5 w-3.5" />Private to you and your guide</span>
    </header>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:items-stretch">
      <ThreadList threads={q.data} loading={q.isLoading} error={q.isError ? errMsg(q.error) : undefined} onRetry={() => void q.refetch()} isGuide={!!user.isGuide} />
      <section className="hidden min-w-0 rounded-2xl border border-border bg-card lg:grid lg:min-h-[33rem] lg:place-items-center" aria-label="Conversation selection">
        <div className="max-w-sm px-8 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]"><MessageCircle className="h-6 w-6" /></span><h2 className="mt-4 font-display text-xl font-bold text-primary">Choose a pathway</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Open a conversation to share project progress, ask for guidance, or respond to a learning question.</p><p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">Each space is private to the learner and currently assigned guide.</p></div>
      </section>
    </div>
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-label="Notification settings">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]"><Bell className="h-5 w-5" /></span>
        <div>
          <h2 className="font-display font-bold text-primary">Browser notifications</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">Get an alert when a message arrives while Adhyayaan is open. Alerts do not show message text.</p>
          {notificationError && <p className="mt-2 text-xs text-destructive" role="alert" data-testid="status-notification-error">{notificationError}</p>}
          {typeof window !== 'undefined' && !('Notification' in window) && <p className="mt-2 text-xs text-muted-foreground">This browser does not support browser notifications.</p>}
        </div>
      </div>
      <Button type="button" variant={notificationPreference.data?.browserNotificationsEnabled ? 'default' : 'outline'} onClick={() => void toggleBrowserNotifications()} disabled={notificationPreference.isLoading || updateNotificationPreference.isPending || (!('Notification' in window) && !notificationPreference.data?.browserNotificationsEnabled)} data-testid="button-toggle-browser-notifications">
        {updateNotificationPreference.isPending ? 'Saving…' : notificationPreference.data?.browserNotificationsEnabled ? 'On · Turn off' : 'Turn on'}
      </Button>
    </section>
  </main>;
}

function AttachmentAction({ attachment, onPreview }: { attachment: MentorshipAttachment; onPreview: (url: string, name: string) => void }) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const download = useDownloadMentorshipAttachment(attachment.id, {
    query: { enabled: false, queryKey: getDownloadMentorshipAttachmentQueryKey(attachment.id) },
  });
  const Icon = attachment.isImage ? ImageIcon : FileText;
  async function openAttachment() {
    setActive(true);
    setError('');
    try {
      const result = await download.refetch();
      if (!result.data) throw new Error('This file could not be opened. Please try again.');
      const url = URL.createObjectURL(result.data);
      if (attachment.isImage) onPreview(url, attachment.fileName);
      else {
        const link = document.createElement('a');
        link.href = url;
        link.download = attachment.fileName;
        link.rel = 'noopener';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setError(errMsg(error));
    } finally {
      setActive(false);
    }
  }
  return <div className="min-w-0">
    <button type="button" onClick={() => void openAttachment()} disabled={active || download.isFetching} data-testid={`button-download-attachment-${attachment.id}`} className="flex min-h-12 w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-xs hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
      <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--ledger))]" /><span className="min-w-0 flex-1 truncate font-semibold">{active || download.isFetching ? 'Opening…' : attachment.fileName}</span><ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
    {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
  </div>;
}

function QuestionCard({ message, responses, isGuide, canAnswer, enrollmentId }: {
  message: MentorshipMessage; responses: MentorshipMessage[]; isGuide: boolean; canAnswer: boolean; enrollmentId: string;
}) {
  const qc = useQueryClient();
  const answer = useAnswerMentorshipQuestion();
  const latest = responses.at(-1);
  const responseForm = useForm<z.infer<typeof questionResponseSchema>>({
    resolver: zodResolver(questionResponseSchema),
    defaultValues: { response: latest?.body ?? '' },
  });
  const resetResponse = responseForm.reset;
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const options = message.question?.options ?? [];
  const multipleChoice = message.question?.type === 'multiple_choice';
  const changedExisting = responses.length > 1;

  useEffect(() => { resetResponse({ response: latest?.body ?? '' }); }, [latest?.id, latest?.body, resetResponse]);

  async function submitResponse(values: z.infer<typeof questionResponseSchema>) {
    const clean = values.response.trim();
    setError('');
    setSavedNotice('');
    try {
      await answer.mutateAsync({ enrollmentId, questionId: message.id, data: { response: clean } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListMentorshipMessagesQueryKey(enrollmentId) }),
        qc.invalidateQueries({ queryKey: getListMentorshipThreadsQueryKey() }),
      ]);
      responseForm.reset({ response: clean });
      setSavedNotice(latest ? 'Your response has been updated.' : 'Your response is saved.');
    } catch (cause) { setError(errMsg(cause)); }
  }

  return <article className="w-full max-w-[min(46rem,96%)] rounded-2xl border border-[hsl(var(--ledger))]/25 bg-card shadow-sm" data-testid={`question-card-${message.id}`}>
    <div className="border-b border-[hsl(var(--ledger))]/15 bg-[hsl(var(--ledger-soft))]/55 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-[hsl(var(--ledger))]"><MessageCircle className="h-4 w-4" />A question to think through</span>
        <span className="rounded-full border border-[hsl(var(--ledger))]/20 bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground/75">{responses.length ? (changedExisting ? 'Updated response' : 'Answered') : isGuide ? 'Waiting for learner' : canAnswer ? 'Waiting for your response' : 'Learner response'}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-foreground">{message.body}</p>
      <p className="mt-2 text-xs text-muted-foreground">{message.senderName} · {when(message.createdAt)}</p>
    </div>
    <div className="p-4 sm:p-5">
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Use this space to explain your thinking. This is for learning, not grading.</p>
      {canAnswer && <Form {...responseForm}><form onSubmit={responseForm.handleSubmit(submitResponse)} className="mt-4" data-testid={`form-answer-question-${message.id}`}>
        {multipleChoice
          ? <FormField control={responseForm.control} name="response" render={({ field }) => <FormItem>
            <FormLabel className="mb-2 block text-xs font-semibold text-foreground">Choose an option, then save your response</FormLabel>
            <FormControl><div className="grid gap-2" role="radiogroup" aria-label="Question options">
              {options.map((option, index) => <label key={`${option}-${index}`} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm leading-relaxed transition-colors ${field.value === option ? 'border-[hsl(var(--ledger))]/50 bg-[hsl(var(--ledger-soft))]/70' : 'border-border bg-background hover:border-[hsl(var(--ledger))]/35'}`}>
                <input type="radio" name={field.name} value={option} checked={field.value === option} onChange={() => field.onChange(option)} disabled={answer.isPending} className="mt-1 accent-[hsl(var(--ledger))]" />
                <span className="min-w-0 break-words">{option}</span>
              </label>)}
            </div></FormControl>
            <FormMessage />
          </FormItem>} />
          : <FormField control={responseForm.control} name="response" render={({ field }) => <FormItem>
            <FormLabel className="text-xs font-semibold text-foreground">Your response</FormLabel>
            <FormControl><textarea {...field} id={`answer-text-${message.id}`} maxLength={3000} rows={4} className="mt-2 min-h-28 w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Explain how you would approach it…" data-testid={`input-answer-question-${message.id}`} /></FormControl>
            <FormDescription className="text-[11px]">{field.value.length}/3,000 characters</FormDescription>
            <FormMessage />
          </FormItem>} />}
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          {multipleChoice && <span className="mr-auto text-[11px] text-muted-foreground">You can change your choice later.</span>}
          <Button type="submit" disabled={answer.isPending || !responseForm.watch('response').trim()} className="min-h-11" data-testid={`button-submit-answer-${message.id}`}>{answer.isPending ? 'Saving…' : latest ? 'Update response' : 'Save response'}</Button>
        </div>
      </form></Form>}
      {isGuide && <p className="mt-3 rounded-xl bg-background px-3 py-2.5 text-xs text-muted-foreground">The learner can respond here. Their latest response will stay with this question.</p>}
      {!canAnswer && !isGuide && <p className="mt-3 rounded-xl bg-background px-3 py-2.5 text-xs text-muted-foreground">The learner can respond after a guide is assigned.</p>}
      {latest && <div className="mt-4 rounded-xl border border-border bg-background p-3.5" data-testid={`question-response-${message.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-primary">{latest.senderName}{latest.senderId === message.senderId ? '' : ' · Learner response'}</p><time className="text-[11px] text-muted-foreground" dateTime={latest.createdAt}>{when(latest.createdAt)}</time></div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{latest.body}</p>
        {changedExisting && <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[hsl(var(--ledger))]"><CheckCircle2 className="h-3.5 w-3.5" />Updated response</p>}
      </div>}
      {savedNotice && <p className="mt-3 text-xs font-semibold text-[hsl(var(--ledger))]" role="status" data-testid={`status-answer-saved-${message.id}`}>{savedNotice}</p>}
      {error && <p className="mt-3 text-xs text-destructive" role="alert" data-testid={`status-answer-error-${message.id}`}>{error}</p>}
    </div>
  </article>;
}

function MessageCard({ message, own, onPreview }: { message: MentorshipMessage; own: boolean; onPreview: (url: string, name: string) => void }) {
  return <article className={`max-w-[min(44rem,92%)] rounded-2xl border px-4 py-3 shadow-sm ${own ? 'ml-auto border-primary/15 bg-[hsl(var(--ledger-soft))]' : 'border-border bg-card'}`} data-testid={`message-${message.id}`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="text-xs font-bold text-primary">{message.senderName}{own ? ' · You' : ''}</span><time className="text-[11px] text-muted-foreground" dateTime={message.createdAt}>{when(message.createdAt)}</time>
    </div>
    {message.kind === 'meeting' ? <div className="rounded-xl border border-[hsl(var(--ledger))]/25 bg-background/75 p-3.5" data-testid={`meeting-card-${message.id}`}>
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]"><Video className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-display font-bold text-primary">Google Meet session</p>{message.meetingStartsAt && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{when(message.meetingStartsAt)}</p>}{message.meetingAgenda && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{message.meetingAgenda}</p>}</div></div>
      {message.meetingUrl && <a href={message.meetingUrl} target="_blank" rel="noreferrer" data-testid={`link-join-meeting-${message.id}`} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[hsl(var(--ledger))] px-4 text-sm font-bold text-white hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Join session <ArrowUpRight className="h-4 w-4" /></a>}
    </div> : message.body && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{message.body}</p>}
    {message.attachments.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{message.attachments.map((a) => <AttachmentAction key={a.id} attachment={a} onPreview={onPreview} />)}</div>}
  </article>;
}

export default function MentorshipThreadPage() {
  const { enrollmentId = '' } = useParams<{ enrollmentId: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = useMemo(() => getListMentorshipMessagesQueryKey(enrollmentId), [enrollmentId]);
  const threadKey = getListMentorshipThreadsQueryKey();
  const q = useListMentorshipMessages(enrollmentId, { query: { queryKey: key, enabled: !!enrollmentId } });
  const threadsQuery = useListMentorshipThreads({ query: { queryKey: threadKey, enabled: !!user } });
  const send = useSendMentorshipMessage();
  const uploadRequest = useRequestMentorshipUpload();
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [pendingTokens, setPendingTokens] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadFailed, setUploadFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState('');
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messageForm = useForm<z.infer<typeof messageSchema>>({ resolver: zodResolver(messageSchema), defaultValues: { body: '' } });
  const questionForm = useForm<z.infer<typeof guideQuestionSchema>>({
    resolver: zodResolver(guideQuestionSchema),
    defaultValues: { prompt: '', type: 'open_response', optionsText: '' },
  });
  const meetingForm = useForm<z.infer<typeof meetingSchema>>({ resolver: zodResolver(meetingSchema), defaultValues: { url: '', startsAt: '', agenda: '' } });
  const data = q.data;
  const thread = data?.thread;
  const canSend = !!thread?.canSend && !!thread.guideId && !!user;

  useTitle(thread ? `${thread.courseTitle} conversation` : 'Mentorship conversation');

  useEffect(() => {
    if (!enrollmentId) return;
    const source = new EventSource(`/api/mentorship/threads/${encodeURIComponent(enrollmentId)}/events`, { withCredentials: true });
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: threadKey });
    };
    source.addEventListener('message', refresh);
    source.onopen = refresh;
    return () => {
      source.removeEventListener('message', refresh);
      source.close();
    };
  }, [enrollmentId, key, qc, threadKey]);

  useEffect(() => {
    if (q.data) void qc.invalidateQueries({ queryKey: threadKey });
  }, [q.data, qc, threadKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [data?.messages.length]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  async function refreshAfterSend() {
    await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: threadKey })]);
  }
  async function submitText(values: z.infer<typeof messageSchema>) {
    const clean = values.body.trim();
    if (!clean && pendingTokens.length === 0) {
      messageForm.setError('body', { message: 'Write a message or attach a file before sending.' });
      return;
    }
    if (!canSend || send.isPending) return;
    setSendError('');
    try {
      await send.mutateAsync({ enrollmentId, data: { kind: 'text', ...(clean ? { body: clean } : {}), ...(pendingTokens.length ? { uploadTokens: pendingTokens } : {}) } });
      messageForm.reset({ body: '' }); setPendingTokens([]); setUploadStatus(''); setUploadFailed(false); await refreshAfterSend();
    } catch (error) { setSendError(errMsg(error)); }
  }
  async function submitMeeting(values: z.infer<typeof meetingSchema>) {
    if (!canSend) return;
    try {
      await send.mutateAsync({ enrollmentId, data: { kind: 'meeting', meetingUrl: values.url.trim(), ...(values.startsAt ? { meetingStartsAt: new Date(values.startsAt).toISOString() } : {}), ...(values.agenda.trim() ? { meetingAgenda: values.agenda.trim() } : {}) } });
      meetingForm.reset({ url: '', startsAt: '', agenda: '' }); setMeetingOpen(false); setSendError(''); await refreshAfterSend();
    } catch (error) { setSendError(errMsg(error)); }
  }
  async function submitQuestion(values: z.infer<typeof guideQuestionSchema>) {
    const options = values.optionsText.split(/\r?\n/).map((option) => option.trim()).filter(Boolean);
    setQuestionError('');
    setSendError('');
    try {
      await send.mutateAsync({
        enrollmentId,
        data: {
          kind: 'question',
          body: values.prompt,
          question: { type: values.type, ...(values.type === 'multiple_choice' ? { options } : {}) },
        },
      });
      questionForm.reset({ prompt: '', type: 'open_response', optionsText: '' });
      setQuestionOpen(false);
      await refreshAfterSend();
    } catch (error) { setQuestionError(errMsg(error)); }
  }
  async function onFiles(files: FileList | null) {
    if (!files || !canSend) return;
    const selected = Array.from(files);
    if (selected.length + pendingTokens.length > MAX_FILES) { setUploadStatus(`You can add up to ${MAX_FILES} files to one message.`); return; }
    setUploading(true); setUploadStatus(''); setUploadFailed(false);
    let uploadedCount = 0;
    try {
      for (const file of selected) {
        if (!ACCEPTED.includes(file.type) || file.size > MAX_FILE_SIZE || file.size < 1) throw new Error(`${file.name} is not supported. Use an image or document under 10 MB.`);
        setUploadStatus(`Uploading ${file.name}…`);
        const signed = await uploadRequest.mutateAsync({ enrollmentId, data: { fileName: file.name, contentType: file.type, size: file.size } });
        const result = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!result.ok) throw new Error(`Upload failed for ${file.name}. Please try again.`);
        setPendingTokens((current) => [...current, signed.uploadToken]);
        messageForm.clearErrors('body');
        uploadedCount += 1;
        setUploadStatus(`${uploadedCount} ${uploadedCount === 1 ? 'file is' : 'files are'} ready. Uploading remaining files…`);
      }
      setUploadStatus(`${uploadedCount} ${uploadedCount === 1 ? 'file is' : 'files are'} ready to send.`);
      await refreshAfterSend();
    } catch (error) {
      const detail = errMsg(error);
      setUploadFailed(true);
      setUploadStatus(uploadedCount ? `${uploadedCount} file${uploadedCount === 1 ? '' : 's'} uploaded and ready. ${detail}` : detail);
    }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  function openPreview(url: string, name: string) {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview({ url, name });
  }

  if (q.isLoading) return <main className="mx-auto max-w-5xl p-4 sm:p-8"><PageSkeleton /></main>;
  if (q.isError || !data || !thread) return <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-8"><Link href="/mentorship" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-muted-foreground"><ArrowLeft className="h-4 w-4" />All conversations</Link><ErrorPanel title="We could not open this conversation" message={errMsg(q.error)} onRetry={() => q.refetch()} /></main>;
  const messages = data.messages;
  const responsesByQuestion = new Map<string, MentorshipMessage[]>();
  messages.filter((message) => message.kind === 'question_response' && message.replyToMessageId).forEach((response) => {
    const group = responsesByQuestion.get(response.replyToMessageId!) ?? [];
    group.push(response);
    group.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    responsesByQuestion.set(response.replyToMessageId!, group);
  });
  return <main className="mx-auto max-w-[1440px] min-w-0 space-y-4 p-3 pb-24 sm:space-y-5 sm:p-6 lg:p-8">
    <Link href="/mentorship" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary lg:hidden" data-testid="link-back-mentorship"><ArrowLeft className="h-4 w-4" />Back to conversations</Link>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] lg:items-start">
      <aside className="hidden min-w-0 lg:block"><ThreadList threads={threadsQuery.data} selectedId={enrollmentId} loading={threadsQuery.isLoading} error={threadsQuery.isError ? errMsg(threadsQuery.error) : undefined} onRetry={() => void threadsQuery.refetch()} isGuide={!!user?.isGuide} /></aside>
      <div className="min-w-0 space-y-4">
    <header className="ink-card overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-accent">Private project conversation · {thread.hours} hours</p><h1 className="mt-1 font-display text-2xl font-black text-primary sm:text-3xl" data-testid="text-thread-course-title">{thread.courseTitle}</h1><p className="mt-1 text-sm text-muted-foreground">{user?.isGuide ? `Learner · ${thread.studentName}` : thread.guideName ? `Your guide · ${thread.guideName}` : 'Your guide has not been assigned yet'}</p></div>
        <div className="flex items-center gap-2 self-start rounded-xl bg-[hsl(var(--ledger-soft))] px-3 py-2 text-xs font-semibold text-[hsl(var(--ledger))] sm:self-center"><ShieldCheck className="h-4 w-4" />Private to this pathway</div>
      </div>
      {!thread.guideId && <div role="status" data-testid="status-guide-pending" className="flex gap-3 border-t border-border bg-secondary/35 px-4 py-3 text-sm sm:px-5"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><p><strong>Guide assignment pending.</strong> The programme team will match a guide. You can read this space, but cannot send messages yet.</p></div>}
    </header>
    <section className="overflow-hidden rounded-[1.25rem] border border-border bg-[hsl(var(--background))]" aria-label={`Conversation about ${thread.courseTitle}`}>
      <div className="flex items-center justify-between border-b border-border bg-card/70 px-4 py-3"><p className="text-xs font-semibold text-muted-foreground">{messages.length ? `${messages.length} messages` : 'A good place to start'}</p><p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><LockKeyhole className="h-3 w-3" />Only you and your guide</p></div>
      <div className="flex min-h-[24rem] max-h-[62dvh] flex-col gap-3 overflow-y-auto overscroll-contain p-3 sm:min-h-[30rem] sm:p-5" data-testid="list-mentorship-messages">
        {messages.length === 0 ? <div className="m-auto max-w-sm py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--ledger-soft))] text-[hsl(var(--ledger))]"><FileText className="h-5 w-5" /></span><p className="mt-4 font-display text-lg font-bold text-primary">A clear start</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Use this space for project questions, progress notes and files that help your guide understand the work.</p></div>
          : messages.filter((message) => message.kind !== 'question_response').map((message) => message.kind === 'question' && message.question
            ? <QuestionCard key={message.id} message={message} responses={responsesByQuestion.get(message.id) ?? []} isGuide={!!user?.isGuide} canAnswer={user?.id === thread.studentId && thread.canSend} enrollmentId={enrollmentId} />
            : <MessageCard key={message.id} message={message} own={message.senderId === user?.id} onPreview={openPreview} />)}
        <div ref={endRef} />
      </div>
      {sendError && <p className="mx-3 mb-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert" data-testid="status-send-error">{sendError}</p>}
      {canSend && <div className="border-t border-border bg-card p-3 sm:p-4">
        {meetingOpen && user?.isGuide && <Form {...meetingForm}><form onSubmit={meetingForm.handleSubmit(submitMeeting)} className="mb-3 rounded-xl border border-[hsl(var(--ledger))]/25 bg-[hsl(var(--ledger-soft))]/45 p-3 sm:p-4" data-testid="form-meeting">
          <div className="mb-3 flex items-start justify-between gap-2"><div><p className="font-bold text-primary">Share a Google Meet session</p><p className="text-xs text-muted-foreground">Create the link in Google Meet, then paste it here.</p></div><button type="button" onClick={() => setMeetingOpen(false)} aria-label="Close meeting form" data-testid="button-close-meeting" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-card"><X className="h-4 w-4" /></button></div>
          <FormField control={meetingForm.control} name="url" render={({ field }) => <FormItem className="mb-2"><FormLabel className="text-xs font-semibold">Google Meet link</FormLabel><FormControl><input {...field} required type="url" placeholder="https://meet.google.com/…" className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" data-testid="input-meeting-url" /></FormControl><FormMessage /></FormItem>} />
          <div className="grid gap-2 sm:grid-cols-2">
            <FormField control={meetingForm.control} name="startsAt" render={({ field }) => <FormItem><FormLabel className="text-xs font-semibold">Date and time (optional)</FormLabel><FormControl><input {...field} type="datetime-local" className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" data-testid="input-meeting-time" /></FormControl><FormMessage /></FormItem>} />
            <FormField control={meetingForm.control} name="agenda" render={({ field }) => <FormItem><FormLabel className="text-xs font-semibold">Agenda (optional)</FormLabel><FormControl><textarea {...field} maxLength={1000} rows={2} placeholder="What will you discuss?" className="mt-1 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm" data-testid="input-meeting-agenda" /></FormControl><FormMessage /></FormItem>} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">This posts the link you provide. Adhyayaan does not create a meeting.</p>
          <Button type="submit" disabled={send.isPending} className="mt-3 min-h-10" data-testid="button-post-meeting">{send.isPending ? 'Posting…' : 'Post session'}</Button>
        </form></Form>}
        {questionOpen && user?.isGuide && <Form {...questionForm}><form onSubmit={questionForm.handleSubmit(submitQuestion)} className="mb-3 rounded-xl border border-[hsl(var(--ledger))]/25 bg-[hsl(var(--ledger-soft))]/45 p-3 sm:p-4" data-testid="form-create-question">
          <div className="mb-3 flex items-start justify-between gap-2"><div><p className="font-bold text-primary">Ask a learning question</p><p className="text-xs leading-relaxed text-muted-foreground">Invite the learner to explain, apply or reason through an idea.</p></div><button type="button" onClick={() => { setQuestionOpen(false); setQuestionError(''); }} aria-label="Close question form" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-card" data-testid="button-close-question"><X className="h-4 w-4" /></button></div>
          <FormField control={questionForm.control} name="prompt" render={({ field }) => <FormItem>
            <FormLabel className="text-xs font-semibold">Question prompt</FormLabel>
            <FormControl><textarea {...field} maxLength={1200} rows={3} className="mt-1 min-h-20 w-full resize-y rounded-lg border border-input bg-card px-3 py-2.5 text-sm leading-relaxed" placeholder="How would you apply this idea to your project?" data-testid="input-question-prompt" /></FormControl>
            <FormDescription>Use a short prompt. Maximum 1,200 characters.</FormDescription>
            <FormMessage />
          </FormItem>} />
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-start">
            <FormField control={questionForm.control} name="type" render={({ field }) => <FormItem>
              <FormLabel className="text-xs font-semibold">Response format</FormLabel>
              <FormControl><select {...field} className="block h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" data-testid="select-question-type"><option value="open_response">Written response</option><option value="multiple_choice">Choose an option</option></select></FormControl>
              <FormMessage />
            </FormItem>} />
            {questionForm.watch('type') === 'multiple_choice' && <FormField control={questionForm.control} name="optionsText" render={({ field }) => <FormItem>
              <FormLabel className="text-xs font-semibold">Options <span className="font-normal text-muted-foreground">(2–6, one per line)</span></FormLabel>
              <FormControl><textarea {...field} rows={3} className="block w-full resize-y rounded-lg border border-input bg-card px-3 py-2.5 text-sm" placeholder={'Explain the evidence\nTest a different approach'} data-testid="input-question-options" /></FormControl>
              <FormDescription>Keep each choice within 200 characters. There is no correct answer or score.</FormDescription>
              <FormMessage />
            </FormItem>} />}
          </div>
          {questionError && <p className="mt-2 text-xs text-destructive" role="alert" data-testid="status-question-error">{questionError}</p>}
          <Button type="submit" disabled={send.isPending} className="mt-3 min-h-11" data-testid="button-post-question">{send.isPending ? 'Posting…' : 'Post question'}</Button>
        </form></Form>}
        <Form {...messageForm}><form onSubmit={messageForm.handleSubmit(submitText)} className="flex items-end gap-2" data-testid="form-send-message">
          <div className="min-w-0 flex-1">
            <FormField control={messageForm.control} name="body" render={({ field }) => <FormItem className="space-y-1"><FormLabel className="sr-only">Write a message</FormLabel><FormControl><textarea {...field} maxLength={5000} rows={2} placeholder="Write a project question or update…" disabled={!canSend || uploading} className="max-h-36 min-h-12 w-full resize-y rounded-xl border border-input bg-background px-3 py-3 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" data-testid="input-message-body" /></FormControl><FormMessage /></FormItem>} />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || pendingTokens.length >= MAX_FILES} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 hover:bg-secondary disabled:opacity-50" data-testid="button-attach-file"><Paperclip className="h-3.5 w-3.5" />Attach file</button>
              {user?.isGuide && <button type="button" onClick={() => { setMeetingOpen((v) => !v); setQuestionOpen(false); }} disabled={send.isPending} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 hover:bg-secondary disabled:opacity-50" data-testid="button-open-meeting"><Video className="h-3.5 w-3.5" />Share Meet session</button>}
              {user?.isGuide && <button type="button" onClick={() => { setQuestionOpen((v) => !v); setMeetingOpen(false); }} disabled={send.isPending} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 hover:bg-secondary disabled:opacity-50" data-testid="button-open-question"><MessageCircle className="h-3.5 w-3.5" />Ask a question</button>}
              <span className={`ml-auto ${uploadFailed ? 'text-destructive' : ''}`} role={uploadFailed ? 'alert' : uploading ? 'status' : undefined} data-testid={uploadFailed ? 'status-upload-error' : undefined}>{uploadStatus}</span>
            </div>
            <input ref={fileInput} type="file" multiple accept={ACCEPTED.join(',')} onChange={(e) => void onFiles(e.target.files)} className="sr-only" aria-label="Choose images or documents" data-testid="input-attachment-file" />
            {pendingTokens.length > 0 && <p className="mt-1 flex items-center gap-1.5 text-xs text-[hsl(var(--ledger))]" role="status"><Check className="h-3.5 w-3.5" />{pendingTokens.length} file{pendingTokens.length === 1 ? '' : 's'} ready to send</p>}
          </div>
          <Button type="submit" aria-label="Send message" disabled={send.isPending || uploading || (!messageForm.watch('body').trim() && pendingTokens.length === 0)} className="mb-1 h-11 w-11 shrink-0 px-0" data-testid="button-send-message"><Send className="h-4 w-4" /><span className="sr-only">Send message</span></Button>
        </form></Form>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">Images and common documents only. Maximum 10 MB per file and {MAX_FILES} files per message.</p>
      </div>}
    </section>
      </div>
    </div>
    {preview && <div className="fixed inset-0 z-[70] grid place-items-center bg-primary/85 p-4" role="dialog" aria-modal="true" aria-label={`Preview ${preview.name}`} onClick={() => setPreview(null)} data-testid="dialog-image-preview"><div className="relative max-h-[88dvh] max-w-full" onClick={(e) => e.stopPropagation()}><button type="button" onClick={() => setPreview(null)} aria-label="Close image preview" data-testid="button-close-image-preview" className="absolute -right-3 -top-3 grid h-10 w-10 place-items-center rounded-full bg-card text-primary shadow-lg"><X className="h-5 w-5" /></button><img src={preview.url} alt={preview.name} className="max-h-[82dvh] max-w-full rounded-xl object-contain" /><p className="mt-2 text-center text-sm text-primary-foreground">{preview.name}</p></div></div>}
  </main>;
}
