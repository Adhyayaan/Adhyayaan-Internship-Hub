import type { Module } from '@workspace/api-client-react';

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

export function ScheduleBand({hours,start,end}: {hours:number;start?:string;end?:string}) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2 border-y bg-secondary/40 px-5 py-3 text-sm">
    <strong className="text-primary">{hours / 7.5}-week chapter timeline</strong>
    <span className="text-muted-foreground">{start && end && `${dueDate(start)} – ${dueDate(end)} · `}7.5 hours per week</span>
  </div>;
}
