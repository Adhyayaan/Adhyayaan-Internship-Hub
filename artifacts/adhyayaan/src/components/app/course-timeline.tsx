import type { Module, PathwayPace } from '@workspace/api-client-react';

export function chapterWeeks(modules: Module[], hours: number) {
  let assigned = 0;
  return modules.map(module => {
    const first = Math.floor(assigned / 7.5) + 1;
    assigned += hours === 60 ? module.hours60 : module.hours120;
    const last = Math.ceil(assigned / 7.5);
    return first === last ? `Week ${first}` : `Weeks ${first}–${last}`;
  });
}

export function dueDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date+'T00:00:00Z'));
}

export function InternshipPace({ plan }: { plan: PathwayPace }) {
  const pace = plan.deltaHours === 0
    ? 'On schedule'
    : `${Math.abs(plan.deltaHours)} h ${plan.deltaHours > 0 ? 'ahead' : 'behind'}`;

  return (
    <details className="mt-3 border-t pt-2 text-xs">
      <summary className="cursor-pointer font-medium leading-6 text-primary">
        {pace}{plan.cohortSize > 1 && ` · At or above ${plan.percentile}% of cohort`}
      </summary>
      <div className="mt-1 space-y-1 leading-relaxed text-muted-foreground">
        <p>Chapter hours completed: {plan.percent}%. Target today: {plan.expected}%.</p>
        <p>{plan.cohortSize > 1
          ? `Compared with all ${plan.cohortSize} learners who started this course on ${dueDate(plan.start)}, including you and learners tied with you.`
          : 'You are the only learner who started this course on this date.'}</p>
        <p>{plan.guideName ? `Internship guide: ${plan.guideName}` : 'Awaiting an internship guide.'}</p>
      </div>
    </details>
  );
}

export function ScheduleBand({hours,start,end}: {hours:number;start?:string;end?:string}) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2 border-y bg-secondary/40 px-5 py-3 text-sm">
    <strong className="text-primary">{hours / 7.5}-week chapter timeline</strong>
    <span className="text-muted-foreground">{start && end && `${dueDate(start)} – ${dueDate(end)} · `}7.5 hours per week</span>
  </div>;
}
