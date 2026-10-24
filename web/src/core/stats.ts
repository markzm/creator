import { CG } from './legacy/fields';
import type { DocV6 } from './schema/types';

/**
 * Formats a Date into `YYYY-MM-DD`.
 * Matches legacy `CC.dateStr` in legacy/index.html L3305.
 */
export function dateStr(d: Date = new Date()): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/**
 * Calculates total character count across all worlds, organizations, and characters.
 * Matches legacy `CC.totalChars` in legacy/index.html L3306-L3313.
 */
export function totalChars(doc: DocV6): number {
  let n = 0;
  const cnt = (d?: Record<string, string>) => {
    Object.values(d || {}).forEach((v) => {
      if (typeof v === 'string') n += v.length;
    });
  };
  Object.values(doc.worlds || {}).forEach((w) => cnt(w.data));
  Object.values(doc.orgs || {}).forEach((o) => cnt(o.data));
  Object.values(doc.chars || {}).forEach((c) => cnt(c.data));
  return n;
}

/**
 * Calculates average completion percentage (0..100) of required fields across standard characters.
 * Matches legacy `CC.avgDone` in legacy/index.html L3314-L3321.
 */
export function avgDone(doc: DocV6): number {
  const reqs = CG.flatMap((g) => g.f.filter((f) => f.r));
  const list = Object.values(doc.chars || {}).filter((c) => c.data && !c.templateId);
  if (!list.length || !reqs.length) return 0;
  let sum = 0;
  list.forEach((c) => {
    sum += reqs.filter((f) => (c.data[f.id] || '').trim()).length / reqs.length;
  });
  return Math.round((sum / list.length) * 100);
}

/**
 * Updates or appends today's stats entry in `doc.stats` (retaining up to 120 days).
 * Matches legacy `CC.recordStats` in legacy/index.html L3322-L3332.
 */
export function recordDailyStats(doc: DocV6, now: Date = new Date()): DocV6 {
  const d = dateStr(now);
  const chars = totalChars(doc);
  const done = avgDone(doc);
  if (!doc.stats) doc.stats = [];
  const last = doc.stats[doc.stats.length - 1];
  if (last && last.date === d) {
    last.chars = chars;
    last.done = done;
  } else {
    doc.stats.push({ date: d, chars, done });
    if (doc.stats.length > 120) {
      doc.stats.shift();
    }
  }
  return doc;
}

/**
 * Calculates consecutive active writing days ending on `now`.
 * Matches legacy `CC.streakDays` in legacy/index.html L3333-L3339.
 */
export function streakDays(doc: DocV6, now: Date = new Date()): number {
  const days = new Set((doc.stats || []).map((s) => s.date || (s as any).d));
  let streak = 0;
  const d = new Date(now.getTime());
  while (days.has(dateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
    if (streak > 400) break;
  }
  return streak;
}
