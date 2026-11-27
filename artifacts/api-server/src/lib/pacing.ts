const DAY_MS = 24 * 60 * 60 * 1000;
const INDIA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MIN_COHORT_SIZE = 5;

export type PacingModule = {
  id: string;
  title: string;
  hours60: number;
  hours120: number;
};

export type PacingCourse = { modules: PacingModule[] };

type ScheduledModule = {
  moduleId: string;
  estimatedHours: number;
  startWeek: number;
  endWeek: number;
  startDate: string;
  endDate: string;
};

type PacingStatus = "ahead" | "on_track" | "behind" | "complete";

function dateKeyFromParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dayIndex(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

function dateKeyFromDayIndex(index: number) {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

export function indiaCalendarDate(date: Date) {
  return dateKeyFromParts(date);
}

export function indiaDateWindow(dateKey: string) {
  const start = new Date(dayIndex(dateKey) * DAY_MS - INDIA_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function pathwayModuleWeights(course: PacingCourse, hours: number) {
  if (hours === 120) {
    return course.modules
      .map((module) => ({ module, hours: module.hours120 > 0 ? module.hours120 : module.hours60 }))
      .filter((item) => item.hours > 0);
  }

  const preferred = course.modules.map((module) => ({ module, hours: module.hours60 }));
  const selected = preferred.filter((item) => item.hours > 0);
  if (selected.length) return selected;

  // Some imported plans have all estimates in the other pathway column.
  return course.modules
    .map((module) => ({ module, hours: hours === 60 ? module.hours120 : module.hours60 }))
    .filter((item) => item.hours > 0);
}

function rounded(value: number, decimals = 1) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function allocatedModules(course: PacingCourse, hours: number) {
  const source = pathwayModuleWeights(course, hours);
  const sourceTotal = source.reduce((sum, item) => sum + item.hours, 0);
  if (sourceTotal <= 0) return [];

  let assigned = 0;
  return source.map((item, index) => {
    const estimatedHours = index === source.length - 1
      ? rounded(hours - assigned, 2)
      : rounded(item.hours / sourceTotal * hours, 2);
    assigned += estimatedHours;
    return { ...item, estimatedHours };
  });
}

export function completedHoursFor(course: PacingCourse, hours: number, completedModules: string[]) {
  const completed = new Set(completedModules);
  return allocatedModules(course, hours)
    .filter(({ module }) => completed.has(module.id))
    .reduce((sum, item) => sum + item.estimatedHours, 0);
}

function percentileRank(score: number, scores: number[]) {
  const below = scores.filter((value) => value < score).length;
  const tied = scores.filter((value) => value === score).length;
  return Math.round(((below + tied / 2) / scores.length) * 100);
}

function shiftDate(dateKey: string, days: number) {
  return dateKeyFromDayIndex(dayIndex(dateKey) + days);
}

export function calculatePacing({
  course,
  hours,
  completedModules,
  startedAt,
  cohortScores,
  now = new Date(),
}: {
  course: PacingCourse;
  hours: number;
  completedModules: string[];
  startedAt: Date;
  cohortScores: number[];
  now?: Date;
}) {
  const durationWeeks = hours === 60 ? 8 : 16;
  const durationDays = durationWeeks * 7;
  const totalHours = hours;
  const startDate = indiaCalendarDate(startedAt);
  const today = indiaCalendarDate(now);
  const elapsedDays = Math.max(0, Math.min(durationDays, dayIndex(today) - dayIndex(startDate)));
  const expectedHours = rounded(totalHours * elapsedDays / durationDays, 1);
  const modules = allocatedModules(course, hours);
  const completedSet = new Set(completedModules);
  const exactCompletedHours = modules
    .filter(({ module }) => completedSet.has(module.id))
    .reduce((sum, item) => sum + item.estimatedHours, 0);
  const completedHours = rounded(exactCompletedHours, 1);
  const weeklyHours = totalHours / durationWeeks;
  const hoursPerDay = totalHours / durationDays;
  const deltaHours = rounded(exactCompletedHours - expectedHours, 1);
  const deltaDays = rounded(deltaHours / hoursPerDay, 1);
  const allModulesComplete = modules.length > 0 && modules.every(({ module }) => completedSet.has(module.id));
  const status: PacingStatus = allModulesComplete
    ? "complete"
    : deltaDays >= 1
      ? "ahead"
      : deltaDays <= -1
        ? "behind"
        : "on_track";

  let cumulativeHours = 0;
  const moduleSchedule: ScheduledModule[] = modules.map(({ module, estimatedHours }) => {
    const startWeek = Math.min(durationWeeks, Math.floor(cumulativeHours / weeklyHours) + 1);
    cumulativeHours += estimatedHours;
    const endWeek = Math.min(durationWeeks, Math.max(startWeek, Math.ceil(cumulativeHours / weeklyHours)));
    return {
      moduleId: module.id,
      estimatedHours,
      startWeek,
      endWeek,
      startDate: shiftDate(startDate, (startWeek - 1) * 7),
      endDate: shiftDate(startDate, endWeek * 7 - 1),
    };
  });

  return {
    totalHours,
    durationWeeks,
    startDate,
    targetDate: shiftDate(startDate, durationDays - 1),
    completedHours,
    completedPercent: Math.min(100, Math.round(exactCompletedHours / totalHours * 100)),
    expectedHours,
    expectedPercent: Math.min(100, Math.round(expectedHours / totalHours * 100)),
    deltaHours,
    deltaDays,
    status,
    cohortPercentile: cohortScores.length >= MIN_COHORT_SIZE
      ? percentileRank(exactCompletedHours / totalHours * 100, cohortScores)
      : null,
    moduleSchedule,
  };
}
