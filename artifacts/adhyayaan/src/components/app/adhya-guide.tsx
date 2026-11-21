import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { useAskAi, useGetCourse, getGetCourseQueryKey, useGetStudyBook, getGetStudyBookQueryKey, useListEnrollments, getListEnrollmentsQueryKey } from '@workspace/api-client-react';
import { ArrowUp, MessageCircle, Minimize2, RotateCcw, X } from 'lucide-react';
import { Md } from '@/components/app/bits';

type Level = 'understand' | 'analyze';

function routeCourseId(path: string) {
  const study = path.match(/^\/study\/([^/]+)/);
  const course = path.match(/^\/courses\/([^/]+)/);
  const practice = new URLSearchParams(path.split('?')[1] ?? '').get('course');
  return study?.[1] ?? course?.[1] ?? practice ?? '';
}

function Avatar({ small = false }: { small?: boolean }) {
  return (
    <span className={`adhya-avatar ${small ? 'h-10 w-10' : 'h-[4.4rem] w-[4.4rem]'}`} aria-hidden="true">
      <img src={`${import.meta.env.BASE_URL}api/study-media/mentor-avatar.png`} alt="" />
    </span>
  );
}

/** A persistent mentor who only contacts the AI after the learner explicitly starts a check-in. */
export function AdhyaGuide() {
  const [location] = useLocation();
  const courseId = routeCourseId(location);
  const studyRoute = location.startsWith('/study/');
  const courseRoute = location.startsWith('/courses/');
  const courseQuery = useGetCourse(courseId, { query: { enabled: !!courseId && courseRoute, queryKey: getGetCourseQueryKey(courseId) } });
  const bookQuery = useGetStudyBook(courseId, { query: { enabled: !!courseId && studyRoute, queryKey: getGetStudyBookQueryKey(courseId) } });
  const enrollments = useListEnrollments({ query: { enabled: true, queryKey: getListEnrollmentsQueryKey() } });
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [level, setLevel] = useState<Level | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const ask = useAskAi();
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inviteRef = useRef<HTMLButtonElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const askMutation = useRef(ask.mutateAsync);
  askMutation.current = ask.mutateAsync;
  const course = courseQuery.data ?? enrollments.data?.find((e) => e.course.id === courseId)?.course;
  const lessonMatch = location.match(/^\/study\/[^/]+\/([^/?]+)/);
  const contextual = useMemo(() => {
    if (bookQuery.data) {
      const mod = bookQuery.data.modules.find((m) => m.lessons.some((lesson) => lesson.id === lessonMatch?.[1]));
      const lesson = mod?.lessons.find((item) => item.id === lessonMatch?.[1]);
      return [
        `Study book: ${bookQuery.data.title}`,
        mod ? `Module: ${mod.title}` : '',
        lesson ? `Current lesson: ${lesson.title}` : '',
        mod ? `Learning objectives: ${mod.objectives.join('; ')}` : '',
        lesson ? lesson.sections.map((s) => `${s.heading}: ${s.body}`).join('\n') : '',
        lesson ? `Practice activity: ${lesson.activity}` : '',
        mod ? `Lesson transcript: ${mod.transcript}` : '',
      ].filter(Boolean).join('\n');
    }
    if (course) return `Internship: ${course.title} (${course.category})\n${course.description}\nFinal deliverable: ${course.deliverable}`;
    const enrollment = enrollments.data?.find((e) => e.course.id === courseId);
    if (enrollment) return `Internship pathway: ${enrollment.course.title}, ${enrollment.hours} hours.\nModules marked complete: ${enrollment.completedModules.length}.\nLogged hours: ${enrollment.loggedHours}/${enrollment.hours}.\nDeliverable: ${enrollment.course.deliverable}`;
    if (location.startsWith('/my-learning') && enrollments.data?.length) {
      return enrollments.data.map((item) => `Internship pathway: ${item.course.title}, ${item.hours} hours.\nModules marked complete: ${item.completedModules.length}.\nLogged hours: ${item.loggedHours}/${item.hours}.\nDeliverable: ${item.course.deliverable}`).join('\n\n');
    }
    return 'General internship learning and project reasoning.';
  }, [bookQuery.data, course, courseId, enrollments.data, lessonMatch?.[1]]);
  const contextLabel = bookQuery.data?.modules.find((m) => m.lessons.some((l) => l.id === lessonMatch?.[1]))?.title
    ?? course?.title ?? (location.startsWith('/my-learning') ? 'your learning pathway' : 'your internship learning');

  useEffect(() => {
    setLevel(null);
    setQuestion('');
    setAnswer('');
    setFeedback('');
    setError('');
  }, [location]);
  useEffect(() => {
    if (question && !feedback) answerRef.current?.focus();
  }, [feedback, question]);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      headingRef.current?.focus();
    } else if (wasOpen.current) {
      (minimized ? launcherRef : inviteRef).current?.focus();
    }
  }, [minimized, open]);

  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setMinimized(true);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [open]);

  const run = async (message: string) => {
    setError('');
    try {
      const result = await askMutation.current({ data: {
        tool: 'tutor',
        language,
        ...(courseId ? { courseId } : {}),
        message: [
          'You are Adhya, a warm, concise formative mentor for final-year students learning through real internship project work in West Bengal.',
          `Reply in ${language === 'bn' ? 'Bangla (Bengali script), keeping technical terms in English where natural' : 'English'}.`,
          'Stay grounded in the supplied course or lesson context. Ask one focused, accessible question. Do not invent progress or claim an assessment was saved. Use Socratic prompts; never shame the learner.',
          `Current screen: ${location}`,
          `Context:\n${contextual.slice(0, 6500)}`,
          message,
        ].join('\n\n'),
      } });
      return result.content;
    } catch {
      setError('I could not reach the mentor service just now. You can try again.');
      return '';
    }
  };

  const startCheckIn = async (selected: Level) => {
    setLevel(selected);
    setQuestion('');
    setAnswer('');
    setFeedback('');
    const prompt = selected === 'understand'
      ? 'Start a gentle check-in: ask one easy understanding question about the most relevant current lesson or internship context. Do not include the answer.'
      : 'Start a more challenging analysis check-in: ask one realistic scenario question that requires reasoning about trade-offs in this context. Do not include the answer.';
    const result = await run(prompt);
    if (result) setQuestion(result);
  };

  const submitAnswer = async (event: FormEvent) => {
    event.preventDefault();
    const text = answer.trim();
    if (!text || ask.isPending) return;
    const result = await run([
      `The learner answered: ${text}`,
      'Give concise formative feedback grounded in this context. First notice one useful part of their reasoning, then ask one Socratic follow-up or offer a small hint. If their answer is off track, guide them with a question instead of simply giving the full solution.',
    ].join('\n'));
    if (result) setFeedback(result);
  };

  if (minimized) {
    return (
      <button ref={launcherRef} type="button" onClick={() => { setMinimized(false); setOpen(true); }} className="adhya-launcher group" aria-label="Open Adhya, your learning mentor" data-testid="button-open-adhya">
        <Avatar small />
        <span className="hidden sm:block">Ask Adhya</span>
        <span className="sr-only">Open mentor check-in</span>
      </button>
    );
  }

  return (
    <aside className={`adhya-dock ${open ? 'adhya-dock-open' : ''}`} aria-label="Adhya learning mentor">
      {open ? (
        <section className="adhya-panel" role="dialog" aria-modal="false" aria-labelledby="adhya-title" data-testid="panel-adhya">
          <header className="flex items-start gap-3 border-b border-primary/10 bg-primary px-4 py-3 text-primary-foreground">
            <Avatar small />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[.17em] text-[hsl(var(--turmeric))]">Your learning companion</p>
              <h2 id="adhya-title" ref={headingRef} tabIndex={-1} className="font-display text-xl font-semibold text-primary-foreground focus:outline-none">Adhya</h2>
              <p className="truncate text-xs text-primary-foreground/75">Here with you · {contextLabel}</p>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => { setOpen(false); setMinimized(true); }} aria-label="Minimize Adhya" className="rounded-lg p-2 text-primary-foreground/85 hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground" data-testid="button-minimize-adhya"><Minimize2 className="h-4 w-4" /></button>
              <button type="button" onClick={() => { setOpen(false); setMinimized(false); }} aria-label="Close Adhya" className="rounded-lg p-2 text-primary-foreground/85 hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground" data-testid="button-close-adhya"><X className="h-4 w-4" /></button>
            </div>
          </header>
          <div className="flex items-center justify-between px-4 pt-3">
            <span className="text-xs text-muted-foreground">Choose your check-in language</span>
            <div className="flex rounded-full bg-secondary p-0.5" role="group" aria-label="Check-in language">
              {(['en', 'bn'] as const).map((lang) => <button key={lang} type="button" onClick={() => setLanguage(lang)} aria-pressed={language === lang} className={`rounded-full px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${language === lang ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{lang === 'en' ? 'English' : 'বাংলা'}</button>)}
            </div>
          </div>
          <div className="max-h-[min(60dvh,30rem)] space-y-3 overflow-y-auto px-4 py-3">
            {!level && <div className="rounded-2xl rounded-tl-sm bg-secondary/70 p-3 text-sm leading-relaxed text-foreground">Hi, I’m Adhya. Want to pause and test an idea together? I’ll ask first—nothing starts until you choose.</div>}
            {question && <div className="rounded-2xl rounded-tl-sm bg-secondary/70 p-3 text-sm leading-relaxed" aria-live="polite"><p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-accent">{level === 'understand' ? 'A gentle check' : 'Think it through'}</p><Md text={question} /></div>}
            {feedback && <div className="rounded-2xl rounded-tl-sm border border-[hsl(var(--ledger))]/25 bg-[hsl(var(--ledger-soft))] p-3 text-sm leading-relaxed" aria-live="polite"><p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--ledger))]">Let’s reason it out</p><Md text={feedback} /></div>}
            {ask.isPending && <div className="space-y-2 rounded-2xl bg-secondary/60 p-3" aria-live="polite" aria-label="Adhya is thinking"><div className="h-3 w-2/3 animate-pulse rounded bg-muted" /><div className="h-3 w-full animate-pulse rounded bg-muted" /><div className="h-3 w-4/5 animate-pulse rounded bg-muted" /></div>}
            {error && <div role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}<button type="button" onClick={() => level ? startCheckIn(level) : undefined} className="ml-2 inline-flex items-center gap-1 font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><RotateCcw className="h-3 w-3" />Try again</button></div>}
            {!level && <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => startCheckIn('understand')} disabled={ask.isPending} className="rounded-xl border border-[hsl(var(--ledger))]/30 bg-card p-3 text-left text-sm font-semibold text-primary hover:border-[hsl(var(--ledger))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" data-testid="button-adhya-easy"><span className="block font-mono text-[9px] uppercase tracking-widest text-[hsl(var(--ledger))]">Start a check-in</span>Easy question</button>
              <button type="button" onClick={() => startCheckIn('analyze')} disabled={ask.isPending} className="rounded-xl border border-accent/35 bg-card p-3 text-left text-sm font-semibold text-primary hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" data-testid="button-adhya-challenge"><span className="block font-mono text-[9px] uppercase tracking-widest text-accent">Start a check-in</span>Trickier question</button>
            </div>}
            {question && !feedback && <form onSubmit={submitAnswer} className="space-y-2">
              <label htmlFor="adhya-answer" className="text-xs font-medium text-primary">Your thinking</label>
              <textarea ref={answerRef} id="adhya-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={2500} rows={3} placeholder="Tell me how you reasoned it out…" className="w-full resize-y rounded-xl border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="input-adhya-answer" />
              <button type="submit" disabled={!answer.trim() || ask.isPending} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" data-testid="button-adhya-submit">Share my thinking <ArrowUp className="h-4 w-4" /></button>
            </form>}
            {feedback && <button type="button" onClick={() => { setLevel(null); setQuestion(''); setAnswer(''); setFeedback(''); setError(''); }} className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="button-adhya-new-checkin">Try another check-in</button>}
            <p className="text-[10px] leading-relaxed text-muted-foreground">Your check-in is formative. It does not mark modules complete or change your study record.</p>
          </div>
        </section>
      ) : (
        <button ref={inviteRef} type="button" onClick={() => setOpen(true)} className="adhya-invite group" aria-haspopup="dialog" aria-expanded={open} data-testid="button-adhya-invite">
          <span className="relative"><Avatar /><span className="adhya-online-dot" /></span>
          <span className="min-w-0 flex-1 text-left"><span className="block font-display text-base font-semibold text-primary">Adhya is here</span><span className="block text-xs text-muted-foreground">A question, when you’re ready</span></span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform group-hover:translate-x-0.5"><MessageCircle className="h-4 w-4" /></span>
          <span className="sr-only">Open Adhya check-in options</span>
        </button>
      )}
    </aside>
  );
}
