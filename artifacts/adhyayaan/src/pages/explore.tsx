import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useListCourses } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CardSkeletons, Empty, ErrorPanel, PageHeader } from '@/components/app/bits';
import { CourseCard } from '@/components/app/course-card';
import { useTitle } from '@/lib/app';

const DURATIONS = [
  { k: 'all', l: 'Any length' },
  { k: 'short', l: 'Up to 60 hrs' },
  { k: 'long', l: 'Over 60 hrs' },
];

export default function Explore() {
  useTitle('Explore internships');
  const q = useListCourses();
  const [term, setTerm] = useState('');
  const [cat, setCat] = useState('All');
  const [dur, setDur] = useState('all');
  const courses = q.data ?? [];
  const cats = useMemo(() => ['All', ...Array.from(new Set((q.data ?? []).map((c) => c.category))).sort()], [q.data]);
  const list = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (q.data ?? []).filter(
      (c) =>
        (cat === 'All' || c.category === cat) &&
        (dur === 'all' || (dur === 'short' ? c.hours <= 60 : c.hours > 60)) &&
        (!t || [c.title, c.description, c.category, ...c.disciplines].join(' ').toLowerCase().includes(t)),
    );
  }, [q.data, term, cat, dur]);

  return (
    <div>
      <PageHeader kicker={`${courses.length || 30} internship blueprints`} title={<>Find work that <em className="text-accent">fits your discipline</em></>} sub="Every internship is a planning blueprint drawn from source workbooks. Fees shown are indicative programme fees; enrolling here is a free learning preview." />
      <div className="sticky top-14 z-20 -mx-4 mb-6 space-y-3 bg-background/90 px-4 py-3 backdrop-blur md:top-0 md:mx-0 md:px-0">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by title, skill or discipline" className="h-12 rounded-2xl bg-card pl-11 text-base" data-testid="input-search" />
          {term && <button onClick={() => setTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Clear search" data-testid="button-clear-search"><X className="h-4 w-4" /></button>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} data-testid={`button-cat-${c}`}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-all ${cat === c ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary/40'}`}>{c}</button>
          ))}
          <span className="mx-1 w-px shrink-0 bg-border" />
          {DURATIONS.map((d) => (
            <button key={d.k} onClick={() => setDur(d.k)} data-testid={`button-dur-${d.k}`}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-all ${dur === d.k ? 'border-accent bg-accent text-accent-foreground' : 'bg-card hover:border-accent/50'}`}>{d.l}</button>
          ))}
        </div>
      </div>
      {q.isLoading ? <CardSkeletons n={6} h="h-56" /> : q.error ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : list.length === 0 ? (
        <Empty title={courses.length ? 'No match for that combination' : 'Blueprints are still being imported'} body={courses.length ? 'Try a broader word or clear a filter.' : 'The internship workbooks have not loaded yet. Check back shortly.'}
          action={courses.length ? <Button variant="outline" onClick={() => { setTerm(''); setCat('All'); setDur('all'); }} data-testid="button-reset-filters">Reset filters</Button> : undefined} />
      ) : (
        <>
          <p className="mb-3 font-mono text-xs text-muted-foreground" data-testid="text-result-count">{list.length} of {courses.length}</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((c, i) => <CourseCard key={c.id} course={c} i={i} />)}</div>
        </>
      )}
    </div>
  );
}
