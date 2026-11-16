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
    [getGetDashboardQueryKey(), getListEnrollmentsQueryKey(), getListLogsQueryKey(), getListAiMessagesQueryKey(), getListPracticeQueryKey()].forEach(
      (k) => qc.removeQueries({ queryKey: k }),
    );
    qc.setQueryData(getGetSessionQueryKey(), session);
  };
}

export function applicableModules(course: Course, hours: number): Module[] {
  return course.modules.filter((m) => (hours === 60 ? m.hours60 > 0 : m.hours120 > 0 || m.hours60 > 0));
}

export function progressOf(e: Enrollment) {
  const mods = applicableModules(e.course, e.hours);
  const done = mods.filter((m) => e.completedModules.includes(m.id)).length;
  return {
    mods,
    done,
    modulePct: mods.length ? Math.round((done / mods.length) * 100) : 0,
    hourPct: Math.min(100, Math.round((e.loggedHours / e.hours) * 100)),
  };
}

export function statusLabel(s: string) {
  const k = s.toLowerCase();
  if (k.includes('submit') || k.includes('review')) return 'Awaiting mentor review';
  if (k.includes('draft')) return 'Draft';
  if (k.includes('active') || k.includes('progress')) return 'In progress';
  return s.replace(/_/g, ' ');
}

export const fmtINR = (n: number) => `INR ${n.toLocaleString('en-IN')}`;
