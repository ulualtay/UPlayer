import type { Track } from '../../shared/types';
import { api } from './api';
import { useHistory, type PlayEvent } from '../store/history';
import { useLibrary } from '../store/library';

const SEEDS = ['Tarkan', 'Sezen Aksu', 'Duman', 'maNga', 'Mor ve Ötesi', 'Teoman', 'The Weeknd', 'Daft Punk', 'Dua Lipa', 'Arctic Monkeys', 'Billie Eilish', 'Coldplay'];

/** Mulberry32: tiny seeded PRNG so a demo looks the same if regenerated. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds ~6 months of plausible listening history from real YouTube tracks,
 * so the stats page can be explored before there is real data. Every event
 * is flagged `demo` and can be removed in one click.
 */
export async function generateDemoHistory(onProgress?: (text: string) => void): Promise<number> {
  const pool: Track[] = [];
  for (const [i, artist] of SEEDS.entries()) {
    onProgress?.(`Fetching songs: ${artist} (${i + 1}/${SEEDS.length})`);
    try {
      const res = await api.search(artist);
      pool.push(...res.videos.filter((t) => t.duration > 60 && t.duration < 900).slice(0, 7));
    } catch {
      /* skip this artist */
    }
  }
  if (pool.length < 10) throw new Error('Could not fetch enough songs from YouTube');
  useLibrary.getState().remember(pool);

  const rand = rng(20261018);
  const days = 182;
  const now = Date.now();
  const events: PlayEvent[] = [];
  // Hour-of-day preference: commute, lunch and a strong evening peak.
  const hourWeight = [2, 1, 0.5, 0.2, 0.1, 0.2, 1, 4, 6, 4, 3, 3, 4, 5, 3, 3, 3, 4, 5, 6, 8, 9, 8, 5];
  const hourTotal = hourWeight.reduce((a, b) => a + b, 0);
  const pickHour = () => {
    let r = rand() * hourTotal;
    for (let h = 0; h < 24; h++) if ((r -= hourWeight[h]) <= 0) return h;
    return 21;
  };
  // Taste drifts: each artist group has a "season" when it is favoured.
  const artists = [...new Set(pool.map((t) => t.artists[0].name))];
  const phase = new Map(artists.map((a, i) => [a, (i / artists.length) * Math.PI * 2]));

  for (let d = days; d >= 0; d--) {
    const day = new Date(now - d * 86400000);
    const dow = (day.getDay() + 6) % 7;
    if (rand() < 0.12) continue; // some days off
    const sessions = 1 + Math.floor(rand() * (dow >= 5 ? 4 : 3));
    for (let s = 0; s < sessions; s++) {
      const start = new Date(day);
      start.setHours(pickHour(), Math.floor(rand() * 60), 0, 0);
      let t = start.getTime();
      if (t > now) continue;
      const len = 3 + Math.floor(rand() * 12);
      for (let k = 0; k < len; k++) {
        // weight tracks by favourite rank and the artist's current season
        let best = pool[0];
        let bestScore = -1;
        for (let j = 0; j < 6; j++) {
          const cand = pool[Math.floor(Math.pow(rand(), 1.8) * pool.length)];
          const season = 1 + Math.sin((d / days) * Math.PI * 2 + (phase.get(cand.artists[0].name) ?? 0));
          const score = season * (0.5 + rand());
          if (score > bestScore) {
            bestScore = score;
            best = cand;
          }
        }
        const dur = best.duration * 1000;
        const skipped = rand() < 0.14;
        const listened = skipped ? 4000 + rand() * 25000 : rand() < 0.8 ? dur : dur * (0.55 + rand() * 0.4);
        events.push({ t: best.id, s: t, l: Math.round(listened), d: best.duration, k: skipped || listened < dur - 3000 ? 1 : 0, demo: 1 });
        t += listened + 1500;
        if (t > now) break;
      }
    }
  }
  useHistory.getState().addMany(events);
  return events.length;
}
