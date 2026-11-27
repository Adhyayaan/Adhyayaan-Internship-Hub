type Chapter = { id: string; title: string; hours60: number; hours120: number };
type Progress = { hours: number; completedModules: string[]; createdAt: Date };
const day = 86_400_000;
const indiaDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const localDay = (date: Date) =>
  Date.parse(indiaDate.format(date) + "T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round = (value: number) => Math.round(value * 10) / 10;
export function pathwayPace(
  row: Progress,
  modules: Chapter[],
  now = new Date(),
) {
  const start = localDay(row.createdAt);
  const duration = row.hours === 60 ? 56 : 112;
  const elapsed = Math.max(
    0,
    Math.min(duration, (localDay(now) - start) / day),
  );
  let planned = 0;
  let completed = 0;
  const chapters = modules.flatMap((module) => {
    const hours = row.hours === 60 ? module.hours60 : module.hours120;
    if (!hours) return [];
    planned += hours;
    const done = row.completedModules.includes(module.id);
    if (done) completed += hours;
    const due = iso(
      start + (Math.ceil((planned / row.hours) * duration) - 1) * day,
    );
    return [{ title: module.title, hours, due, done }];
  });
  return {
    chapters,
    percent: round((100 * completed) / row.hours),
    expected: round((100 * elapsed) / duration),
    deltaHours: round(completed - (row.hours * elapsed) / duration),
    start: iso(start),
    end: iso(start + (duration - 1) * day),
  };
}
export function standing(score: number, cohort: number[]) {
  return cohort.length
    ? round(
        (100 * cohort.filter((value) => value <= score).length) / cohort.length,
      )
    : 0;
}
