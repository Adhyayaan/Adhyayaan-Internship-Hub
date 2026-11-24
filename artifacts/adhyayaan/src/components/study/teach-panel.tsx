import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Lightbulb, Loader2, RotateCcw, Send } from 'lucide-react';
import { useTeachStudy, getGetStudyBookQueryKey, getGetStudyBookBengaliQueryKey, type StudyModule, type StudyTeaching } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { authHref, errMsg } from '@/lib/app';
import { useHere } from '@/lib/use-here';

type Level = 'understand' | 'apply' | 'analyze';
const LEVELS: { id: Level; n: string; label: string; ask: string }[] = [
  { id: 'understand', n: '1', label: 'Explain it back', ask: 'Put the idea in your own words, as if teaching a classmate.' },
  { id: 'apply', n: '2', label: 'Applied scenario', ask: 'Use the idea on a real situation in a Bengal locality.' },
  { id: 'analyze', n: '3', label: 'Analysis exercise', ask: 'Weigh evidence, find limits, and justify a judgement.' },
];
const VERDICT: Record<string, { label: string; cls: string; note: string }> = {
  revisit: { label: 'Revisit', cls: 'bg-destructive/10 text-destructive', note: 'Your teacher suggests revising before moving on.' },
  developing: { label: 'Developing', cls: 'bg-[hsl(var(--turmeric)/.18)] text-[hsl(32_70%_32%)]', note: 'Getting there. Strengthen the reasoning at this stage.' },
  secure: { label: 'Secure', cls: 'ledger-chip', note: 'Solid reasoning. Ready for the next stage.' },
};

/** Session-only drafts, keyed by user + module + level. Cleared on user change; never written to storage. */
const drafts = new Map<string, string>();
let draftOwner: string | null = null;

export function TeachPanel({ courseId, module, lessonTitles, teaching, userId, language = 'en' }: {
  courseId: string; module: StudyModule; lessonTitles: string[]; teaching: StudyTeaching[]; userId: string | null; language?: 'en' | 'bn';
}) {
  const here = useHere();
  const qc = useQueryClient();
  const { toast } = useToast();
  const teach = useTeachStudy();
  const history = useMemo(() => teaching.filter((t) => t.moduleId === module.id), [teaching, module.id]);
  const latest = history[0];

  if (draftOwner !== userId) { drafts.clear(); draftOwner = userId; }
  const [level, setLevel] = useState<Level>(latest?.nextLevel ?? 'understand');
  const [lang, setLang] = useState<'en' | 'bn'>(language);
  const [hint, setHint] = useState(false);
  const key = `${userId}:${module.id}:${level}`;
  const [answer, setAnswerState] = useState(() => drafts.get(key) ?? '');
  const setAnswer = (v: string) => { drafts.set(key, v); setAnswerState(v); };
  const reqToken = useRef(0);
  useEffect(() => { setLang(language); }, [language]);

  // Reset view on module or user change; restore latest saved stage.
  const ctx = `${userId}:${module.id}`;
  const lastCtx = useRef(ctx);
  useEffect(() => {
    if (lastCtx.current === ctx) return;
    lastCtx.current = ctx;
    reqToken.current++;
    teach.reset();
    const lv = latest?.nextLevel ?? 'understand';
    setLevel(lv);
    setHint(false);
    setAnswerState(drafts.get(`${ctx}:${lv}`) ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const switchLevel = (lv: Level) => { reqToken.current++; setLevel(lv); setHint(false); setAnswerState(drafts.get(`${userId}:${module.id}:${lv}`) ?? ''); };
  const resetAll = () => { LEVELS.forEach((l) => drafts.delete(`${userId}:${module.id}:${l.id}`)); teach.reset(); setLevel('understand'); setAnswerState(''); setHint(false); };

  const len = answer.trim().length;
  const valid = len >= 15 && len <= 4000;
  const submit = () => {
    if (!valid || teach.isPending || !userId) return;
    const token = ++reqToken.current;
    const submittedKey = key;
    teach.mutate({ courseId, data: { moduleId: module.id, level, answer: answer.trim(), language: lang } }, {
      onSuccess: () => {
        drafts.delete(submittedKey);
        qc.invalidateQueries({ queryKey: getGetStudyBookQueryKey(courseId) });
        if (courseId === '01') qc.invalidateQueries({ queryKey: getGetStudyBookBengaliQueryKey(courseId) });
        if (token === reqToken.current) setAnswerState('');
      },
      onError: (e) => { if (token === reqToken.current) toast({ title: text.feedbackError, description: `${errMsg(e)} ${lang === 'bn' ? 'তোমার উত্তর এখানেই আছে।' : 'Your answer is still here.'}`, variant: 'destructive' }); },
    });
  };

  const fresh = teach.data && teach.data.moduleId === module.id ? teach.data : null;
  const shown = fresh ?? latest;
  const localizedLevels = lang === 'bn' ? [
    { id: 'understand' as const, n: '1', label: 'বুঝিয়ে বলো', ask: 'ধারণাটি নিজের ভাষায় বোঝাও, যেন এক সহপাঠীকে শেখাচ্ছ।' },
    { id: 'apply' as const, n: '2', label: 'পরিস্থিতিতে প্রয়োগ', ask: 'বাংলার কোনও এলাকার বাস্তব পরিস্থিতিতে ধারণাটি কাজে লাগাও।' },
    { id: 'analyze' as const, n: '3', label: 'যুক্তি বিশ্লেষণ', ask: 'প্রমাণ বিচার করো, সীমা খুঁজে বের করো এবং মতের পক্ষে কারণ দাও।' },
  ] : LEVELS;
  const levelLabel = (id: Level) => localizedLevels.find((item) => item.id === id)?.label ?? id;
  const L = localizedLevels.find((l) => l.id === level)!;
  const text = lang === 'bn' ? {
    heading: 'শেখা কথা শিক্ষককে বোঝাও', eyebrow: 'শেখা বোঝানোর অনুশীলন · এটি চ্যাট নয়',
    feedbackLanguage: 'উত্তরের ভাষা', stages: 'শেখার ধাপ', secure: 'ভালোভাবে বুঝেছ',
    hintHide: 'ইঙ্গিত লুকাও', hintAsk: 'একটু ইঙ্গিত চাই?', answer: 'তোমার উত্তর',
    understandHint: 'উপরের লক্ষ্যগুলি আবার পড়ো, বিশেষ করে: ', useOwn: 'বইয়ের বাক্য নয়, একটি মূল শব্দ নিজের ভাষায় বোঝাও।',
    applyHint: 'উদাহরণটি আবার দেখো: ', applyPrompt: 'নিজের এলাকা ও মানুষদের কথা বলো, তারপর প্রথমে কী করবে তা নির্দিষ্ট করো।',
    analyzeHint: 'ধাপের অ্যানিমেশন ও অনুশীলনটি আবার দেখো: ', analyzePrompt: 'কী ভুল হতে পারে? কোন প্রমাণে তোমার মত বদলাবে?',
    chars: 'অক্ষর · অন্তত ১৫টি দরকার · জমা না-দেওয়া পর্যন্ত কিছু পাঠানো হয় না',
    startOver: 'আবার শুরু করো', reading: 'উত্তর পড়া হচ্ছে', submit: 'শিক্ষকের কাছে পাঠাও',
    signIn: 'পড়া সবার জন্য খোলা। তোমার যুক্তির ওপর মতামত পেতে', create: 'বিনামূল্যে অ্যাকাউন্ট খোলো',
    revisit: 'আবার দেখো', lastTime: 'গতবার', teacher: 'তোমার শিক্ষক',
    deeper: 'এই ধাপে আরও কঠিন প্রশ্ন দিয়েছেন', revise: 'এই ধাপে আবার অনুশীলন করতে বলেছেন',
    recommended: 'পরের ধাপে যেতে বলেছেন', adds: 'শিক্ষকের বাড়তি প্রশ্ন:', earlier: 'আগের মতামত',
    goTo: 'এই ধাপে যাও', feedbackError: 'তোমার শিক্ষক এখন উত্তর দিতে পারেননি',
  } : {
    heading: 'Show what you understood', eyebrow: 'Teach-back with your teacher · not a chat',
    feedbackLanguage: 'Feedback language', stages: 'Teaching stages', secure: 'secure',
    hintHide: 'Hide hint', hintAsk: 'Need a nudge first?', answer: 'Your answer',
    understandHint: 'Re-read the objectives above, especially: ', useOwn: 'Use one key term in your own words, not the book’s.',
    applyHint: 'Look back at the worked example in ', applyPrompt: '. Name your place, your people, and the exact step you would take first.',
    analyzeHint: 'Revisit the step-through and the activity in ', analyzePrompt: '. What could go wrong, and what evidence would change your mind?',
    chars: 'characters · at least 15 · nothing is sent until you submit',
    startOver: 'Start over', reading: 'Reading your answer', submit: 'Submit to teacher',
    signIn: 'Reading is open to all. To get feedback on your reasoning,', create: 'create a free account',
    revisit: 'Revisit', lastTime: 'Last time at', teacher: 'your teacher',
    deeper: 'offered a deeper challenge at this stage', revise: 'kept you at this stage to revise',
    recommended: 'recommended the next stage', adds: 'Your teacher adds:', earlier: 'Earlier feedback',
    goTo: 'Go to', feedbackError: 'Your teacher could not respond',
  };
  const verdictLabel = (value: string) => lang === 'bn'
    ? ({ revisit: 'আবার দেখো', developing: 'আরও অনুশীলন দরকার', secure: 'ভালোভাবে বুঝেছ' }[value] ?? value)
    : VERDICT[value]?.label ?? value;
  const verdictNote = (value: string) => lang === 'bn'
    ? ({ revisit: 'পরের ধাপে যাওয়ার আগে শিক্ষক আবার পড়তে বলেছেন।', developing: 'ভালো শুরু। এই ধাপে যুক্তিটা আরও পরিষ্কার করো।', secure: 'যুক্তি ভালো হয়েছে। পরের ধাপের জন্য প্রস্তুত।' }[value] ?? '')
    : VERDICT[value]?.note ?? '';
  const adaptive = latest && latest.nextLevel === level && latest.nextPrompt ? latest.nextPrompt : null;

  return (
    <section className="reader-paper overflow-hidden" aria-labelledby="teach-h" data-testid="teach-panel">
      <div className="relative bg-[hsl(var(--ledger))] px-6 py-5 text-[hsl(var(--paper))]">
        <div className="alpona-dots absolute inset-0 opacity-25" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-80">{text.eyebrow}</p>
            <h2 id="teach-h" className="mt-1 font-display text-2xl font-semibold">{text.heading}</h2>
          </div>
          <div className="flex rounded-full bg-white/10 p-0.5 text-xs" role="group" aria-label={text.feedbackLanguage}>
            {(['en', 'bn'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} data-testid={`button-lang-${l}`}
                className={`rounded-full px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--turmeric))] ${lang === l ? 'bg-[hsl(var(--paper))] text-[hsl(var(--ledger))]' : ''}`}>{l === 'en' ? 'English' : 'বাংলা'}</button>
            ))}
          </div>
        </div>
      </div>

      <ol className="grid grid-cols-3 border-b" aria-label={text.stages}>
        {localizedLevels.map((l) => {
          const done = history.some((h) => h.level === l.id && h.verdict === 'secure');
          const cur = level === l.id;
          return (
            <li key={l.id}>
              <button type="button" onClick={() => switchLevel(l.id)} aria-current={cur ? 'step' : undefined} data-testid={`button-level-${l.id}`}
                className={`relative w-full px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${cur ? 'bg-card' : 'bg-muted/40 hover:bg-muted/70'}`}>
                <span className={`font-mono text-[10px] ${done ? 'text-[hsl(var(--ledger))]' : 'text-muted-foreground'}`}>{lang === 'bn' ? `ধাপ ${l.n}` : `Stage ${l.n}`}{done ? ` · ${text.secure}` : ''}</span>
                <span className={`block text-sm font-semibold ${cur ? 'text-primary' : 'text-muted-foreground'}`}>{l.label}</span>
                {cur && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="space-y-5 p-6">
        {latest && (
          <p className="rounded-xl border border-dashed px-4 py-2.5 text-xs text-muted-foreground" data-testid="text-adaptation">
            {text.lastTime} <b className="text-primary">{levelLabel(latest.level)}</b> {lang === 'bn' ? 'তোমার ফল ছিল' : 'you were'} <b className="text-primary">{verdictLabel(latest.verdict).toLowerCase()}</b>
            {' '}— {text.teacher} {latest.nextLevel === latest.level ? latest.verdict === 'secure' ? text.deeper : text.revise : `${text.recommended} ${levelLabel(latest.nextLevel)}`}.
          </p>
        )}
        <div>
          <p className="text-xs text-muted-foreground">{L.ask}</p>
          <p className="mt-2 font-display text-xl leading-snug text-primary" data-testid="text-question">{module.questions[level]}</p>
          {adaptive && <p className="mt-2 border-l-2 border-accent pl-3 text-sm italic text-foreground/80" data-testid="text-next-prompt">{text.adds} {adaptive}</p>}
        </div>

        <div>
          <button type="button" onClick={() => setHint(!hint)} aria-expanded={hint} data-testid="button-hint"
             className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-[hsl(var(--ledger))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Lightbulb className="h-4 w-4" /> {hint ? text.hintHide : text.hintAsk}
          </button>
          {hint && (
            <div className="mt-2 rounded-xl ledger-chip px-4 py-3 text-sm" data-testid="text-hint">
              {level === 'understand' && <>{text.understandHint}<i>{module.objectives[0]}</i>. {text.useOwn}</>}
              {level === 'apply' && <>{text.applyHint}<i>{lessonTitles[0]}</i>{text.applyPrompt}</>}
              {level === 'analyze' && <>{text.analyzeHint}<i>{lessonTitles[lessonTitles.length - 1]}</i>{text.analyzePrompt}</>}
            </div>
          )}
        </div>

        {userId ? (
          <div>
            <label htmlFor="teach-answer" className="sr-only">{text.answer}</label>
            <Textarea id="teach-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} maxLength={4000} disabled={teach.isPending}
              placeholder={lang === 'bn' ? 'নিজের ভাষায় লিখুন…' : 'Write your reasoning here…'} className="resize-y bg-card font-serif text-base leading-relaxed" data-testid="input-teach-answer" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <span className={`font-mono text-[11px] ${len && !valid ? 'text-destructive' : 'text-muted-foreground'}`}>{len}/4000 · {text.chars}</span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={resetAll} disabled={teach.isPending} data-testid="button-teach-reset"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />{text.startOver}</Button>
                <Button type="button" onClick={submit} disabled={!valid || teach.isPending} className="bg-accent hover:bg-accent/90" data-testid="button-teach-submit">
                  {teach.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{text.reading}</> : <><Send className="mr-2 h-4 w-4" />{text.submit}</>}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-muted/60 p-4 text-sm">
            {text.signIn} <Link href={authHref('login', here)} className="font-semibold text-accent hover:underline" data-testid="link-teach-login">{lang === 'bn' ? 'সাইন ইন করো' : 'sign in'}</Link> {lang === 'bn' ? 'অথবা' : 'or'} <Link href={authHref('register', here)} className="font-semibold text-accent hover:underline" data-testid="link-teach-register">{text.create}</Link>.
          </div>
        )}

        {shown && (
          <article className="page-in rounded-2xl border bg-card p-5" aria-live="polite" data-testid="teach-feedback">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT[shown.verdict]?.cls}`} data-testid="status-verdict">{verdictLabel(shown.verdict)}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{levelLabel(shown.level)} · {new Date(shown.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed" data-testid="text-feedback">{shown.feedback}</p>
            {shown.revisit && <p className="mt-3 text-sm"><span className="font-semibold text-primary">{text.revisit}: </span>{shown.revisit}</p>}
            <p className="mt-2 text-xs text-muted-foreground">{verdictNote(shown.verdict)}</p>
            {shown.nextLevel !== level && (
              <Button type="button" size="sm" variant="outline" className="mt-4" onClick={() => switchLevel(shown.nextLevel)} data-testid="button-go-next-level">
                {text.goTo} {levelLabel(shown.nextLevel)} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
          </article>
        )}

        {history.length > 1 && (
          <details className="group text-sm" data-testid="teach-history">
            <summary className="cursor-pointer font-medium text-primary">{text.earlier} ({history.length - 1})</summary>
            <ul className="mt-3 space-y-3">
              {history.slice(1).map((h) => (
                <li key={h.id} className="rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT[h.verdict]?.cls}`}>{verdictLabel(h.verdict)}</span><span className="font-mono text-[10px] text-muted-foreground">{levelLabel(h.level)} · {new Date(h.createdAt).toLocaleDateString('en-IN')}</span></div>
                  <p className="mt-2 line-clamp-2 italic text-muted-foreground">"{h.answer}"</p>
                  <p className="mt-1 text-foreground/80">{h.feedback}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

