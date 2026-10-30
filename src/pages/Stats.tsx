import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Flame, FlaskConical, Moon, Play, Repeat2, Sparkles, Sun, Sunrise, SunMedium, Telescope, Timer, Zap } from 'lucide-react';
import type { Track } from '../../shared/types';
import { aggregate, levelOf, levels, RANGES, yearCalendar, type Agg, type RangeKey } from '../lib/stats';
import { WEEKDAYS, WEEKDAYS_LONG, artistsText, count, fmtDate, fmtListen, nf, nf1, relTime } from '../lib/format';
import { play } from '../lib/actions';
import { generateDemoHistory } from '../lib/demo';
import { useHistory } from '../store/history';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { toast } from '../store/ui';
import { AreaChart, CalendarGrid, Columns, HeatGrid, LevelLegend } from '../components/charts';
import { Cover, Pill, Spinner, cx } from '../components/ui';

type Metric = 'ms' | 'plays';

const hoursOf = (ms: number) => ms / 3_600_000;
/** Axis steps that read as clock time: 5/10/15/30 min, 1/2/3/4/6/8/12 h, then days. */
const TIME_STEPS = [5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 720, 1440, 2880].map((m) => m * 60_000);
const timeStep = (max: number) => TIME_STEPS.find((s) => s * 4 >= max) ?? Math.ceil(max / 4 / 86_400_000) * 86_400_000;
const fmtAxisHours = (ms: number) => {
  const h = hoursOf(ms);
  if (h === 0) return '0';
  if (h < 1) return `${Math.round(ms / 60000)} min`;
  return `${nf1.format(h)} hr`;
};

export function StatsPage() {
  const events = useHistory((s) => s.events);
  const tracks = useLibrary((s) => s.tracks);
  const [range, setRange] = useState<RangeKey>('4w');
  const [metric, setMetric] = useState<Metric>('ms');

  const agg = useMemo(() => aggregate(events, tracks, range), [events, tracks, range]);
  const year = useMemo(() => yearCalendar(events), [events]);

  if (!events.length) return <EmptyStats />;

  return (
    <div className="pb-16">
      <header className="relative overflow-hidden px-6 pb-6 pt-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_60%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-fg-2">Your listening habits</div>
            <h1 className="text-[44px] font-extrabold leading-tight tracking-tight">Stats</h1>
          </div>
          <Link
            to="/wrapped"
            className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink transition hover:scale-105"
          >
            <Sparkles className="h-4 w-4" /> Open Wrapped
          </Link>
        </div>
        <YearOverview year={year} />
      </header>

      {/* one filter row scopes everything below it */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-panel px-6 py-3 backdrop-blur-xl">
        {RANGES.map((r) => (
          <Pill key={r.key} active={range === r.key} onClick={() => setRange(r.key)}>
            {r.label}
          </Pill>
        ))}
        <div className="ml-auto flex items-center gap-1 rounded-full bg-surface-2 p-1 text-sm">
          {(
            [
              ['ms', 'By time'],
              ['plays', 'By plays'],
            ] as [Metric, string][]
          ).map(([k, l]) => (
            <button key={k} onClick={() => setMetric(k)} className={cx('rounded-full px-3 py-1 font-medium transition', metric === k ? 'bg-fg text-bg' : 'text-fg-2 hover:text-fg')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6 px-6 pt-6">
        {agg.events.length === 0 ? (
          <div className="rounded-xl bg-surface-2 p-10 text-center text-fg-2">No listening in this period. Try a longer range.</div>
        ) : (
          <>
            <Overview agg={agg} />
            <Card title="Listening time" sub={agg.bucket === 'week' ? 'Weekly total' : 'Daily total'} table={<SeriesTable agg={agg} />}>
              <AreaChart
                data={agg.series.map((p) => ({ ts: p.ts, v: p.ms }))}
                format={fmtAxisHours}
                stepFor={timeStep}
                label={(ts) => (agg.bucket === 'week' ? `Week of ${fmtDate(ts, { month: 'short', day: 'numeric' })}` : fmtDate(ts, { weekday: 'long', day: 'numeric', month: 'long' }))}
                tick={(ts) => fmtDate(ts, agg.days > 60 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' })}
              />
            </Card>
            <div className="grid gap-6 @4xl:grid-cols-2">
              <TopTracks agg={agg} metric={metric} tracks={tracks} />
              <TopArtists agg={agg} metric={metric} />
            </div>
            <WhenYouListen agg={agg} />
            <div className="grid gap-6 @4xl:grid-cols-2">
              <Card title="Hours of the day" sub={`Busiest hour: ${String(agg.peakHour).padStart(2, '0')}:00`}>
                <Columns
                  values={agg.hours}
                  labels={agg.hours.map((_, h) => String(h).padStart(2, '0'))}
                  tickEvery={3}
                  format={fmtListen}
                  tipLabel={(h) => `${String(h).padStart(2, '0')}:00 – ${String((h + 1) % 24).padStart(2, '0')}:00`}
                />
              </Card>
              <Card title="Days of the week" sub={`You listen most on ${WEEKDAYS_LONG[agg.peakWeekday]}s`}>
                <Columns values={agg.weekdays} labels={WEEKDAYS} format={fmtListen} tipLabel={(d) => WEEKDAYS_LONG[d]} />
              </Card>
            </div>
            <Persona agg={agg} tracks={tracks} />
            <Discoveries agg={agg} tracks={tracks} />
            <HistoryTable agg={agg} tracks={tracks} />
          </>
        )}
      </div>
    </div>
  );
}

// ---------- pieces ----------

function Card({ title, sub, children, action, table }: { title: string; sub?: string; children: ReactNode; action?: ReactNode; table?: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="rounded-xl bg-surface-2/70 p-5 ring-1 ring-line">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {sub && <p className="text-sm text-fg-2">{sub}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {table && (
            <div className="flex rounded-full bg-surface-3 p-0.5 text-xs">
              {['Chart', 'Table'].map((l, i) => (
                <button key={l} onClick={() => setAsTable(i === 1)} className={cx('rounded-full px-2.5 py-1 font-medium', asTable === (i === 1) ? 'bg-fg text-bg' : 'text-fg-2 hover:text-fg')}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {asTable && table ? table : children}
    </section>
  );
}

function Delta({ now, prev }: { now: number; prev: number | undefined }) {
  if (prev === undefined) return null;
  if (prev === 0) return now > 0 ? <span className="text-xs text-fg-3">no data for the previous period</span> : null;
  const pct = ((now - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-fg-2">
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{nf.format(Math.abs(Math.round(pct)))}% vs previous period
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2/70 p-4 ring-1 ring-line">
      <div className="text-sm text-fg-2">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function Overview({ agg }: { agg: Agg }) {
  const p = agg.prev ?? undefined;
  return (
    <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
      <div className="relative overflow-hidden rounded-xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent)_30%,var(--surface-2)),var(--surface-2))] p-6 ring-1 ring-line">
        <div className="text-sm font-semibold text-fg-2">Total listening</div>
        <div className="mt-2 whitespace-nowrap font-extrabold leading-none tracking-tight" style={{ fontSize: 'clamp(2.25rem, 4.2vw, 3.75rem)' }}>
          {fmtListen(agg.totalMs)}
        </div>
        <div className="mt-2 text-sm text-fg-2">
          {nf.format(Math.round(agg.totalMs / 60000))} minutes • active on {agg.activeDays} of {agg.days} days
        </div>
        <div className="mt-3">
          <Delta now={agg.totalMs} prev={p?.totalMs} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 @2xl:grid-cols-3">
        <Tile label="Plays" value={nf.format(agg.plays)} sub={<Delta now={agg.plays} prev={p?.plays} />} />
        <Tile label="Different songs" value={nf.format(agg.uniqueTracks)} sub={<Delta now={agg.uniqueTracks} prev={p?.uniqueTracks} />} />
        <Tile label="Different artists" value={nf.format(agg.uniqueArtists)} sub={<Delta now={agg.uniqueArtists} prev={p?.uniqueArtists} />} />
        <Tile label="Per active day" value={fmtListen(agg.activeDays ? agg.totalMs / agg.activeDays : 0)} sub={<span className="text-xs text-fg-3">{agg.sessions} sessions, avg {fmtListen(agg.avgSessionMs)}</span>} />
        <Tile
          label="Longest streak"
          value={count(agg.longestStreak.len, 'day')}
          sub={<span className="text-xs text-fg-3">{agg.currentStreak > 0 ? `Current streak: ${count(agg.currentStreak, 'day')}` : 'Listen today to start a new streak'}</span>}
        />
        <Tile
          label="Early skips"
          value={`${Math.round(agg.skipRate * 100)}%`}
          sub={<span className="text-xs text-fg-3">{Math.round(agg.completionRate * 100)}% played to the end</span>}
        />
      </div>
    </div>
  );
}

function SeriesTable({ agg }: { agg: Agg }) {
  const rows = [...agg.series].reverse().filter((r) => r.ms > 0);
  return (
    <div className="scroll-area max-h-[260px]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-2 text-left text-fg-2">
          <tr>
            <th className="py-1.5 font-medium">{agg.bucket === 'week' ? 'Week' : 'Day'}</th>
            <th className="py-1.5 text-right font-medium">Time</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.ts} className="border-t border-line">
              <td className="py-1.5">{fmtDate(r.ts, { weekday: agg.bucket === 'day' ? 'short' : undefined, day: 'numeric', month: 'short', year: 'numeric' })}</td>
              <td className="py-1.5 text-right">{fmtListen(r.ms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankRow({ rank, thumb, round, title, sub, value, share, onClick, to }: { rank: number; thumb?: string; round?: boolean; title: string; sub: string; value: string; share: number; onClick?: () => void; to?: string }) {
  const inner = (
    <>
      <span className={cx('w-6 text-center font-bold tabular-nums', rank <= 3 ? 'text-lg text-fg' : 'text-fg-2')}>{rank}</span>
      <Cover src={thumb} size={96} round={round} className="h-11 w-11" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-sm text-fg-2">{sub}</div>
        <div className="mt-1.5 h-1 rounded-full bg-[color-mix(in_oklab,var(--text)_8%,transparent)]">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, share * 100)}%` }} />
        </div>
      </div>
      <span className="w-20 text-right text-sm tabular-nums text-fg-2">{value}</span>
    </>
  );
  const cls = 'group flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-3';
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function TopTracks({ agg, metric, tracks }: { agg: Agg; metric: Metric; tracks: Record<string, Track> }) {
  const [all, setAll] = useState(false);
  const ranked = [...agg.topTracks].filter((r) => tracks[r.id]).sort((a, b) => b[metric] - a[metric] || b.ms - a.ms);
  const top = ranked.slice(0, all ? 50 : 10);
  const max = top[0]?.[metric] || 1;
  const list = top.map((r) => tracks[r.id]);
  return (
    <Card
      title="Top songs"
      sub={`Out of ${count(ranked.length, 'song')}`}
      action={
        list.length > 0 && (
          <button
            onClick={() => play(list, 0, { type: 'other', id: `stats-top-${agg.from}`, name: 'Your top songs', path: '/stats' })}
            className="flex items-center gap-1.5 rounded-full bg-fg px-3 py-1.5 text-xs font-bold text-bg transition hover:scale-105"
          >
            <Play className="h-3.5 w-3.5" fill="currentColor" strokeWidth={0} /> Play all
          </button>
        )
      }
    >
      <div className="space-y-0.5">
        {top.map((r, i) => {
          const t = tracks[r.id];
          return (
            <RankRow
              key={r.id}
              rank={i + 1}
              thumb={t.thumb}
              title={t.title}
              sub={artistsText(t)}
              value={metric === 'ms' ? fmtListen(r.ms) : `${nf.format(r.plays)} plays`}
              share={r[metric] / max}
              onClick={() => play(list, i, { type: 'other', id: `stats-top-${agg.from}`, name: 'Your top songs', path: '/stats' })}
            />
          );
        })}
      </div>
      {ranked.length > 10 && (
        <button onClick={() => setAll(!all)} className="mt-2 px-2 text-sm font-bold text-fg-2 hover:text-fg">
          {all ? 'Show less' : `Show top ${Math.min(50, ranked.length)}`}
        </button>
      )}
    </Card>
  );
}

function TopArtists({ agg, metric }: { agg: Agg; metric: Metric }) {
  const [all, setAll] = useState(false);
  const ranked = [...agg.topArtists].sort((a, b) => b[metric] - a[metric] || b.ms - a.ms);
  const top = ranked.slice(0, all ? 50 : 10);
  const max = top[0]?.[metric] || 1;
  const share = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <Card title="Top artists" sub={`Out of ${nf.format(ranked.length)} artists`}>
      <div className="space-y-0.5">
        {top.map((a, i) => (
          <RankRow
            key={a.name}
            rank={i + 1}
            thumb={a.thumb}
            round
            title={a.name}
            sub={`${count(a.tracks, 'song')} • ${share(a.ms, agg.totalMs)}% of your listening`}
            value={metric === 'ms' ? fmtListen(a.ms) : `${nf.format(a.plays)} plays`}
            share={a[metric] / max}
            to={a.id ? `/artist/${a.id}` : `/search/${encodeURIComponent(a.name)}`}
          />
        ))}
      </div>
      {ranked.length > 10 && (
        <button onClick={() => setAll(!all)} className="mt-2 px-2 text-sm font-bold text-fg-2 hover:text-fg">
          {all ? 'Show less' : `Show top ${Math.min(50, ranked.length)}`}
        </button>
      )}
    </Card>
  );
}

function WhenYouListen({ agg }: { agg: Agg }) {
  const flat = agg.hourDay.flat();
  const th = levels(flat);
  const peak = flat.indexOf(Math.max(...flat));
  const pd = Math.floor(peak / 24);
  const ph = peak % 24;
  return (
    <Card title="When do you listen?" sub={`Peak: ${WEEKDAYS_LONG[pd]}s around ${String(ph).padStart(2, '0')}:00`} action={<LevelLegend />}>
      <HeatGrid
        rows={agg.hourDay}
        rowLabels={WEEKDAYS}
        colLabels={Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h).padStart(2, '0') : null))}
        level={(v) => levelOf(v, th)}
        tip={(r, c) => (
          <>
            <div className="text-sm font-bold text-fg">{fmtListen(agg.hourDay[r][c])}</div>
            <div className="text-fg-2">
              {WEEKDAYS_LONG[r]} {String(c).padStart(2, '0')}:00–{String((c + 1) % 24).padStart(2, '0')}:00
            </div>
          </>
        )}
      />
    </Card>
  );
}

function YearOverview({ year }: { year: ReturnType<typeof yearCalendar> }) {
  const th = levels(year.weeks.flat().map((d) => d.ms));
  return (
    <div className="relative mt-6 rounded-xl bg-surface-2/60 p-5 ring-1 ring-line backdrop-blur">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Last 12 months</h2>
          <p className="text-sm text-fg-2">
            {fmtListen(year.total)} of listening on {count(year.active, 'day')}
          </p>
        </div>
        <LevelLegend />
      </div>
      <CalendarGrid
        weeks={year.weeks}
        level={(v) => levelOf(v, th)}
        monthLabel={(ts) => fmtDate(ts, { month: 'short' })}
        tip={(d) => (
          <>
            <div className="text-sm font-bold text-fg">{d.ms ? fmtListen(d.ms) : 'No listening'}</div>
            <div className="text-fg-2">{fmtDate(d.ts, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </>
        )}
      />
    </div>
  );
}

function Persona({ agg, tracks }: { agg: Agg; tracks: Record<string, Track> }) {
  const h = agg.peakHour;
  const time =
    h >= 5 && h < 11
      ? { icon: Sunrise, title: 'Early bird', text: 'You start the day with music; mornings are your peak.' }
      : h >= 11 && h < 17
        ? { icon: SunMedium, title: 'Daytime listener', text: 'Music keeps you company all day, peaking in the afternoon.' }
        : h >= 17 && h < 22
          ? { icon: Sun, title: 'Evening unwinder', text: 'You wind down with music; evenings belong to you.' }
          : { icon: Moon, title: 'Night owl', text: 'You listen while everyone sleeps, peaking around midnight.' };
  const d = agg.discoveryRate;
  const explore =
    d > 0.5
      ? { icon: Telescope, title: 'Explorer', text: `${Math.round(d * 100)}% of the songs you played are new discoveries.` }
      : d < 0.2
        ? { icon: Repeat2, title: 'Loyal listener', text: `You come back to what you love; only ${Math.round(d * 100)}% is new.` }
        : { icon: Sparkles, title: 'Balanced', text: `You mix new and familiar; ${Math.round(d * 100)}% of your songs are new.` };
  const skip =
    agg.skipRate > 0.3
      ? { icon: Zap, title: 'Restless thumb', text: `You skip ${Math.round(agg.skipRate * 100)}% of songs within 30 seconds.` }
      : { icon: Timer, title: 'Till the end', text: `You play ${Math.round(agg.completionRate * 100)}% of songs all the way through.` };
  const rep = agg.repeatDay && tracks[agg.repeatDay.id];
  const cards = [time, explore, skip];
  if (rep && agg.repeatDay) {
    cards.push({
      icon: Flame,
      title: 'On repeat',
      text: `On ${fmtDate(agg.repeatDay.day, { month: 'long', day: 'numeric' })} you played “${rep.title}” ${agg.repeatDay.count} times.`,
    });
  }
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">Your listener profile</h2>
      <div className="grid gap-4 @lg:grid-cols-2 @5xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.title} className="rounded-xl bg-surface-2/70 p-5 ring-1 ring-line">
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-accent">
              <c.icon className="h-5 w-5" />
            </span>
            <div className="text-lg font-bold">{c.title}</div>
            <p className="mt-1 text-sm text-fg-2">{c.text}</p>
          </div>
        ))}
      </div>
      {agg.longestSession && (
        <p className="mt-3 text-sm text-fg-2">
          Your longest session was on {fmtDate(agg.longestSession.start, { weekday: 'long', month: 'long', day: 'numeric' })}: {count(agg.longestSession.count, 'song')}, {fmtListen(agg.longestSession.ms)}.
        </p>
      )}
    </section>
  );
}

function Discoveries({ agg, tracks }: { agg: Agg; tracks: Record<string, Track> }) {
  const list = agg.newTracks.filter((r) => tracks[r.id]).slice(0, 12);
  if (!list.length) return null;
  const all = list.map((r) => tracks[r.id]);
  return (
    <Card title="Discoveries" sub={`New to you this period, ranked by how often you came back (${nf.format(agg.newTracks.length)} new songs)`}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {list.map((r, i) => {
          const t = tracks[r.id];
          return (
            <button key={r.id} onClick={() => play(all, i, { type: 'other', name: 'Your discoveries', path: '/stats' })} className="group rounded-lg p-2 text-left hover:bg-surface-3">
              <div className="relative">
                <Cover src={t.thumb} size={240} className="aspect-square w-full" />
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{fmtListen(r.ms)}</span>
              </div>
              <div className="mt-2 truncate text-sm font-semibold">{t.title}</div>
              <div className="truncate text-xs text-fg-2">{artistsText(t)}</div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function HistoryTable({ agg, tracks }: { agg: Agg; tracks: Record<string, Track> }) {
  const [n, setN] = useState(25);
  const rows = agg.events.slice(-n).reverse();
  const current = usePlayer((s) => s.current?.track.id);
  return (
    <Card title="Listening history" sub={`${nf.format(agg.events.length)} records`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-fg-2">
            <tr className="border-b border-line">
              <th className="py-2 font-medium">Song</th>
              <th className="py-2 font-medium">When</th>
              <th className="py-2 text-right font-medium">Listened</th>
              <th className="py-2 pl-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => {
              const t = tracks[e.t];
              return (
                <tr key={`${e.s}-${i}`} className="border-b border-line/60 hover:bg-surface-3/50">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-3">
                      <Cover src={t?.thumb} size={80} className="h-9 w-9" />
                      <div className="min-w-0">
                        <div className={cx('truncate', current === e.t && 'text-accent')}>{t?.title ?? e.t}</div>
                        <div className="truncate text-xs text-fg-2">{t ? artistsText(t) : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 text-fg-2">{relTime(e.s)}</td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums text-fg-2">
                    {fmtListen(e.l)}
                    {e.d > 0 && <span className="text-fg-3"> · {Math.min(100, Math.round(e.l / (e.d * 10)))}%</span>}
                  </td>
                  <td className="py-2 pl-4">
                    <span
                      className={cx(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        e.k === 0 ? 'bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-fg' : 'bg-surface-3 text-fg-2',
                      )}
                    >
                      {e.k === 0 ? '✓ Completed' : e.l < 30_000 ? '↷ Skipped' : '↷ Left early'}
                    </span>
                    {e.demo && <span className="ml-2 text-xs text-fg-3">demo</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {agg.events.length > n && (
        <button onClick={() => setN(n + 50)} className="mt-3 text-sm font-bold text-fg-2 hover:text-fg">
          Show more
        </button>
      )}
    </Card>
  );
}

function EmptyStats() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="grid min-h-full place-items-center px-6 py-16">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-accent">
          <Sparkles className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Your stats will grow here</h1>
        <p className="mt-3 text-fg-2">
          Every song you play is recorded on this device: total time, your top songs and artists, the hours you listen, your streaks and your discoveries. Play some music, or explore the page right now with demo data.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button onClick={() => navigate('/search')} className="rounded-full bg-fg px-6 py-3 font-bold text-bg transition hover:scale-105">
            Find music
          </button>
          <button
            disabled={!!busy}
            onClick={async () => {
              setBusy('Preparing…');
              try {
                const count = await generateDemoHistory(setBusy);
                toast(`Added ${nf.format(count)} demo listens. You can remove them in Settings with one click.`, { tone: 'ok' });
              } catch (err) {
                toast((err as Error).message, { tone: 'error' });
              } finally {
                setBusy(null);
              }
            }}
            className="flex items-center gap-2 rounded-full px-6 py-3 font-bold ring-1 ring-fg-3 transition hover:ring-fg"
          >
            {busy ? <Spinner className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
            {busy ?? 'Try with demo data'}
          </button>
        </div>
      </div>
    </div>
  );
}
