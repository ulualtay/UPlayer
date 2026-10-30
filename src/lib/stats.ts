import type { Track } from '../../shared/types';
import { countsAsPlay, type PlayEvent } from '../store/history';
import { weekday } from './format';

export type RangeKey = '7d' | '4w' | '6m' | '1y' | 'all';
export const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '4w', label: 'Last 4 weeks', days: 28 },
  { key: '6m', label: 'Last 6 months', days: 182 },
  { key: '1y', label: 'Last year', days: 365 },
  { key: 'all', label: 'All time', days: null },
];

const DAY = 86_400_000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
/** Monday 00:00 of the week containing ts */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - weekday(d));
  return d.getTime();
}
/** Day number that is stable across DST shifts. */
export const dayIndex = (ts: number) => Math.round((startOfDay(ts) - startOfDay(0)) / DAY);

export interface RankedTrack {
  id: string;
  ms: number;
  plays: number;
}
export interface RankedArtist {
  name: string;
  id?: string;
  ms: number;
  plays: number;
  thumb?: string;
  tracks: number;
}
export interface Session {
  start: number;
  end: number;
  ms: number;
  count: number;
}

export interface Totals {
  totalMs: number;
  plays: number;
  uniqueTracks: number;
  uniqueArtists: number;
}

export interface Agg extends Totals {
  from: number;
  to: number;
  days: number;
  events: PlayEvent[];
  activeDays: number;
  skipRate: number;
  completionRate: number;
  discoveryRate: number;
  newTracks: RankedTrack[];
  bucket: 'day' | 'week';
  series: { ts: number; ms: number }[];
  hourDay: number[][];
  hours: number[];
  weekdays: number[];
  topTracks: RankedTrack[];
  topArtists: RankedArtist[];
  sessions: number;
  longestSession: Session | null;
  avgSessionMs: number;
  longestStreak: { len: number; end: number };
  currentStreak: number;
  /** most plays of one track in a single day; `day` is that day's local midnight */
  repeatDay: { id: string; day: number; count: number } | null;
  peakHour: number;
  peakWeekday: number;
  prev: Totals | null;
}

function totals(events: PlayEvent[], tracks: Record<string, Track>): Totals {
  const ids = new Set<string>();
  const artists = new Set<string>();
  let totalMs = 0;
  let plays = 0;
  for (const e of events) {
    totalMs += e.l;
    if (countsAsPlay(e)) plays++;
    ids.add(e.t);
    const a = tracks[e.t]?.artists[0]?.name;
    if (a) artists.add(a);
  }
  return { totalMs, plays, uniqueTracks: ids.size, uniqueArtists: artists.size };
}

/**
 * Everything the stats page shows, for a preset range, or for an explicit
 * [from, to) window (used by Wrapped; no previous-period comparison then).
 */
export function aggregate(
  all: PlayEvent[],
  tracks: Record<string, Track>,
  range: RangeKey,
  now = Date.now(),
  window?: { from: number; to: number },
): Agg {
  const spec = RANGES.find((r) => r.key === range)!;
  const firstEver = all.reduce((m, e) => Math.min(m, e.s), Infinity);
  if (window) now = Math.min(now, window.to - 1);
  const today = startOfDay(now);
  const from = window
    ? startOfDay(window.from)
    : spec.days
      ? today - (spec.days - 1) * DAY
      : Number.isFinite(firstEver)
        ? startOfDay(firstEver)
        : today;
  const days = Math.max(1, Math.round((today - from) / DAY) + 1);
  const events = all.filter((e) => e.s >= from && e.s <= now);
  const prevEvents = !window && spec.days ? all.filter((e) => e.s >= from - spec.days! * DAY && e.s < from) : null;

  // first time each track was ever heard -> discovery
  const firstSeen = new Map<string, number>();
  for (const e of all) {
    const f = firstSeen.get(e.t);
    if (f === undefined || e.s < f) firstSeen.set(e.t, e.s);
  }

  const base = totals(events, tracks);
  const hourDay = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
  const hours = new Array(24).fill(0) as number[];
  const weekdays = new Array(7).fill(0) as number[];
  const byTrack = new Map<string, RankedTrack>();
  const byArtist = new Map<string, RankedArtist & { set: Set<string>; best: number }>();
  const activeDaySet = new Set<number>();
  const dayRepeat = new Map<string, number>();
  let skips = 0;
  let completes = 0;

  const bucket: 'day' | 'week' = days > 200 ? 'week' : 'day';
  const seriesMap = new Map<number, number>();

  for (const e of events) {
    const d = new Date(e.s);
    const wd = weekday(d);
    const h = d.getHours();
    hourDay[wd][h] += e.l;
    hours[h] += e.l;
    weekdays[wd] += e.l;
    activeDaySet.add(dayIndex(e.s));
    if (e.k === 1 && e.l < 30_000) skips++;
    if (e.k === 0) completes++;

    const key = bucket === 'day' ? startOfDay(e.s) : startOfWeek(e.s);
    seriesMap.set(key, (seriesMap.get(key) ?? 0) + e.l);

    const play = countsAsPlay(e) ? 1 : 0;
    const rt = byTrack.get(e.t) ?? { id: e.t, ms: 0, plays: 0 };
    rt.ms += e.l;
    rt.plays += play;
    byTrack.set(e.t, rt);

    const t = tracks[e.t];
    const artist = t?.artists[0];
    if (artist) {
      const ra = byArtist.get(artist.name) ?? { name: artist.name, id: artist.id, ms: 0, plays: 0, tracks: 0, set: new Set<string>(), best: 0, thumb: t.thumb };
      ra.ms += e.l;
      ra.plays += play;
      ra.set.add(e.t);
      if (!ra.id && artist.id) ra.id = artist.id;
      if (rt.ms > ra.best) {
        ra.best = rt.ms;
        ra.thumb = t.thumb;
      }
      byArtist.set(artist.name, ra);
    }

    if (play) {
      const dk = `${startOfDay(e.s)}|${e.t}`;
      dayRepeat.set(dk, (dayRepeat.get(dk) ?? 0) + 1);
    }
  }

  // continuous series with zero-filled gaps
  const series: { ts: number; ms: number }[] = [];
  const step = bucket === 'day' ? 1 : 7;
  let cursor = bucket === 'day' ? from : startOfWeek(from);
  while (cursor <= today) {
    series.push({ ts: cursor, ms: seriesMap.get(cursor) ?? 0 });
    const d = new Date(cursor);
    d.setDate(d.getDate() + step);
    cursor = d.getTime();
  }

  // sessions: gaps over 10 minutes split them
  let sessions = 0;
  let longestSession: Session | null = null;
  let sessionMsTotal = 0;
  let cur: Session | null = null;
  for (const e of events) {
    if (cur && e.s - cur.end <= 10 * 60_000) {
      cur.end = Math.max(cur.end, e.s + e.l);
      cur.ms += e.l;
      cur.count++;
    } else {
      if (cur) {
        sessions++;
        sessionMsTotal += cur.ms;
        if (!longestSession || cur.ms > longestSession.ms) longestSession = cur;
      }
      cur = { start: e.s, end: e.s + e.l, ms: e.l, count: 1 };
    }
  }
  if (cur) {
    sessions++;
    sessionMsTotal += cur.ms;
    if (!longestSession || cur.ms > longestSession.ms) longestSession = cur;
  }

  // streaks
  const sortedDays = [...activeDaySet].sort((a, b) => a - b);
  let longestStreak = { len: 0, end: 0 };
  let run = 0;
  for (let i = 0; i < sortedDays.length; i++) {
    run = i > 0 && sortedDays[i] === sortedDays[i - 1] + 1 ? run + 1 : 1;
    if (run > longestStreak.len) longestStreak = { len: run, end: sortedDays[i] };
  }
  const allDays = new Set(all.map((e) => dayIndex(e.s)));
  let currentStreak = 0;
  let day = dayIndex(now);
  if (!allDays.has(day)) day--; // not having listened *yet* today doesn't break the streak
  while (allDays.has(day)) {
    currentStreak++;
    day--;
  }

  let repeatDay: Agg['repeatDay'] = null;
  for (const [k, count] of dayRepeat) {
    if (!repeatDay || count > repeatDay.count) {
      const [day, id] = k.split('|');
      repeatDay = { id, day: Number(day), count };
    }
  }

  const topTracks = [...byTrack.values()];
  const newTracks = topTracks.filter((r) => (firstSeen.get(r.id) ?? 0) >= from).sort((a, b) => b.ms - a.ms);

  return {
    ...base,
    from,
    to: now,
    days,
    events,
    activeDays: activeDaySet.size,
    skipRate: events.length ? skips / events.length : 0,
    completionRate: events.length ? completes / events.length : 0,
    discoveryRate: byTrack.size ? newTracks.length / byTrack.size : 0,
    newTracks,
    bucket,
    series,
    hourDay,
    hours,
    weekdays,
    topTracks,
    topArtists: [...byArtist.values()].map(({ set, best: _best, ...a }) => ({ ...a, tracks: set.size })),
    sessions,
    longestSession,
    avgSessionMs: sessions ? sessionMsTotal / sessions : 0,
    longestStreak,
    currentStreak,
    repeatDay: repeatDay && repeatDay.count >= 3 ? repeatDay : null,
    peakHour: hours.indexOf(Math.max(...hours)),
    peakWeekday: weekdays.indexOf(Math.max(...weekdays)),
    prev: prevEvents ? totals(prevEvents, tracks) : null,
  };
}

/** Last 53 weeks of daily listening, Monday-first columns, for the year overview. */
export function yearCalendar(all: PlayEvent[], now = Date.now()) {
  const end = startOfDay(now);
  const start = startOfWeek(end - 52 * 7 * DAY);
  const map = new Map<number, number>();
  for (const e of all) {
    if (e.s < start) continue;
    const k = dayIndex(e.s);
    map.set(k, (map.get(k) ?? 0) + e.l);
  }
  const weeks: { ts: number; ms: number; future: boolean }[][] = [];
  let cursor = start;
  while (cursor <= end) {
    const col: { ts: number; ms: number; future: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      col.push({ ts: cursor, ms: map.get(dayIndex(cursor)) ?? 0, future: cursor > end });
      const d = new Date(cursor);
      d.setDate(d.getDate() + 1);
      cursor = d.getTime();
    }
    weeks.push(col);
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  const active = [...map.values()].filter((v) => v > 0).length;
  return { weeks, total, active };
}

/** Quantile thresholds for 4 non-zero intensity steps. */
export function levels(values: number[]): number[] {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!nz.length) return [1, 2, 3];
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))];
  return [q(0.25), q(0.5), q(0.75)];
}
export function levelOf(v: number, th: number[]): number {
  if (v <= 0) return 0;
  if (v <= th[0]) return 1;
  if (v <= th[1]) return 2;
  if (v <= th[2]) return 3;
  return 4;
}
