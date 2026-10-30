import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  CircleArrowDown,
  Heart,
  House,
  LayoutTemplate,
  Library,
  ListMusic,
  Maximize2,
  Music,
  Palette,
  Plus,
  Repeat,
  Search,
  Shuffle,
  SkipForward,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { api, useQuery } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { THEMES } from '../lib/themes';
import { PRESETS } from '../lib/presets';
import { applyPreset } from './StylePicker';
import { artistsText, count, fold } from '../lib/format';
import { go, play } from '../lib/actions';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { Cover, Spinner, cx } from './ui';

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  thumb?: string;
  keywords?: string;
  run: () => void;
}

const norm = fold;

export function CommandPalette() {
  const open = useUI((s) => s.palette);
  const setOpen = useUI((s) => s.setPalette);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] flex items-start justify-center bg-black/55 pt-[14vh] backdrop-blur-sm"
          onMouseDown={() => setOpen(false)}
        >
          <motion.div
            initial={{ y: -12, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-[620px] max-w-[94vw] overflow-hidden rounded-2xl bg-surface-2 shadow-[0_30px_90px_rgb(0_0_0/0.6)] ring-1 ring-line"
            role="dialog"
            aria-label="Command palette"
          >
            <Palette_ onClose={() => setOpen(false)} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Palette_({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const playlists = useLibrary((s) => s.playlists);
  const debounced = useDebounced(q.trim(), 300);
  const search = useQuery(debounced.length >= 2 ? `search:${debounced}` : null, () => api.search(debounced));

  const commands = useMemo<Cmd[]>(() => {
    const p = usePlayer.getState();
    const s = useSettings.getState();
    const base: Cmd[] = [
      { id: 'home', group: 'Navigate', label: 'Home', icon: House, run: () => go('/') },
      { id: 'search', group: 'Navigate', label: 'Search', icon: Search, run: () => go('/search') },
      { id: 'liked', group: 'Navigate', label: 'Liked Songs', icon: Heart, run: () => go('/liked') },
      { id: 'downloads', group: 'Navigate', label: 'Downloads', icon: CircleArrowDown, keywords: 'offline files', run: () => go('/downloads') },
      { id: 'wrapped', group: 'Navigate', label: 'Wrapped', icon: Sparkles, keywords: 'recap summary year month', run: () => go('/wrapped') },
      { id: 'stats', group: 'Navigate', label: 'Stats', icon: BarChart3, keywords: 'statistics listening history', run: () => go('/stats') },
      { id: 'queue', group: 'Navigate', label: 'Queue', icon: ListMusic, keywords: 'up next', run: () => go('/queue') },
      { id: 'settings', group: 'Navigate', label: 'Themes & settings', icon: Palette, keywords: 'theme color appearance', run: () => go('/settings') },
      { id: 'new', group: 'Commands', label: 'New playlist', icon: Plus, run: () => go(`/playlist/${useLibrary.getState().createPlaylist()}?edit=1`) },
      { id: 'shuffle', group: 'Commands', label: p.shuffle ? 'Turn shuffle off' : 'Turn shuffle on', icon: Shuffle, run: p.toggleShuffle },
      { id: 'repeat', group: 'Commands', label: 'Cycle repeat mode', icon: Repeat, run: p.cycleRepeat },
      { id: 'next', group: 'Commands', label: 'Next song', icon: SkipForward, run: () => void p.next() },
      { id: 'fs', group: 'Commands', label: 'Fullscreen player', icon: Maximize2, run: () => useUI.getState().setFullscreen(true) },
      {
        id: 'dyn',
        group: 'Commands',
        label: s.dynamicAccent ? 'Stop matching accent to cover art' : 'Match accent to cover art',
        icon: Sparkles,
        run: () => s.set({ dynamicAccent: !s.dynamicAccent }),
      },
      ...THEMES.map((t) => ({
        id: `theme-${t.id}`,
        group: 'Themes',
        label: `Theme: ${t.name}`,
        hint: t.tagline,
        icon: Palette,
        keywords: 'theme color',
        run: () => s.set({ themeId: t.id, accent: null }),
      })),
      ...PRESETS.map((pr) => ({
        id: `style-${pr.id}`,
        group: 'Themes',
        label: `Style: ${pr.name}`,
        hint: pr.tagline,
        icon: LayoutTemplate,
        keywords: 'style layout preset minimal simple',
        run: () => applyPreset(pr),
      })),
      ...playlists.map((pl) => ({ id: `pl-${pl.id}`, group: 'Library', label: pl.name, hint: count(pl.entries.length, 'song'), icon: Library, run: () => go(`/playlist/${pl.id}`) })),
    ];
    return base;
  }, [playlists]);

  const results = useMemo<Cmd[]>(() => {
    const nq = norm(q.trim());
    const local = nq ? commands.filter((c) => norm(`${c.label} ${c.keywords ?? ''} ${c.group}`).includes(nq)) : commands.filter((c) => c.group !== 'Themes').slice(0, 10);
    const songs: Cmd[] = (search.data?.videos ?? []).slice(0, 5).map((t, i, arr) => ({
      id: `song-${t.id}`,
      group: 'YouTube',
      label: t.title,
      hint: artistsText(t),
      thumb: t.thumb,
      icon: Music,
      run: () => play(arr, i, { type: 'search', name: `Search: “${debounced}”`, path: `/search/${encodeURIComponent(debounced)}` }),
    }));
    if (nq.length >= 2) {
      songs.push({ id: 'all', group: 'YouTube', label: `See all results for “${q.trim()}”`, icon: Search, run: () => go(`/search/${encodeURIComponent(q.trim())}`) });
    }
    return [...local.slice(0, 12), ...songs];
  }, [q, commands, search.data, debounced]);

  useEffect(() => setHi(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const run = (c: Cmd | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  let lastGroup = '';
  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="h-5 w-5 text-fg-2" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHi((h) => Math.min(results.length - 1, h + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((h) => Math.max(0, h - 1));
            } else if (e.key === 'Enter') run(results[hi]);
            else if (e.key === 'Escape') onClose();
          }}
          placeholder="Search commands, themes, playlists or songs…"
          className="h-14 flex-1 bg-transparent text-lg outline-none placeholder:text-fg-3"
        />
        {search.loading && <Spinner className="h-4 w-4" />}
        <kbd className="rounded border border-line px-1.5 py-0.5 text-xs text-fg-3">Esc</kbd>
      </div>
      <div ref={listRef} className="scroll-area max-h-[52vh] p-2">
        {results.length === 0 && <div className="px-3 py-8 text-center text-fg-2">No results</div>}
        {results.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <div key={c.id}>
              {header && <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-fg-3">{header}</div>}
              <button
                type="button"
                data-i={i}
                onMouseMove={() => setHi(i)}
                onClick={() => run(c)}
                className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', hi === i && 'bg-surface-3')}
              >
                {c.thumb ? (
                  <Cover src={c.thumb} size={80} className="h-8 w-8" />
                ) : (
                  c.icon && (
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-surface-3 text-fg-2">
                      <c.icon className="h-4 w-4" />
                    </span>
                  )
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c.label}</span>
                  {c.hint && <span className="block truncate text-xs text-fg-2">{c.hint}</span>}
                </span>
                {hi === i && <kbd className="text-xs text-fg-3">↵</kbd>}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
