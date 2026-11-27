import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetSession,
  getGetSessionQueryKey,
  getGetDashboardQueryKey,
  getListEnrollmentsQueryKey,
  getListLogsQueryKey,
  getListAiMessagesQueryKey,
  getListPracticeQueryKey,
  type Enrollment,
  type Course,
  type Module,
  type Session,
} from '@workspace/api-client-react';

export function useAuth() {
  const q = useGetSession();
  return { user: q.data?.user ?? null, isLoading: q.isLoading, error: q.error };
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Adhyayaan`;
  }, [title]);
}

export function errMsg(e: unknown): string {
  const anyE = e as { data?: { error?: string; message?: string }; message?: string } | null;
  const d = anyE?.data;
  if (d && typeof d === 'object') {
    if (typeof d.error === 'string') return d.error;
    if (typeof d.message === 'string') return d.message;
  }
  return anyE?.message || 'Something went wrong. Please try again.';
}

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [getGetDashboardQueryKey(), getListEnrollmentsQueryKey(), getListLogsQueryKey(), getListAiMessagesQueryKey(), getListPracticeQueryKey()].map(
        (k) => qc.invalidateQueries({ queryKey: k }),
      ),
    );
}

export function useResetForSession() {
  const qc = useQueryClient();
  return (session: Session) => {
    qc.removeQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && /^\/api\/(study\/|assessment(?:\/|$)|admin\/|guide\/)/.test(q.queryKey[0]) });
    [getGetDashboardQueryKey(), getListEnrollmentsQueryKey(), getListLogsQueryKey(), getListAiMessagesQueryKey(), getListPracticeQueryKey()].forEach(
      (k) => qc.removeQueries({ queryKey: k }),
    );
    qc.setQueryData(getGetSessionQueryKey(), session);
  };
}

export function applicableModules(course: Course, hours: number): Module[] {
  return pathwayModulePlan(course, hours).map((item) => item.module);
}

export function pathwayModulePlan(course: Course, hours: number) {
  const preferred = course.modules.map((module) => ({
    module,
    hours: hours === 120
      ? (module.hours120 > 0 ? module.hours120 : module.hours60)
      : module.hours60,
  }));
  const selected = preferred.filter((item) => item.hours > 0);
  const source = selected.length ? selected : course.modules
    .map((module) => ({ module, hours: hours === 60 ? module.hours120 : module.hours60 }))
    .filter((item) => item.hours > 0);
  const sourceTotal = source.reduce((sum, item) => sum + item.hours, 0);
  if (!sourceTotal) return [];

  const durationWeeks = hours === 60 ? 8 : 16;
  const weeklyHours = hours / durationWeeks;
  let assignedHours = 0;
  let cumulativeHours = 0;
  return source.map((item, index) => {
    const estimatedHours = index === source.length - 1
      ? Math.round((hours - assignedHours) * 100) / 100
      : Math.round((item.hours / sourceTotal * hours) * 100) / 100;
    assignedHours += estimatedHours;
    const startWeek = Math.min(durationWeeks, Math.floor(cumulativeHours / weeklyHours) + 1);
    cumulativeHours += estimatedHours;
    const endWeek = Math.min(durationWeeks, Math.max(startWeek, Math.ceil(cumulativeHours / weeklyHours)));
    return { module: item.module, estimatedHours, startWeek, endWeek };
  });
}

export function progressOf(e: Enrollment) {
  const schedule = new Set(e.pacing.moduleSchedule.map((item) => item.moduleId));
  const mods = e.course.modules.filter((module) => schedule.has(module.id));
  const done = mods.filter((m) => e.completedModules.includes(m.id)).length;
  return {
    mods,
    done,
    modulePct: e.pacing.completedPercent,
    hourPct: Math.min(100, Math.round((e.loggedHours / e.hours) * 100)),
  };
}

export function pacingLabel(status: string, deltaDays: number) {
  if (status === 'complete') return 'All modules complete';
  if (status === 'ahead') return `Ahead by ${Math.max(1, Math.round(Math.abs(deltaDays)))} ${Math.round(Math.abs(deltaDays)) === 1 ? 'day' : 'days'}`;
  if (status === 'behind') return `Behind by ${Math.max(1, Math.round(Math.abs(deltaDays)))} ${Math.round(Math.abs(deltaDays)) === 1 ? 'day' : 'days'}`;
  return 'On track';
}

export function ordinal(value: number) {
  const remainder100 = value % 100;
  const suffix = remainder100 >= 11 && remainder100 <= 13
    ? 'th'
    : value % 10 === 1
      ? 'st'
      : value % 10 === 2
        ? 'nd'
        : value % 10 === 3
          ? 'rd'
          : 'th';
  return `${value}${suffix}`;
}

export function formatIndiaDate(date: string, includeYear = false) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(new Date(`${date}T12:00:00+05:30`));
}

export function formatHours(hours: number) {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function statusLabel(s: string) {
  const k = s.toLowerCase();
  if (k.includes('submit') || k.includes('review')) return 'Awaiting mentor review';
  if (k.includes('draft')) return 'Draft';
  if (k.includes('active') || k.includes('progress')) return 'In progress';
  return s.replace(/_/g, ' ');
}

export const fmtINR = (n: number) => `INR ${n.toLocaleString('en-IN')}`;

/** Accept only same-app relative paths; reject protocol-relative, backslash, auth loops. */
export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  let v = raw.trim();
  try { v = decodeURIComponent(v); } catch { return fallback; }
  if (!v.startsWith('/') || v.startsWith('//') || v.includes('\\') || /[\u0000-\u001f]/.test(v)) return fallback;
  if (/^\/(login|register)(\/|\?|#|$)/.test(v)) return fallback;
  if (v.length > 500) return fallback;
  return v;
}

export function authHref(kind: 'login' | 'register', next?: string | null) {
  const n = safeNext(next, '');
  return n && n !== '/' ? `/${kind}?next=${encodeURIComponent(n)}` : `/${kind}`;
}

export function assessmentHref(next?: string | null) {
  const n = safeNext(next, '/');
  if (/^\/assessment(?:\?|#|$)/.test(n)) return n;
  return n !== '/' && !/^\/assessment(?:[/?#]|$)/.test(n) ? `/assessment?next=${encodeURIComponent(n)}` : '/assessment';
}
