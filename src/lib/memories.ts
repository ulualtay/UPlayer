// "On this day" and "forgotten favorites": resurfacing music from your own history.

import type { Track } from '../../shared/types';
import { countsAsPlay, type PlayEvent } from '../store/history';
import { fmtDate } from './format';
import { startOfDay } from './stats';

const DAY = 86_400_000;

export interface Memory {
  title: string;
  sub: string;
  tracks: Track[];
}

function rankTracks(events: PlayEvent[], tracks: Record<string, Track>, limit = 20): Track[] {
  const score = new Map<string, number>();
  for (const e of events) score.set(e.t, (score.get(e.t) ?? 0) + e.l);
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => tracks[id])
    .filter((t): t is Track => !!t)
    .slice(0, limit);
}

/**
 * What you were playing on this date a year ago. Young histories fall back to
 * 6 months / 3 months / a month ago so the shelf shows up early.
 */
export function onThisDay(events: PlayEvent[], tracks: Record<string, Track>, now = Date.now()): Memory | null {
  const windows: { days: number; spread: number; title: string }[] = [
    { days: 365, spread: 0, title: 'On this day last year' },
    { days: 365, spread: 3, title: 'This week last year' },
    { days: 182, spread: 1, title: 'Six months ago' },
    { days: 91, spread: 1, title: 'Three months ago' },
    { days: 30, spread: 1, title: 'A month ago' },
  ];
  for (const w of windows) {
    const day = startOfDay(now - w.days * DAY);
    const from = day - w.spread * DAY;
    const to = day + (w.spread + 1) * DAY;
    const hits = events.filter((e) => e.s >= from && e.s < to && countsAsPlay(e));
    const list = rankTracks(hits, tracks);
    if (list.length >= 4) {
      const sub =
        w.spread === 0
          ? fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
          : `${fmtDate(from, { month: 'short', day: 'numeric' })} – ${fmtDate(to - DAY, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      return { title: w.title, sub, tracks: list };
    }
  }
  return null;
}

/** Songs you played a lot and then dropped. */
export function forgottenFavorites(events: PlayEvent[], tracks: Record<string, Track>, now = Date.now()): Memory | null {
  if (!events.length) return null;
  const first = events.reduce((m, e) => Math.min(m, e.s), Infinity);
  // "forgotten" scales with how long we've known you: 3 weeks to 2 months
  const idle = Math.min(60 * DAY, Math.max(21 * DAY, (now - first) * 0.25));
  const stats = new Map<string, { plays: number; last: number }>();
  for (const e of events) {
    const s = stats.get(e.t) ?? { plays: 0, last: 0 };
    if (countsAsPlay(e)) s.plays++;
    s.last = Math.max(s.last, e.s);
    stats.set(e.t, s);
  }
  const list = [...stats.entries()]
    .filter(([, s]) => s.plays >= 4 && now - s.last > idle)
    .sort((a, b) => b[1].plays - a[1].plays)
    .map(([id]) => tracks[id])
    .filter((t): t is Track => !!t)
    .slice(0, 20);
  if (list.length < 3) return null;
  return { title: 'Forgotten favorites', sub: `You loved these, then haven't played them in ${Math.round(idle / DAY)}+ days`, tracks: list };
}
