import { Link } from 'wouter';
import { ArrowUpRight, Clock } from 'lucide-react';
import type { Course } from '@workspace/api-client-react';
import { fmtINR } from '@/lib/app';

const TONES = ['bg-primary text-primary-foreground', 'bg-accent text-accent-foreground', 'bg-[hsl(40_88%_52%)] text-primary', 'bg-[hsl(168_40%_36%)] text-primary-foreground'];

export function toneFor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function CourseCard({ course, i = 0 }: { course: Course; i?: number }) {
  return (
    <Link
      href={`/courses/${course.id}`}
      className="ink-card lift rise group flex flex-col overflow-hidden"
      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
      data-testid={`card-course-${course.id}`}
    >
      <div className={`relative flex h-24 items-end justify-between p-4 ${toneFor(course.category)}`}>
        <div className="alpona-dots absolute inset-0 opacity-30" />
        <span className="relative font-mono text-[10px] uppercase tracking-[0.18em] opacity-90">{course.category}</span>
        <ArrowUpRight className="relative h-5 w-5 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl font-semibold leading-tight text-primary">{course.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{course.description}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {course.hours} hrs recommended</span>
          <span>{course.mode}</span>
          <span className="font-mono">{fmtINR(course.price)} indicative</span>
        </div>
      </div>
    </Link>
  );
}
