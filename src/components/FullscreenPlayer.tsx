import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AudioLines, ChevronDown, CircleCheck, CirclePlus, Disc3, Image as ImageIcon, ListMusic, MicVocal, SlidersHorizontal } from 'lucide-react';
import { usePlayback, usePlayer, upcoming } from '../store/player';
import { useSettings, type VizStyle } from '../store/settings';
import { useLibrary } from '../store/library';
import { useUI } from '../store/ui';
import { img } from '../lib/format';
import { toggleLike } from '../lib/actions';
import { LyricsView } from './Lyrics';
import { Transport } from './PlayerBar';
import { ArtistLinks } from './TrackList';
import { Visualizer } from './Visualizer';
import { DownloadButton } from './DownloadButton';
import { useArtwork } from '../lib/artwork';
import { Cover, IconBtn, cx } from './ui';

type Art = 'cover' | 'vinyl';
type Side = 'lyrics' | 'queue' | null;

export const VIZ_STYLES: [VizStyle, string][] = [
  ['halo', 'Halo'],
  ['bars', 'Bars'],
  ['dots', 'Dots'],
  ['wave', 'Wave'],
];

export function FullscreenPlayer() {
  const open = useUI((s) => s.fullscreen);
  const setOpen = useUI((s) => s.setFullscreen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="fs"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', stiffness: 300, damping: 34 }}
          className="fixed inset-0 z-40 overflow-hidden bg-bg"
          role="dialog"
          aria-label="Fullscreen player"
        >
          <Inner onClose={() => setOpen(false)} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Inner({ onClose }: { onClose: () => void }) {
  const current = usePlayer((s) => s.current);
  const context = usePlayer((s) => s.context);
  const st = usePlayer();
  const playing = usePlayback((s) => s.playing);
  const viz = useSettings((s) => (s.visualizer ? s.vizStyle : null));
  const set = useSettings((s) => s.set);
  const openMenu = useUI((s) => s.openMenu);
  const liked = useLibrary((s) => (current ? s.liked.some((e) => e.id === current.track.id) : false));
  const [mode, setMode] = useState<Art>('cover');
  const [side, setSide] = useState<Side>('lyrics');
  const t = current?.track;
  const art = useArtwork(t);

  if (!t) {
    return (
      <div className="grid h-full place-items-center">
        <button onClick={onClose} className="rounded-full bg-fg px-6 py-2 font-bold text-bg">
          Close
        </button>
      </div>
    );
  }

  const { manual, context: next } = upcoming(st);
  const nextUp = [...manual, ...next].slice(0, 8);

  return (
    <div className="relative flex h-full flex-col">
      {/* ambient */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <img key={art} src={img(art, 120)} alt="" className="absolute inset-[-15%] h-[130%] w-[130%] object-cover opacity-90 blur-[80px] saturate-[1.8]" />
        <div className="absolute inset-0 bg-bg/35" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bg/80 to-transparent" />
        {viz && viz !== 'halo' && (
          <div className="absolute inset-x-0 bottom-0 h-[44%] opacity-60 [mask-image:linear-gradient(to_top,#000_40%,transparent)]">
            <Visualizer variant={viz} />
          </div>
        )}
      </div>

      {/* app-drag: in the desktop app this doubles as the title bar and keeps clear of the window buttons */}
      <header className="app-drag relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-8 pt-6">
        <IconBtn tip="Minimize (Esc)" onClick={onClose} className="h-10 w-10 bg-surface-2/60 backdrop-blur hover:bg-surface-3">
          <ChevronDown className="h-6 w-6" />
        </IconBtn>
        <div className="min-w-0 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-fg-2">Now playing</div>
          <div className="truncate text-sm font-bold">{context?.name ?? 'UPlayer'}</div>
        </div>
        <div className="flex items-center justify-self-end gap-1 rounded-full bg-surface-2/60 p-1 backdrop-blur">
          <IconBtn tip="Lyrics" active={side === 'lyrics'} onClick={() => setSide(side === 'lyrics' ? null : 'lyrics')} className="h-9 w-9">
            <MicVocal className="h-[18px] w-[18px]" />
          </IconBtn>
          <IconBtn tip="Up next" active={side === 'queue'} onClick={() => setSide(side === 'queue' ? null : 'queue')} className="h-9 w-9">
            <ListMusic className="h-[18px] w-[18px]" />
          </IconBtn>
          <IconBtn
            tip="View"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const on = (yes: boolean) => (yes ? '✓' : undefined);
              openMenu(r.right - 220, r.bottom + 6, [
                { label: 'Cover', icon: ImageIcon, hint: on(mode === 'cover'), onSelect: () => setMode('cover') },
                { label: 'Vinyl', icon: Disc3, hint: on(mode === 'vinyl'), onSelect: () => setMode('vinyl') },
                { divider: true },
                ...VIZ_STYLES.map(([id, label]) => ({
                  label: `${label} visualizer`,
                  icon: AudioLines,
                  hint: on(viz === id),
                  onSelect: () => set({ visualizer: true, vizStyle: id }),
                })),
                { label: 'No visualizer', hint: on(!viz), onSelect: () => set({ visualizer: false }) },
              ]);
            }}
            className="h-9 w-9"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </IconBtn>
        </div>
      </header>

      <div className={cx('relative z-10 grid min-h-0 flex-1 items-center gap-12 px-12', side ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : 'grid-cols-1')}>
        <div className="flex min-h-0 flex-col items-center justify-center">
          <div className="relative w-full max-w-[min(48vh,500px)]">
            {viz === 'halo' && (
              // ring of spectrum bars hugging the artwork (squircle for covers, circle for vinyl)
              <div className="pointer-events-none absolute -inset-[24%]">
                <Visualizer variant="halo" shape={mode === 'vinyl' ? 'circle' : 'square'} core={1 / 1.48} />
              </div>
            )}
            {/* the artwork breathes a little with the bass */}
            <div className="relative transition-transform duration-75" style={{ transform: 'scale(calc(1 + var(--beat, 0) * 0.025))' }}>
              {mode === 'cover' && (
                <motion.div key={t.id} initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}>
                  <Cover src={art} size={720} className="aspect-square w-full rounded-2xl shadow-[0_30px_80px_rgb(0_0_0/0.55)]" />
                </motion.div>
              )}
              {mode === 'vinyl' && <Vinyl thumb={art ?? t.thumb} spinning={playing} />}
            </div>
          </div>
        </div>

        {side && (
          <div className="h-full min-h-0 py-6">
            {side === 'lyrics' ? (
              <LyricsView track={t} variant="full" />
            ) : (
              <div className="scroll-area h-full">
                <h3 className="mb-3 text-2xl font-bold">Up next</h3>
                {nextUp.length === 0 && <p className="text-fg-2">Nothing else in the queue.</p>}
                {nextUp.map((it) => (
                  <button key={it.uid} onClick={() => st.jumpTo(it.uid)} className="flex w-full items-center gap-4 rounded-lg p-2 text-left hover:bg-surface-2/60">
                    <Cover src={it.track.thumb} size={120} className="h-14 w-14" />
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold">{it.track.title}</div>
                      <div className="truncate text-fg-2">{it.track.artists.map((a) => a.name).join(', ')}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="relative z-10 px-12 pb-8">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-4xl font-extrabold tracking-tight">{t.title}</h1>
            <div className="truncate text-lg text-fg-2">
              <ArtistLinks artists={t.artists} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DownloadButton track={t} size={26} alwaysVisible />
            <IconBtn tip={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'} active={liked} onClick={() => toggleLike(t)} className="h-10 w-10">
              {liked ? <CircleCheck className="h-7 w-7" fill="currentColor" stroke="var(--bg)" /> : <CirclePlus className="h-7 w-7" />}
            </IconBtn>
          </div>
        </div>
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 [&_.slider]:h-4">
          <Transport />
        </div>
      </footer>
    </div>
  );
}

function Vinyl({ thumb, spinning }: { thumb: string; spinning: boolean }) {
  return (
    <div className="relative aspect-square w-full">
      <div
        className="absolute inset-0 rounded-full shadow-[0_30px_80px_rgb(0_0_0/0.6)]"
        style={{
          background:
            'radial-gradient(circle, #111 0 31%, transparent 31.5%), repeating-radial-gradient(circle, #0b0b0b 0 2px, #161616 2px 3.5px), #0b0b0b',
          animation: 'spin 6s linear infinite',
          animationPlayState: spinning ? 'running' : 'paused',
        }}
      >
        <img src={img(thumb, 400)} alt="" className="absolute left-1/2 top-1/2 h-[38%] w-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full object-cover" />
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg" />
      </div>
      {/* light catching the grooves stays put while the record turns */}
      <div className="pointer-events-none absolute inset-0 rounded-full bg-[conic-gradient(from_30deg,transparent_0deg,rgb(255_255_255/0.09)_40deg,transparent_80deg,transparent_180deg,rgb(255_255_255/0.07)_220deg,transparent_260deg)]" />
    </div>
  );
}
