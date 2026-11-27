const DATE_ONLY_PATTERN = /^(\d{4}-\d{2}-\d{2})$/;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/;
const DATE_UNAVAILABLE = 'Date not available';

function indiaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function estimateIndiaTargetDate(hours: 60 | 120, startedAt = new Date()) {
  const [year, month, day] = indiaDateKey(startedAt).split('-').map(Number);
  const durationDays = (hours === 60 ? 8 : 16) * 7;
  return new Date(Date.UTC(year, month - 1, day + durationDays - 1)).toISOString().slice(0, 10);
}

export function formatIndiaDate(date: string | null | undefined, includeYear = false) {
  if (typeof date !== 'string' || !date.trim()) return DATE_UNAVAILABLE;

  const value = date.trim();
  const dateOnly = DATE_ONLY_PATTERN.exec(value);
  const datePrefix = ISO_DATE_PREFIX_PATTERN.exec(value)?.[1];
  const calendarDate = dateOnly?.[1] ?? datePrefix;

  if (calendarDate) {
    const indiaMidday = new Date(`${calendarDate}T12:00:00+05:30`);
    if (
      Number.isNaN(indiaMidday.getTime()) ||
      indiaMidday.toISOString().slice(0, 10) !== calendarDate
    ) {
      return DATE_UNAVAILABLE;
    }
  }

  const parsed = dateOnly
    ? new Date(`${value}T12:00:00+05:30`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) return DATE_UNAVAILABLE;

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(parsed);
}
