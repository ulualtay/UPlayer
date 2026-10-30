import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Download, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import type { Track } from '../../shared/types';
import { periods, summarize, type PeriodKey, type WrappedSummary } from '../lib/wrapped';
import { artistsText, count, fmtDate, fmtListen, img, nf } from '../lib/format';
import { proxied } from '../lib/color';
import { useCoverColor } from '../lib/hooks';
import { play } from '../lib/actions';
import { useHistory } from '../store/history';
import { useLibrary } from '../store/library';
import { toast } from '../store/ui';
import { Cover, cx } from '../components/ui';

const SLIDE_MS = 6500;
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

function useSummaries() {
  const events = useHistory((s) => s.events);
  const tracks = useLibrary((s) => s.tracks);
  return useMemo(() => periods(events).map((p) => ({ p, s: summarize(events, tracks, p) })), [events, tracks]);
}

// ---------- home promo ----------

export function WrappedPromo() {
  const navigate = useNavigate();
  const list = useSummaries();
  const pick = list.find((x) => x.p.key === 'month' && x.s && x.s.minutes >= 30) ?? list.find((x) => x.p.key === 'last12' && x.s);
  if (!pick?.s) return null;
  const s = pick.s;
  return (
    <section className="mb-8 px-3">
      <button
        type="button"
        onClick={() => navigate(`/wrapped?p=${pick.p.key}&play=1`)}
        className="group relative flex w-full items-center overflow-hidden rounded-2xl p-6 text-left text-white transition hover:brightness-110"
        style={{ background: 'linear-gradient(115deg, color-mix(in oklab, var(--accent) 80%, #000), color-mix(in oklab, var(--cover) 55%, #000) 70%, #0b0b0b)' }}
      >
        <div className="relative z-10 min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold opacity-90">
            <Sparkles className="h-4 w-4" /> Your Wrapped is ready
          </div>
          <div className="mt-1 text-4xl font-extrabold tracking-tight">{pick.p.label}</div>
          <div className="mt-2 text-sm opacity-90">
            {nf.format(s.minutes)} minutes{s.topArtists[0] ? ` · ${s.topArtists[0].name} on top` : ''} · {s.persona.title}
          </div>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-black transition group-hover:scale-105">
            <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} /> Watch your Wrapped
          </span>
        </div>
        <div className="relative hidden h-36 w-56 shrink-0 @2xl:block">
          {s.topTracks.slice(0, 3).map((t, i) => (
            <div
              key={t.track.id}
              className="absolute transition duration-300 group-hover:-translate-y-1"
              style={{ left: i * 52, top: i % 2 ? 22 : 0, rotate: `${(i - 1) * 8}deg`, zIndex: 3 - i }}
            >
              <Cover src={t.track.thumb} size={226} className="h-28 w-28 shadow-2xl" />
            </div>
          ))}
        </div>
      </button>
    </section>
  );
}

// ---------- page ----------

export function WrappedPage() {
  const [params, setParams] = useSearchParams();
  const list = useSummaries();
  const key = params.get('p') as PeriodKey | null;
  const open = params.get('play') === '1' ? list.find((x) => x.p.key === key && x.s)?.s : undefined;

  return (
    <div className="px-6 pb-16 pt-8">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg-2">
        <Sparkles className="h-4 w-4 text-accent" /> Any time you want it
      </div>
      <h1 className="text-[44px] font-extrabold leading-tight tracking-tight">Wrapped</h1>
      <p className="mb-8 max-w-xl text-fg-2">Your listening story as a set of animated slides: top songs and artists, your music clock, discoveries and streaks. Pick a period.</p>
      <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {list.map(({ p, s }, i) => (
          <button
            key={p.key}
            type="button"
            disabled={!s}
            onClick={() => setParams({ p: p.key, play: '1' })}
            className="group relative overflow-hidden rounded-2xl p-5 text-left text-white ring-1 ring-line transition enabled:hover:-translate-y-0.5 disabled:opacity-40"
            style={{
              background: [
                'linear-gradient(135deg, color-mix(in oklab, var(--accent) 75%, #000), #0b0b0b)',
                'linear-gradient(135deg, color-mix(in oklab, var(--cover) 70%, #000), #0b0b0b)',
                'linear-gradient(160deg, color-mix(in oklab, var(--accent) 45%, var(--cover)), #070707)',
                'linear-gradient(200deg, color-mix(in oklab, var(--glow-1) 60%, #000), #0b0b0b)',
                'linear-gradient(120deg, color-mix(in oklab, var(--glow-2) 70%, #000), #070707)',
              ][i % 5],
            }}
          >
            <div className="text-sm font-semibold opacity-80">{p.short}</div>
            <div className="mt-1 text-2xl font-extrabold tracking-tight">{p.label}</div>
            {s ? (
              <>
                <div className="mt-6 flex items-end justify-between gap-4">
                  <div>
                    <div className="text-4xl font-extrabold">{nf.format(s.minutes)}</div>
                    <div className="text-sm opacity-80">minutes</div>
                  </div>
                  <div className="flex -space-x-3">
                    {s.topTracks.slice(0, 3).map((t) => (
                      <Cover key={t.track.id} src={t.track.thumb} size={120} className="h-12 w-12 ring-2 ring-black/40" />
                    ))}
                  </div>
                </div>
                <div className="mt-3 truncate text-sm opacity-90">
                  {s.topArtists[0]?.name ?? '—'} · {s.persona.title}
                </div>
              </>
            ) : (
              <div className="mt-6 text-sm opacity-80">Not enough listening yet</div>
            )}
          </button>
        ))}
      </div>
      {open && <Story s={open} onClose={() => setParams({})} />}
    </div>
  );
}

// ---------- story player ----------

interface Slide {
  id: string;
  bg: string;
  dark?: boolean;
  node: ReactNode;
  /** last slide: no auto-advance */
  hold?: boolean;
}

function Story({ s, onClose }: { s: WrappedSummary; onClose: () => void }) {
  const coverHex = useCoverColor(s.topTracks[0]?.track.thumb) ?? '#535353';
  const artistHex = useCoverColor(s.topArtists[0]?.thumb) ?? coverHex;
  const [i, setI] = useState(0);
  const [progress, setProgress] = useState(0);
  const paused = useRef(false);
  const down = useRef<{ t: number; x: number } | null>(null);
  const slides = useMemo(() => buildSlides(s, () => setI(0)), [s]);
  const slide = slides[i];

  useEffect(() => {
    setProgress(0);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      if (!paused.current) acc += now - last;
      last = now;
      const p = Math.min(1, acc / SLIDE_MS);
      setProgress(p);
      if (p >= 1 && !slides[i].hold) setI((x) => Math.min(slides.length - 1, x + 1));
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, slides]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => Math.min(slides.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      if (e.key === ' ') {
        e.preventDefault();
        paused.current = !paused.current;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, slides.length]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[75] grid place-items-center bg-black/85 backdrop-blur-xl"
      role="dialog"
      aria-label={`Wrapped: ${s.period.label}`}
      style={{ '--w-cover': coverHex, '--w-artist': artistHex } as React.CSSProperties}
    >
      <button onClick={onClose} aria-label="Close Wrapped" className="absolute right-6 top-6 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <X className="h-5 w-5" />
      </button>
      <button
        onClick={() => setI((x) => Math.max(0, x - 1))}
        aria-label="Previous slide"
        className="absolute left-[max(16px,calc(50%-min(44vh,430px)*0.5625-80px))] grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
        disabled={i === 0}
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))}
        aria-label="Next slide"
        className="absolute right-[max(16px,calc(50%-min(44vh,430px)*0.5625-80px))] grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
        disabled={i === slides.length - 1}
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      <div
        className="relative select-none overflow-hidden rounded-[28px] shadow-[0_40px_120px_rgb(0_0_0/0.7)]"
        style={{ height: 'min(88vh, 860px)', aspectRatio: '9 / 16' }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          paused.current = true;
          down.current = { t: performance.now(), x: e.clientX };
        }}
        onPointerUp={(e) => {
          paused.current = false;
          const d = down.current;
          down.current = null;
          if (!d || performance.now() - d.t > 260) return; // a hold just pauses
          const r = e.currentTarget.getBoundingClientRect();
          if (d.x - r.left < r.width * 0.3) setI((x) => Math.max(0, x - 1));
          else setI((x) => Math.min(slides.length - 1, x + 1));
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
            className={cx('absolute inset-0 overflow-hidden', slide.dark === false ? 'text-black' : 'text-white')}
            style={{ background: slide.bg }}
          >
            {slide.node}
          </motion.div>
        </AnimatePresence>
        <div className="absolute inset-x-3 top-3 z-10 flex gap-1">
          {slides.map((sl, k) => (
            <div key={sl.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <div className="h-full rounded-full bg-white" style={{ width: `${k < i ? 100 : k === i ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="absolute left-4 top-6 z-10 flex items-center gap-1.5 text-xs font-bold text-white/90 drop-shadow">
          <Sparkles className="h-3.5 w-3.5" /> UPlayer Wrapped · {s.period.label}
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}

// ---------- slides ----------

const rise = (delay = 0) => ({ initial: { opacity: 0, y: 28 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.6, ease: [0.2, 0.7, 0.2, 1] as const } });

function CountUp({ value, duration = 1.6 }: { value: number; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (duration * 1000));
      setV(Math.round(value * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{nf.format(v)}</>;
}

function PlayChip({ tracks, label }: { tracks: Track[]; label: string }) {
  return (
    <button
      type="button"
      onClick={() => play(tracks, 0, { type: 'other', name: label, path: '/wrapped' })}
      className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:scale-105"
    >
      <Play className="h-4 w-4" fill="currentColor" strokeWidth={0} /> Play
    </button>
  );
}

function buildSlides(s: WrappedSummary, replay: () => void): Slide[] {
  const out: Slide[] = [];
  const top = s.topTracks[0];
  const artist = s.topArtists[0];
  const covers = [...s.topTracks.map((t) => t.track.thumb), s.bestNew?.thumb ?? ''];

  out.push({
    id: 'intro',
    bg: 'radial-gradient(circle at 18% 12%, var(--accent), transparent 55%), radial-gradient(circle at 85% 85%, var(--w-cover), transparent 55%), #0a0a0a',
    node: (
      <div className="flex h-full flex-col justify-end p-8 pb-14">
        <div className="absolute inset-0">
          {covers
            .filter(Boolean)
            .slice(0, 5)
            .map((c, k) => (
              <motion.img
                key={k}
                src={img(c, 226)}
                alt=""
                className="absolute w-[34%] rounded-xl shadow-2xl"
                style={{ left: `${[8, 55, 30, 62, 4][k]}%`, top: `${[10, 6, 26, 32, 36][k]}%`, rotate: `${[-10, 8, -4, 12, 6][k]}deg` }}
                initial={{ opacity: 0, y: 40, scale: 0.8 }}
                animate={{ opacity: 0.9, y: [0, -8, 0], scale: 1 }}
                transition={{ delay: 0.15 * k, duration: 0.7, y: { repeat: Infinity, duration: 4 + k, ease: 'easeInOut' } }}
              />
            ))}
        </div>
        <motion.div {...rise(0.3)} className="relative text-lg font-bold opacity-90">
          Your
        </motion.div>
        <motion.div {...rise(0.45)} className="relative text-5xl font-extrabold leading-[0.95] tracking-tight">
          {s.period.label}
        </motion.div>
        <motion.div {...rise(0.6)} className="relative mt-1 text-5xl font-extrabold leading-[0.95] tracking-tight" style={{ color: 'var(--accent)' }}>
          Wrapped
        </motion.div>
        <motion.div {...rise(0.8)} className="relative mt-4 text-sm opacity-80">
          Tap to continue · hold to pause
        </motion.div>
      </div>
    ),
  });

  out.push({
    id: 'minutes',
    bg: 'var(--accent)',
    dark: false,
    node: (
      <div className="flex h-full flex-col justify-center p-8" style={{ color: 'var(--accent-ink)' }}>
        <motion.div {...rise(0.1)} className="text-2xl font-bold">
          You listened for
        </motion.div>
        <motion.div {...rise(0.25)} className="my-2 text-7xl font-extrabold leading-none tracking-tighter">
          <CountUp value={s.minutes} />
        </motion.div>
        <motion.div {...rise(0.4)} className="text-2xl font-bold">
          minutes
        </motion.div>
        <motion.div {...rise(1.2)} className="mt-10 space-y-2 text-base font-semibold opacity-85">
          <p>
            That's {count(s.agg.plays, 'play')} across {count(s.agg.uniqueTracks, 'song')} and {count(s.agg.uniqueArtists, 'artist')}.
          </p>
          {s.topDay && (
            <p>
              Your biggest day was {fmtDate(s.topDay.day, { weekday: 'long', month: 'long', day: 'numeric' })}, with {fmtListen(s.topDay.ms)} of music.
            </p>
          )}
        </motion.div>
      </div>
    ),
  });

  if (top) {
    out.push({
      id: 'top-song',
      bg: 'linear-gradient(180deg, color-mix(in oklab, var(--w-cover) 80%, #000), #080808 85%)',
      node: (
        <div className="flex h-full flex-col items-center justify-center p-8 text-center">
          <motion.div {...rise(0.1)} className="mb-6 text-lg font-bold opacity-90">
            Your top song
          </motion.div>
          <motion.div initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 140, damping: 14, delay: 0.2 }}>
            <Cover src={top.track.thumb} size={544} className="h-56 w-56 rounded-2xl shadow-[0_30px_80px_rgb(0_0_0/0.6)]" />
          </motion.div>
          <motion.div {...rise(0.7)} className="mt-7 line-clamp-2 text-3xl font-extrabold leading-tight tracking-tight">
            {top.track.title}
          </motion.div>
          <motion.div {...rise(0.8)} className="mt-1 opacity-80">
            {artistsText(top.track)}
          </motion.div>
          <motion.div {...rise(1)} className="mt-5 text-sm font-semibold opacity-90">
            Played {nf.format(top.plays)} times · {fmtListen(top.ms)}
          </motion.div>
          <motion.div {...rise(1.2)} className="mt-6">
            <PlayChip tracks={[top.track]} label="Your top song" />
          </motion.div>
        </div>
      ),
    });
  }

  if (s.topTracks.length > 1) {
    out.push({
      id: 'top-songs',
      bg: 'radial-gradient(circle at 100% 0%, color-mix(in oklab, var(--accent) 45%, transparent), transparent 50%), #0e0e10',
      node: (
        <div className="flex h-full flex-col justify-center p-7">
          <motion.div {...rise(0.1)} className="mb-6 text-3xl font-extrabold leading-tight tracking-tight">
            Your top songs
          </motion.div>
          <div className="space-y-3">
            {s.topTracks.map((t, k) => (
              <motion.div key={t.track.id} {...rise(0.25 + k * 0.15)} className="flex items-center gap-3">
                <span className="w-7 text-2xl font-extrabold" style={{ color: 'var(--accent)' }}>
                  {k + 1}
                </span>
                <Cover src={t.track.thumb} size={120} className="h-14 w-14 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{t.track.title}</div>
                  <div className="truncate text-sm opacity-70">
                    {artistsText(t.track)} · {nf.format(t.plays)} plays
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <motion.div {...rise(1.2)} className="mt-8">
            <PlayChip tracks={s.topTracks.map((t) => t.track)} label="Your top songs" />
          </motion.div>
        </div>
      ),
    });
  }

  if (artist) {
    out.push({
      id: 'top-artist',
      bg: 'linear-gradient(160deg, color-mix(in oklab, var(--w-artist) 70%, #000), #050505 80%)',
      node: (
        <div className="flex h-full flex-col justify-end p-8 pb-14">
          <motion.div initial={{ opacity: 0, scale: 1.15 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2 }} className="absolute inset-x-0 top-0 h-[62%]">
            {artist.thumb && <img src={img(artist.thumb, 544)} alt="" className="h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-t from-[color-mix(in_oklab,var(--w-artist)_30%,#050505)] via-transparent to-transparent" />
          </motion.div>
          <motion.div {...rise(0.4)} className="relative text-lg font-bold opacity-90">
            Your top artist
          </motion.div>
          <motion.div {...rise(0.55)} className="relative text-5xl font-extrabold leading-[0.95] tracking-tight">
            {artist.name}
          </motion.div>
          <motion.div {...rise(0.9)} className="relative mt-4 text-base font-semibold opacity-90">
            {fmtListen(artist.ms)} together, across {artist.songs} {artist.songs === 1 ? 'song' : 'songs'}.
            {s.agg.totalMs > 0 && ` That's ${Math.round((artist.ms / s.agg.totalMs) * 100)}% of everything you played.`}
          </motion.div>
        </div>
      ),
    });
  }

  if (s.topArtists.length > 1) {
    out.push({
      id: 'top-artists',
      bg: 'linear-gradient(200deg, color-mix(in oklab, var(--accent) 40%, #111), #0a0a0a 75%)',
      node: (
        <div className="flex h-full flex-col justify-center p-7">
          <motion.div {...rise(0.1)} className="mb-6 text-3xl font-extrabold leading-tight tracking-tight">
            Your top artists
          </motion.div>
          <div className="space-y-3">
            {s.topArtists.map((a, k) => (
              <motion.div key={a.name} {...rise(0.25 + k * 0.15)} className="flex items-center gap-3">
                <span className="w-7 text-2xl font-extrabold" style={{ color: 'var(--accent)' }}>
                  {k + 1}
                </span>
                <Cover src={a.thumb} size={120} round className="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{a.name}</div>
                  <div className="truncate text-sm opacity-70">{fmtListen(a.ms)}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    });
  }

  out.push({
    id: 'clock',
    bg: 'radial-gradient(circle at 50% 40%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 60%), #08080c',
    node: (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <motion.div {...rise(0.1)} className="text-lg font-bold opacity-90">
          Your music clock
        </motion.div>
        <motion.div initial={{ opacity: 0, rotate: -90, scale: 0.7 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} transition={{ duration: 1, ease: [0.2, 0.7, 0.2, 1] }} className="my-6">
          <MusicClock hours={s.agg.hours} peak={s.agg.peakHour} />
        </motion.div>
        <motion.div {...rise(0.9)} className="text-4xl font-extrabold tracking-tight" style={{ color: 'var(--accent)' }}>
          {s.persona.title}
        </motion.div>
        <motion.div {...rise(1.05)} className="mt-2 opacity-85">
          {s.persona.line} You peak around {hourLabel(s.agg.peakHour)}.
        </motion.div>
      </div>
    ),
  });

  if (s.agg.newTracks.length) {
    out.push({
      id: 'discoveries',
      bg: 'linear-gradient(135deg, color-mix(in oklab, var(--accent) 65%, #fff 8%), color-mix(in oklab, var(--accent) 25%, #000))',
      node: (
        <div className="flex h-full flex-col justify-center p-8">
          <motion.div {...rise(0.1)} className="text-7xl font-extrabold leading-none tracking-tighter">
            <CountUp value={s.agg.newTracks.length} duration={1.2} />
          </motion.div>
          <motion.div {...rise(0.25)} className="mt-2 text-3xl font-extrabold leading-tight tracking-tight">
            new songs found their way to you
          </motion.div>
          {s.bestNew && (
            <motion.div {...rise(0.8)} className="mt-10 flex items-center gap-4 rounded-2xl bg-black/25 p-3 backdrop-blur">
              <Cover src={s.bestNew.thumb} size={226} className="h-20 w-20 rounded-xl" />
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider opacity-80">Best discovery</div>
                <div className="truncate text-lg font-extrabold">{s.bestNew.title}</div>
                <div className="truncate text-sm opacity-80">{artistsText(s.bestNew)}</div>
              </div>
            </motion.div>
          )}
        </div>
      ),
    });
  }

  out.push({
    id: 'streaks',
    bg: 'radial-gradient(circle at 0% 100%, color-mix(in oklab, var(--w-cover) 55%, transparent), transparent 55%), #0b0b0b',
    node: (
      <div className="flex h-full flex-col justify-center gap-10 p-8">
        <motion.div {...rise(0.1)}>
          <div className="text-lg font-bold opacity-80">Longest streak</div>
          <div className="text-6xl font-extrabold tracking-tight" style={{ color: 'var(--accent)' }}>
            <CountUp value={s.agg.longestStreak.len} duration={1} /> days
          </div>
          <div className="opacity-80">in a row with music</div>
        </motion.div>
        {s.agg.longestSession && (
          <motion.div {...rise(0.5)}>
            <div className="text-lg font-bold opacity-80">Longest session</div>
            <div className="text-6xl font-extrabold tracking-tight">{fmtListen(s.agg.longestSession.ms)}</div>
            <div className="opacity-80">
              {count(s.agg.longestSession.count, 'song')} back to back on {fmtDate(s.agg.longestSession.start, { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
          </motion.div>
        )}
        {s.firstTrack && (
          <motion.div {...rise(0.9)} className="text-sm opacity-80">
            It all started with “{s.firstTrack.title}” by {artistsText(s.firstTrack)}.
          </motion.div>
        )}
      </div>
    ),
  });

  out.push({
    id: 'summary',
    hold: true,
    bg: 'linear-gradient(160deg, color-mix(in oklab, var(--accent) 60%, #000), #070707 70%)',
    node: <Summary s={s} replay={replay} />,
  });
  return out;
}

function MusicClock({ hours, peak }: { hours: number[]; peak: number }) {
  const max = Math.max(1, ...hours);
  const c = 120;
  return (
    <svg width={240} height={240} viewBox="0 0 240 240" aria-label="Listening by hour of day">
      <circle cx={c} cy={c} r={44} fill="none" stroke="rgb(255 255 255 / 0.15)" />
      {hours.map((v, h) => {
        const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
        const len = 8 + (v / max) * 62;
        const x1 = c + Math.cos(a) * 50;
        const y1 = c + Math.sin(a) * 50;
        const x2 = c + Math.cos(a) * (50 + len);
        const y2 = c + Math.sin(a) * (50 + len);
        return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={7} strokeLinecap="round" stroke={h === peak ? 'var(--accent)' : 'rgb(255 255 255 / 0.35)'} />;
      })}
      {[0, 6, 12, 18].map((h) => {
        const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
        return (
          <text key={h} x={c + Math.cos(a) * 30} y={c + Math.sin(a) * 30} textAnchor="middle" dominantBaseline="central" fill="rgb(255 255 255 / 0.6)" fontSize={10} fontWeight={700}>
            {h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
          </text>
        );
      })}
    </svg>
  );
}

function Summary({ s, replay }: { s: WrappedSummary; replay: () => void }) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex h-full flex-col p-7 pt-14">
      <motion.div {...rise(0.1)} className="text-sm font-bold opacity-80">
        {s.period.label}
      </motion.div>
      <motion.div {...rise(0.2)} className="text-3xl font-extrabold leading-tight tracking-tight">
        {s.persona.title}
      </motion.div>
      <motion.div {...rise(0.35)} className="mt-5 grid grid-cols-2 gap-5">
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider opacity-70">Top artists</div>
          {s.topArtists.map((a, k) => (
            <div key={a.name} className="truncate text-sm font-semibold leading-7">
              {k + 1}. {a.name}
            </div>
          ))}
        </div>
        <div>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider opacity-70">Top songs</div>
          {s.topTracks.map((t, k) => (
            <div key={t.track.id} className="truncate text-sm font-semibold leading-7">
              {k + 1}. {t.track.title}
            </div>
          ))}
        </div>
      </motion.div>
      <motion.div {...rise(0.5)} className="mt-6 grid grid-cols-2 gap-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider opacity-70">Minutes</div>
          <div className="text-3xl font-extrabold">{nf.format(s.minutes)}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider opacity-70">New songs</div>
          <div className="text-3xl font-extrabold">{nf.format(s.agg.newTracks.length)}</div>
        </div>
      </motion.div>
      <div className="mt-auto flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await exportImage(s);
            } catch (err) {
              toast(`Couldn't create the image: ${(err as Error).message}`, { tone: 'error' });
            } finally {
              setSaving(false);
            }
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-bold text-black transition hover:scale-[1.02]"
        >
          <Download className="h-4 w-4" /> {saving ? 'Creating…' : 'Save image'}
        </button>
        <button type="button" onClick={replay} className="flex items-center justify-center gap-2 rounded-full bg-white/15 px-5 py-3 text-sm font-bold hover:bg-white/25">
          <RotateCcw className="h-4 w-4" /> Replay
        </button>
      </div>
    </div>
  );
}

// ---------- shareable PNG ----------

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = proxied(url);
  });
}

async function exportImage(s: WrappedSummary) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#1ed760';
  const font = (w: number, px: number) => `${w} ${px}px "Figtree Variable", "Segoe UI", sans-serif`;
  await Promise.all([document.fonts.load(font(800, 80)), document.fonts.load(font(600, 30))]).catch(() => {});

  const bg = g.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, accent);
  bg.addColorStop(0.45, '#111111');
  bg.addColorStop(1, '#050505');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, W, H);

  const fit = (text: string, max: number) => {
    let t = text;
    while (g.measureText(t).width > max && t.length > 1) t = t.slice(0, -2);
    return t === text ? t : `${t.trimEnd()}…`;
  };

  g.fillStyle = '#ffffff';
  g.font = font(700, 30);
  g.fillText('UPlayer Wrapped', 80, 110);
  g.font = font(800, 84);
  g.fillText(fit(s.period.label, W - 160), 80, 200);
  g.font = font(700, 40);
  g.fillStyle = accent;
  g.fillText(s.persona.title, 80, 260);

  const [art, topCover] = await Promise.all([loadImage(s.topArtists[0]?.thumb ?? ''), loadImage(s.topTracks[0]?.track.thumb ?? '')]);
  const drawImg = (im: HTMLImageElement | null, x: number, y: number, size: number, round: boolean) => {
    if (!im) return;
    g.save();
    g.beginPath();
    if (round) g.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    else g.roundRect(x, y, size, size, 28);
    g.clip();
    const scale = Math.max(size / im.width, size / im.height);
    g.drawImage(im, x + (size - im.width * scale) / 2, y + (size - im.height * scale) / 2, im.width * scale, im.height * scale);
    g.restore();
  };
  drawImg(art, 80, 320, 300, true);
  drawImg(topCover, 420, 320, 300, false);

  const col = (title: string, items: string[], x: number) => {
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = font(700, 26);
    g.fillText(title.toUpperCase(), x, 720);
    g.fillStyle = '#ffffff';
    g.font = font(700, 36);
    items.forEach((it, k) => g.fillText(fit(`${k + 1}. ${it}`, 440), x, 780 + k * 58));
  };
  col('Top artists', s.topArtists.map((a) => a.name), 80);
  col('Top songs', s.topTracks.map((t) => t.track.title), 560);

  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.font = font(700, 26);
  g.fillText('MINUTES LISTENED', 80, 1140);
  g.fillText('NEW SONGS', 560, 1140);
  g.fillStyle = '#ffffff';
  g.font = font(800, 76);
  g.fillText(nf.format(s.minutes), 80, 1225);
  g.fillText(nf.format(s.agg.newTracks.length), 560, 1225);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('canvas export failed');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `uplayer-wrapped-${s.period.key}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
