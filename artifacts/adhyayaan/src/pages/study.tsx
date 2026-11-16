import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, BookOpen, CheckCircle2, Circle, Clock, ExternalLink, Info, ListTree, Loader2, ShieldAlert } from 'lucide-react';
import { useGetStudyBook, getGetStudyBookQueryKey, useSaveStudyProgress, type StudyBook, type StudyLesson, type StudyModule, type StudyProgress } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ErrorPanel, Meter } from '@/components/app/bits';
import { MotionSteps } from '@/components/study/motion-steps';
import { ModuleVideo } from '@/components/study/module-video';
import { TeachPanel } from '@/components/study/teach-panel';
import { useToast } from '@/hooks/use-toast';
import { authHref, errMsg, useAuth, useTitle } from '@/lib/app';
import { useHere } from '@/lib/use-here';

type Flat = { lesson: StudyLesson; module: StudyModule; mi: number; li: number; idx: number };

function flatten(book: StudyBook): Flat[] {
  const out: Flat[] = [];
  book.modules.forEach((module, mi) => module.lessons.forEach((lesson, li) => out.push({ lesson, module, mi, li, idx: out.length })));
  return out;
}

export default function StudyPage() {
  const { courseId = '', lessonId } = useParams<{ courseId: string; lessonId?: string }>();
  const { user } = useAuth();
  const q = useGetStudyBook(courseId, { query: { enabled: !!courseId, queryKey: getGetStudyBookQueryKey(courseId), retry: (n, e) => (e as { status?: number })?.status !== 404 && n < 1 } });
  useTitle(q.data?.title ?? 'Study book');

  if (q.isLoading) return <ReaderSkeleton />;
  if (q.error) {
    if ((q.error as { status?: number }).status === 404) return <NotAuthored courseId={courseId} />;
    return <ErrorPanel error={q.error} onRetry={() => q.refetch()} />;
  }
  if (!q.data) return <NotAuthored courseId={courseId} />;
  return lessonId ? <Reader book={q.data} lessonId={lessonId} userId={user?.id ?? null} /> : <Cover book={q.data} signedIn={!!user} />;
}

function useProgressMap(book: StudyBook) {
  return useMemo(() => new Map<string, StudyProgress>(book.progress.map((p) => [p.lessonId, p])), [book.progress]);
}

/* ------------------------------------------------------------------ cover */
function Cover({ book, signedIn }: { book: StudyBook; signedIn: boolean }) {
  const flat = useMemo(() => flatten(book), [book]);
  const pm = useProgressMap(book);
  const here = useHere();
  const latest = [...book.progress].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const resume = latest && flat.find((f) => f.lesson.id === latest.lessonId);
  const read = book.progress.filter((p) => p.read).length;
  const start = resume ?? flat[0];
  const core = book.modules.filter((m) => !m.extended), ext = book.modules.filter((m) => m.extended);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/courses/${book.courseId}`} className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary" data-testid="link-back-course"><ArrowLeft className="h-4 w-4" /> Internship overview</Link>
      <header className="rise relative overflow-hidden rounded-[1.6rem] bg-primary px-7 py-10 text-primary-foreground md:px-12 md:py-14">
        <div className="alpona-dots absolute inset-0 opacity-30" aria-hidden />
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full border-[18px] border-[hsl(var(--ledger))]/60" aria-hidden />
        <div className="absolute -right-4 bottom-[-5rem] h-48 w-48 rounded-full bg-accent/80" aria-hidden />
        <div className="relative max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--turmeric))]">অধ্যয়ন · Study book {book.courseId}</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] md:text-6xl" data-testid="text-book-title">{book.title}</h1>
          <p className="mt-5 text-base leading-relaxed text-primary-foreground/80 md:text-lg">{book.introduction}</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {start && <Button asChild size="lg" className="bg-accent hover:bg-accent/90" data-testid="button-start-reading"><Link href={`/study/${book.courseId}/${start.lesson.id}`}>{resume ? 'Resume reading' : 'Open chapter one'} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>}
            <span className="font-mono text-xs text-primary-foreground/70">{book.modules.length} modules · {flat.length} lessons · {flat.reduce((s, f) => s + f.lesson.minutes, 0)} min reading</span>
          </div>
          {resume && <p className="mt-3 text-sm text-primary-foreground/70" data-testid="text-resume">Last saved: {resume.lesson.title}</p>}
        </div>
      </header>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_300px]">
        <EditorialNote note={book.editorialNote} />
        <div className="ink-card p-5" data-testid="card-book-progress">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--ledger))]">Reading record</p>
          {signedIn ? (
            <>
              <p className="mt-2 font-display text-3xl font-semibold text-primary">{read}<span className="text-lg text-muted-foreground">/{flat.length}</span></p>
              <p className="mb-2 text-xs text-muted-foreground">lessons marked read</p>
              <Meter value={flat.length ? (read / flat.length) * 100 : 0} />
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground"><Link href={authHref('login', here)} className="font-semibold text-accent hover:underline" data-testid="link-cover-login">Sign in</Link> to keep read marks and bookmarks. You can read everything without an account.</p>
          )}
        </div>
      </div>
      <SeparationNote />

      {[{ label: 'Core track', sub: 'Modules for the 60-hour pathway', list: core }, { label: 'Extended track', sub: 'Added for the 120-hour pathway', list: ext }].filter((g) => g.list.length).map((g) => (
        <section key={g.label} className="mt-10">
          <div className="mb-4 flex items-baseline gap-3"><h2 className="font-display text-2xl font-semibold text-primary">{g.label}</h2><span className="text-sm text-muted-foreground">{g.sub}</span></div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {g.list.map((m) => {
              const mi = book.modules.indexOf(m);
              const done = m.lessons.filter((l) => pm.get(l.id)?.read).length;
              return (
                <li key={m.id} className="ink-card lift overflow-hidden" data-testid={`card-module-${m.id}`}>
                  <Link href={`/study/${book.courseId}/${m.lessons[0]?.id}`} className="flex gap-4 p-4" data-testid={`link-module-${m.id}`}>
                    <img src={m.imageUrl} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl border bg-muted object-cover" />
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">Chapter {String(mi + 1).padStart(2, '0')}</p>
                      <p className="font-display text-lg font-semibold leading-tight text-primary">{m.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{m.lessons.length} lessons{signedIn ? ` · ${done} read` : ''}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ reader */
function Reader({ book, lessonId, userId }: { book: StudyBook; lessonId: string; userId: string | null }) {
  const flat = useMemo(() => flatten(book), [book]);
  const pm = useProgressMap(book);
  const cur = flat.find((f) => f.lesson.id === lessonId);
  const [, nav] = useLocation();
  const here = useHere();
  const qc = useQueryClient();
  const { toast } = useToast();
  const save = useSaveStudyProgress();
  const [tocOpen, setTocOpen] = useState(false);

  const prev = cur ? flat[cur.idx - 1] : undefined;
  const next = cur ? flat[cur.idx + 1] : undefined;
  const base = `/study/${book.courseId}`;

  useEffect(() => { window.scrollTo({ top: 0 }); }, [lessonId]);
  useEffect(() => {
    if (!userId || !cur) return;
    // Touch position only: the server preserves both read and bookmark flags.
    save.mutate({ courseId: book.courseId, data: { lessonId } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetStudyBookQueryKey(book.courseId) }),
      onError: (e) => toast({ title: 'Could not save your reading position', description: errMsg(e), variant: 'destructive' }),
    });
    // Deliberately visit once per lesson/user, never on the resulting query refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, userId, book.courseId, !!cur]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[contenteditable],video') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft' && prev) nav(`${base}/${prev.lesson.id}`);
      if (e.key === 'ArrowRight' && next) nav(`${base}/${next.lesson.id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, base, nav]);

  if (!cur) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center" data-testid="status-lesson-missing">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Page not found in this book</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-primary">No lesson called "{lessonId}"</h1>
        <Button asChild className="mt-6" data-testid="button-to-contents"><Link href={base}>Open the contents</Link></Button>
      </div>
    );
  }
  const { lesson, module, mi, li } = cur;
  const p = pm.get(lesson.id);
  const pending = save.isPending ? save.variables?.data : undefined;
  const toggle = (field: 'read' | 'bookmarked') => {
    if (!userId || save.isPending) return;
    save.mutate({ courseId: book.courseId, data: { lessonId: lesson.id, [field]: !p?.[field] } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetStudyBookQueryKey(book.courseId) }),
      onError: (e) => toast({ title: field === 'read' ? 'Could not update read mark' : 'Could not update bookmark', description: errMsg(e), variant: 'destructive' }),
    });
  };
  const isLastLesson = li === module.lessons.length - 1;

  const toc = <Contents book={book} flat={flat} pm={pm} current={lesson.id} onPick={() => setTocOpen(false)} />;

  return (
    <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      <aside className="hidden lg:block">
        <div className="sticky top-8 max-h-[calc(100dvh-4rem)] overflow-y-auto pr-2">{toc}</div>
      </aside>

      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <Link href={base} className="truncate hover:text-primary" data-testid="link-book-cover">{book.title}</Link>
            <span aria-hidden>/</span><span className="truncate text-primary">Ch. {mi + 1}</span>
          </nav>
          <Sheet open={tocOpen} onOpenChange={setTocOpen}>
            <SheetTrigger asChild><Button variant="outline" size="sm" className="lg:hidden" data-testid="button-open-toc"><ListTree className="mr-1.5 h-4 w-4" />Contents</Button></SheetTrigger>
            <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto bg-background">
              <SheetHeader><SheetTitle className="font-display">Contents</SheetTitle></SheetHeader>
              <div className="mt-4">{toc}</div>
            </SheetContent>
          </Sheet>
        </div>

        <article key={lesson.id} className="page-in mx-auto max-w-[46rem]" aria-labelledby="lesson-title">
          <header className="reader-paper reader-margin overflow-hidden px-6 pb-7 pt-8 md:pl-16 md:pr-10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Chapter {String(mi + 1).padStart(2, '0')} · Lesson {li + 1} of {module.lessons.length}</span>
              {module.extended && <span className="rounded-full bg-[hsl(var(--turmeric)/.2)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(32_70%_32%)]">Extended · 120h</span>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{module.title}</p>
            <h1 id="lesson-title" className="mt-1 font-display text-3xl font-semibold leading-tight text-primary md:text-[2.6rem]" data-testid="text-lesson-title">{lesson.title}</h1>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />{lesson.minutes} min read</span>
              <span className="flex-1" />
              {userId ? (
                <>
                  <Button type="button" size="sm" variant={p?.read ? 'default' : 'outline'} onClick={() => toggle('read')} disabled={save.isPending} aria-pressed={!!p?.read}
                    className={p?.read ? 'bg-[hsl(var(--ledger))] hover:bg-[hsl(var(--ledger))]/90' : ''} data-testid="button-toggle-read">
                    {pending && 'read' in pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : p?.read ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <Circle className="mr-1.5 h-3.5 w-3.5" />}
                    {p?.read ? 'Read' : 'Mark as read'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => toggle('bookmarked')} disabled={save.isPending} aria-pressed={!!p?.bookmarked} aria-label={p?.bookmarked ? 'Remove bookmark' : 'Bookmark lesson'} data-testid="button-toggle-bookmark">
                    {pending && 'bookmarked' in pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : p?.bookmarked ? <BookmarkCheck className="h-3.5 w-3.5 text-accent" /> : <Bookmark className="h-3.5 w-3.5" />}
                  </Button>
                </>
              ) : (
                <Link href={authHref('login', here)} className="text-xs font-medium text-accent hover:underline" data-testid="link-reader-login">Sign in to save read marks and bookmarks</Link>
              )}
            </div>
          </header>

          {li === 0 && (
            <section className="mt-6 rounded-2xl border-l-4 border-[hsl(var(--ledger))] bg-[hsl(var(--ledger-soft)/.6)] px-6 py-5" aria-label="Learning objectives">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--ledger))]">By the end of this chapter you can</p>
              <ul className="mt-3 space-y-2 text-sm">{module.objectives.map((o, k) => <li key={k} className="flex gap-2.5"><span className="mt-0.5 font-mono text-xs text-[hsl(var(--ledger))]">{k + 1}.</span>{o}</li>)}</ul>
            </section>
          )}

          {li === 0 && (
            <figure className="mt-6 overflow-hidden rounded-2xl border bg-card">
              <img src={module.imageUrl} alt={module.imageAlt} className="w-full bg-muted object-cover" data-testid="img-module" />
              <figcaption className="px-5 py-3 text-xs text-muted-foreground">{module.imageAlt}</figcaption>
            </figure>
          )}

          <div className="reader-prose mt-8 space-y-10 px-1 md:px-2">
            {lesson.sections.map((s, k) => (
              <section key={k} aria-labelledby={`sec-${k}`}>
                <h2 id={`sec-${k}`} className="mb-3 flex items-baseline gap-3 font-display text-2xl font-semibold text-primary">
                  <span className="font-mono text-xs text-accent">§{k + 1}</span>{s.heading}
                </h2>
                <div className={k === 0 ? 'dropcap' : ''}>{s.body.split(/\n{2,}/).map((para, j) => <p key={j}>{para}</p>)}</div>
              </section>
            ))}
          </div>

          <aside className="mt-10 rounded-2xl bg-primary p-6 text-primary-foreground" aria-label="Worked example">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--turmeric))]">Worked example · fictional practice case</p>
            <p className="mt-3 whitespace-pre-line font-serif leading-relaxed text-primary-foreground/90">{lesson.example}</p>
          </aside>
          <aside className="mt-4 rounded-2xl border-2 border-dashed border-accent/50 p-6" aria-label="Activity">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Try it · activity</p>
            <p className="mt-3 whitespace-pre-line leading-relaxed">{lesson.activity}</p>
          </aside>

          {isLastLesson && (
            <div className="mt-12 space-y-6">
              <div className="flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Chapter review</span><span className="h-px flex-1 bg-border" /></div>
              <MotionSteps steps={module.steps} title={module.id} />
              <ModuleVideo src={module.videoUrl} transcript={module.transcript} title={module.title} userId={userId} />
              <TeachPanel courseId={book.courseId} module={module} lessonTitles={module.lessons.map((l) => l.title)} teaching={book.teaching} userId={userId} />
              {module.sourceUrls.length > 0 && (
                <section className="rounded-2xl border p-5 text-sm" aria-label="Further reading">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Further reading</p>
                  <p className="mt-1 text-xs text-muted-foreground">External sources for deeper study. Listing them is not an endorsement or approval by any institution.</p>
                  <ul className="mt-3 space-y-1.5">{module.sourceUrls.map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:text-accent" data-testid="link-source">{u.replace(/^https?:\/\//, '')}<ExternalLink className="h-3 w-3 shrink-0" /></a></li>)}</ul>
                </section>
              )}
            </div>
          )}
          {!isLastLesson && (
            <p className="mt-10 flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground"><Info className="h-4 w-4 shrink-0" />The step-through, micro-video and teach-back for this chapter follow the final lesson.</p>
          )}

          <nav className="mt-12 grid gap-3 border-t pt-6 sm:grid-cols-2" aria-label="Lesson navigation">
            {prev ? (
              <Link href={`${base}/${prev.lesson.id}`} className="ink-card lift group p-4" data-testid="link-prev-lesson">
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowLeft className="h-3.5 w-3.5" />Previous</span>
                <span className="mt-1 block font-display font-semibold text-primary">{prev.lesson.title}</span>
              </Link>
            ) : <span />}
            {next ? (
              <Link href={`${base}/${next.lesson.id}`} className="ink-card lift p-4 text-right" data-testid="link-next-lesson">
                <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">Next<ArrowRight className="h-3.5 w-3.5" /></span>
                <span className="mt-1 block font-display font-semibold text-primary">{next.lesson.title}</span>
              </Link>
            ) : (
              <Link href={base} className="ink-card lift p-4 text-right" data-testid="link-finish-book"><span className="text-xs text-muted-foreground">End of book</span><span className="mt-1 block font-display font-semibold text-primary">Back to contents</span></Link>
            )}
          </nav>
          <p className="mt-4 text-center font-mono text-[10px] text-muted-foreground">Tip: use the left and right arrow keys to turn pages</p>
          <div className="mt-6"><SeparationNote compact /></div>
        </article>
      </div>
    </div>
  );
}

function Contents({ book, flat, pm, current, onPick }: { book: StudyBook; flat: Flat[]; pm: Map<string, StudyProgress>; current: string; onPick: () => void }) {
  const read = flat.filter((f) => pm.get(f.lesson.id)?.read).length;
  return (
    <nav aria-label="Book contents" data-testid="nav-contents">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Contents</p>
      <p className="mt-1 font-display text-lg font-semibold leading-tight text-primary">{book.title}</p>
      <div className="mt-3"><Meter value={flat.length ? (read / flat.length) * 100 : 0} /></div>
      <p className="mt-1 text-[11px] text-muted-foreground">{read} of {flat.length} lessons read</p>
      <ol className="mt-5 space-y-4">
        {book.modules.map((m, mi) => (
          <li key={m.id}>
            {mi > 0 && m.extended && !book.modules[mi - 1].extended && <p className="mb-3 border-t pt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(32_70%_32%)]">Extended · 120h</p>}
            <p className="text-xs font-semibold text-foreground/80"><span className="font-mono text-accent">{String(mi + 1).padStart(2, '0')}</span> {m.title}</p>
            <ul className="mt-1.5 space-y-0.5 border-l pl-3">
              {m.lessons.map((l) => {
                const pr = pm.get(l.id), on = l.id === current;
                return (
                  <li key={l.id}>
                    <Link href={`/study/${book.courseId}/${l.id}`} onClick={onPick} aria-current={on ? 'page' : undefined} data-testid={`link-toc-${l.id}`}
                      className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-[13px] leading-snug transition-colors ${on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-primary'}`}>
                      {pr?.read ? <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${on ? '' : 'text-[hsl(var(--ledger))]'}`} aria-label="Read" /> : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-40" aria-label="Unread" />}
                      <span className="flex-1">{l.title}</span>
                      {pr?.bookmarked && <Bookmark className="mt-0.5 h-3 w-3 shrink-0 fill-current text-accent" aria-label="Bookmarked" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function EditorialNote({ note }: { note: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-[hsl(var(--turmeric))]/50 bg-[hsl(var(--turmeric)/.1)] p-5 text-sm" data-testid="text-editorial-note">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(32_70%_38%)]" />
      <div>
        <p className="font-semibold text-primary">Editorial note</p>
        <p className="mt-1 leading-relaxed text-foreground/80">{note}</p>
      </div>
    </div>
  );
}

function SeparationNote({ compact }: { compact?: boolean }) {
  return (
    <p className={`flex gap-2 text-muted-foreground ${compact ? 'text-xs' : 'mt-4 rounded-xl border bg-card px-4 py-3 text-sm'}`} data-testid="text-separation-note">
      <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--ledger))]" />
      Read marks here are your personal study record. They never complete internship modules, log supervised hours, or count as official completion. Track those in My learning and the Logbook.
    </p>
  );
}

function NotAuthored({ courseId }: { courseId: string }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center" data-testid="status-not-authored">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary"><BookOpen className="h-6 w-6 text-primary" /></div>
      <p className="mt-5 font-mono text-xs uppercase tracking-[0.2em] text-accent">404 · Not yet authored</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-primary">This study book has not been written yet</h1>
      <p className="mt-3 text-muted-foreground">Course {courseId} currently exists as an internship plan only. Its lessons are not available, and we would rather say so than show placeholders.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Button asChild variant="outline" data-testid="button-view-plan"><Link href={`/courses/${courseId}`}>View the plan</Link></Button>
        <Button asChild data-testid="button-open-course01"><Link href="/study/01">Read Community Survey &amp; Data Analysis</Link></Button>
      </div>
    </div>
  );
}

function ReaderSkeleton() {
  return (
    <div className="mx-auto max-w-[46rem] space-y-4" data-testid="status-loading">
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-6 w-2/3" />
      {Array.from({ length: 6 }).map((_, k) => <Skeleton key={k} className="h-4" style={{ width: `${92 - (k % 3) * 9}%` }} />)}
    </div>
  );
}
