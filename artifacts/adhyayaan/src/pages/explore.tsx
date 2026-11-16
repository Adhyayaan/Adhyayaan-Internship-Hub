import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { getListEnrollmentsQueryKey, useListCourses, useListEnrollments } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CardSkeletons, Empty, ErrorPanel, PageHeader } from '@/components/app/bits';
import { CourseCard } from '@/components/app/course-card';
import { useAuth, useTitle } from '@/lib/app';

const DURATIONS = [
  { k: 'all', l: 'Any length' },
  { k: 'short', l: 'Up to 60 hrs' },
  { k: 'long', l: 'Over 60 hrs' },
];

export default function Explore() {
  useTitle('Explore internships');
  const { user } = useAuth();
  const q = useListCourses();
  const enrollments = useListEnrollments({ query: { enabled: !!user, queryKey: getListEnrollmentsQueryKey() } });
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
  const visibleCourseIds = useMemo(() => new Set(list.map((c) => c.id)), [list]);
  const enrolled = useMemo(
    () => (enrollments.data ?? []).filter((e) => visibleCourseIds.has(e.course.id)),
    [enrollments.data, visibleCourseIds],
  );
  const enrolledIds = useMemo(() => new Set(enrolled.map((e) => e.course.id)), [enrolled]);
  const available = useMemo(() => list.filter((c) => !enrolledIds.has(c.id)), [list, enrolledIds]);
  const loading = q.isLoading || (!!user && enrollments.isLoading);

  return (
    <div>
      <PageHeader kicker={`${courses.length || 30} internship blueprints${user && enrollments.data?.length ? ` · ${enrollments.data.length} enrolled` : ''}`} title={<>Find work that <em className="text-accent">fits your discipline</em></>} sub="Every internship is a planning blueprint drawn from source workbooks. Fees shown are indicative programme fees; enrolling here is a free learning preview." />
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
      {loading ? <CardSkeletons n={6} h="h-56" /> : q.error ? <ErrorPanel error={q.error} onRetry={() => q.refetch()} /> : user && enrollments.error ? <ErrorPanel error={enrollments.error} onRetry={() => enrollments.refetch()} /> : list.length === 0 ? (
        <Empty title={courses.length ? 'No match for that combination' : 'Blueprints are still being imported'} body={courses.length ? 'Try a broader word or clear a filter.' : 'The internship workbooks have not loaded yet. Check back shortly.'}
          action={courses.length ? <Button variant="outline" onClick={() => { setTerm(''); setCat('All'); setDur('all'); }} data-testid="button-reset-filters">Reset filters</Button> : undefined} />
      ) : (
        <>
          <p className="mb-3 font-mono text-xs text-muted-foreground" data-testid="text-result-count">{list.length} of {courses.length}</p>
          {enrolled.length > 0 && (
            <section className="mb-8 rounded-3xl border border-[hsl(var(--ledger)/.28)] bg-[hsl(var(--ledger-soft)/.35)] p-4 md:p-6" aria-labelledby="enrolled-heading" data-testid="section-enrolled-internships">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--ledger))]">Your learning shelf</p>
                  <h2 id="enrolled-heading" className="font-display text-2xl font-semibold text-primary">Enrolled internships</h2>
                </div>
                <span className="text-xs text-muted-foreground">{enrolled.length} pathway{enrolled.length === 1 ? '' : 's'} · shown separately from new options</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{enrolled.map((e, i) => <CourseCard key={e.course.id} course={e.course} i={i} enrollment={{ hours: e.hours, status: e.status }} />)}</div>
            </section>
          )}
          <section aria-labelledby="available-heading" data-testid="section-available-internships">
            <div className="mb-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{user ? 'Continue exploring' : 'Browse the catalogue'}</p>
              <h2 id="available-heading" className="font-display text-2xl font-semibold text-primary">{user ? 'Other internships' : 'Internship blueprints'}</h2>
            </div>
            {available.length > 0 ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{available.map((c, i) => <CourseCard key={c.id} course={c} i={i} />)}</div>
              : enrolled.length > 0 ? <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">All internships matching these filters are already on your learning shelf.</p>
                : <Empty title="No match for that combination" body="Try a broader word or clear a filter."
                  action={<Button variant="outline" onClick={() => { setTerm(''); setCat('All'); setDur('all'); }} data-testid="button-reset-filters">Reset filters</Button>} />}
          </section>
        </>
      )}
    </div>
  );
}
