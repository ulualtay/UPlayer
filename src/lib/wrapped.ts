// Data for "Wrapped": a story-style recap of any period, any time.

import type { Track } from '../../shared/types';
import type { PlayEvent } from '../store/history';
import { aggregate, startOfDay, type Agg } from './stats';

export type PeriodKey = 'month' | 'lastMonth' | 'year' | 'last12' | 'all';

export interface Period {
  key: PeriodKey;
  label: string;
  short: string;
  from: number;
  to: number;
}

export function periods(events: PlayEvent[], now = Date.now()): Period[] {
  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const lastMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const yearStart = new Date(d.getFullYear(), 0, 1).getTime();
  const first = events.reduce((m, e) => Math.min(m, e.s), now);
  const month = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return [
    { key: 'month', label: month(monthStart), short: 'This month', from: monthStart, to: now + 1 },
    { key: 'lastMonth', label: month(lastMonthStart), short: 'Last month', from: lastMonthStart, to: monthStart },
    { key: 'year', label: `${d.getFullYear()} so far`, short: 'This year', from: yearStart, to: now + 1 },
    { key: 'last12', label: 'The last 12 months', short: 'Last 12 months', from: startOfDay(now - 364 * 86_400_000), to: now + 1 },
    { key: 'all', label: 'All time', short: 'All time', from: startOfDay(first), to: now + 1 },
  ];
}

export interface Persona {
  title: string;
  line: string;
}

export function persona(agg: Agg): Persona {
  const h = agg.peakHour;
  if (h >= 5 && h < 11) return { title: 'The Early Bird', line: 'Your soundtrack starts before the coffee does.' };
  if (h >= 11 && h < 17) return { title: 'The Daydreamer', line: 'Music keeps you company all day long.' };
  if (h >= 17 && h < 22) return { title: 'The Sunset Chaser', line: 'You wind down every evening with your favorites.' };
  return { title: 'The Night Owl', line: 'Your best listening happens while the world sleeps.' };
}

export interface WrappedSummary {
  period: Period;
  agg: Agg;
  minutes: number;
  topTracks: { track: Track; plays: number; ms: number }[];
  topArtists: { name: string; id?: string; thumb?: string; ms: number; plays: number; songs: number }[];
  topDay: { day: number; ms: number } | null;
  persona: Persona;
  bestNew: Track | null;
  firstTrack: Track | null;
}

export function summarize(all: PlayEvent[], tracks: Record<string, Track>, period: Period): WrappedSummary | null {
  const agg = aggregate(all, tracks, 'all', Date.now(), { from: period.from, to: period.to });
  if (!agg.events.length || agg.totalMs < 60_000) return null;
  const topTracks = [...agg.topTracks]
    .filter((r) => tracks[r.id])
    .sort((a, b) => b.plays - a.plays || b.ms - a.ms)
    .slice(0, 5)
    .map((r) => ({ track: tracks[r.id], plays: r.plays, ms: r.ms }));
  const topArtists = [...agg.topArtists]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5)
    .map((a) => ({ name: a.name, id: a.id, thumb: a.thumb, ms: a.ms, plays: a.plays, songs: a.tracks }));
  const byDay = new Map<number, number>();
  for (const e of agg.events) {
    const k = startOfDay(e.s);
    byDay.set(k, (byDay.get(k) ?? 0) + e.l);
  }
  let topDay: WrappedSummary['topDay'] = null;
  for (const [day, ms] of byDay) if (!topDay || ms > topDay.ms) topDay = { day, ms };
  const firstEvent = agg.events[0];
  return {
    period,
    agg,
    minutes: Math.round(agg.totalMs / 60_000),
    topTracks,
    topArtists,
    topDay,
    persona: persona(agg),
    bestNew: agg.newTracks[0] ? (tracks[agg.newTracks[0].id] ?? null) : null,
    firstTrack: firstEvent ? (tracks[firstEvent.t] ?? null) : null,
  };
}
