import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { useAskAi, useListAiMessages, useListEnrollments, getListAiMessagesQueryKey, getListEnrollmentsQueryKey, type AiInputTool } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ErrorPanel, Md, PageHeader, SignInWall } from '@/components/app/bits';
import { Skeleton } from '@/components/ui/skeleton';
import { errMsg, useAuth, useTitle } from '@/lib/app';

const TOOLS: { k: AiInputTool; l: string; hint: string }[] = [
  { k: 'tutor', l: 'Tutor', hint: 'Explain PWM like I am new to electronics' },
  { k: 'quiz', l: 'Quick check', hint: 'Ask me three questions on database normalisation' },
  { k: 'planner', l: 'Planner', hint: 'Plan my next 10 hours around the testing module' },
  { k: 'review', l: 'Review', hint: 'Paste a reflection or code excerpt for formative feedback' },
  { k: 'viva', l: 'Viva', hint: 'Run a mock viva on my project, one question at a time' },
];

export default function AiStudio() {
  useTitle('AI learning studio');
  const { user, isLoading } = useAuth();
  const msgs = useListAiMessages({ query: { enabled: !!user, queryKey: getListAiMessagesQueryKey() } });
  const enr = useListEnrollments({ query: { enabled: !!user, queryKey: getListEnrollmentsQueryKey() } });
  const ask = useAskAi();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tool, setTool] = useState<AiInputTool>('tutor');
  const [lang, setLang] = useState<'en' | 'bn'>('bn');
  const [course, setCourse] = useState('none');
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const list = useMemo(() => [...(msgs.data ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [msgs.data]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [list.length, pending]);
  const t = TOOLS.find((x) => x.k === tool)!;

  const send = async (ev?: FormEvent) => {
    ev?.preventDefault();
    const m = text.trim();
    if (!m || ask.isPending) return;
    setPending(m); setText('');
    try {
      await ask.mutateAsync({ data: { tool, message: m, language: lang, ...(course !== 'none' ? { courseId: course } : {}) } });
      await qc.invalidateQueries({ queryKey: getListAiMessagesQueryKey() });
    } catch (e) {
      setText(m);
      toast({ title: 'The studio could not answer', description: errMsg(e), variant: 'destructive' });
    } finally { setPending(null); }
  };

  return (
    <div>
      <PageHeader kicker="AI learning studio" title={<>Ask in <em className="text-accent">Bangla</em> or English</>} sub="Adhya can use your learning report and recent work to choose examples and hints. Its feedback does not count towards your grade. Go to Practice for scored questions." />
      {isLoading ? <Skeleton className="h-96 rounded-3xl bg-secondary" /> : !user ? <SignInWall what="use the AI studio" /> : (
        <div className="ink-card flex min-h-[60dvh] flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b bg-secondary/40 p-3">
            <div className="flex gap-1 overflow-x-auto">
              {TOOLS.map((x) => (
                <button key={x.k} onClick={() => setTool(x.k)} data-testid={`button-tool-${x.k}`}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-all ${tool === x.k ? 'bg-primary text-primary-foreground' : 'hover:bg-card'}`}>{x.l}</button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Select value={course} onValueChange={setCourse}>
                <SelectTrigger className="h-9 w-44 bg-card" data-testid="select-course"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No course context</SelectItem>
                  {(enr.data ?? []).map((e) => <SelectItem key={e.id} value={e.course.id}>{e.course.title}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex rounded-full bg-card p-0.5 text-sm" role="radiogroup" aria-label="Answer language">
                {(['bn', 'en'] as const).map((l) => (
                  <button key={l} onClick={() => setLang(l)} role="radio" aria-checked={lang === l} data-testid={`button-lang-${l}`}
                    className={`rounded-full px-3 py-1 transition-colors ${lang === l ? 'bg-accent text-accent-foreground' : ''}`}>{l === 'bn' ? 'বাংলা' : 'English'}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6" style={{ maxHeight: '62dvh' }}>
            {msgs.isLoading ? <Skeleton className="h-24 bg-secondary" /> : msgs.error ? <ErrorPanel error={msgs.error} onRetry={() => msgs.refetch()} /> : list.length === 0 && !pending ? (
              <div className="py-12 text-center">
                <p className="font-display text-2xl text-primary">Start with a real question.</p>
                <button onClick={() => setText(t.hint)} className="mt-3 text-sm text-accent underline-offset-4 hover:underline" data-testid="button-use-hint">Try: "{t.hint}"</button>
              </div>
            ) : list.map((m) => (
              <div key={m.id} className={`rise flex ${m.role === 'user' ? 'justify-end' : ''}`} data-testid={`msg-${m.id}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border bg-background'}`}>
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">{m.role === 'user' ? 'You' : 'Adhyayaan'} · {m.tool}</p>
                  {m.role === 'user' ? <p className="whitespace-pre-wrap">{m.content}</p> : <Md text={m.content} />}
                </div>
              </div>
            ))}
            {pending && (
              <>
                <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/80 px-4 py-3 text-primary-foreground whitespace-pre-wrap">{pending}</div></div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="status-ai-thinking">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" /> Thinking it through — this can take a little while
                </div>
              </>
            )}
            <div ref={end} />
          </div>
          <form onSubmit={send} className="border-t p-3">
            <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={12000} rows={2} placeholder={t.hint}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                className="min-h-0 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" data-testid="input-ai-message" />
              <Button type="submit" size="icon" disabled={!text.trim() || ask.isPending} className="h-10 w-10 shrink-0 rounded-xl bg-accent hover:bg-accent/90" aria-label="Send" data-testid="button-send-ai">
                {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
