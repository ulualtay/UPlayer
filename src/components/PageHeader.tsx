import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { tuneHeader } from '../lib/color';
import { useCoverColor } from '../lib/hooks';
import { useTheme } from '../lib/themes';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { PlayFab } from './ui';

/**
 * The colour washed over page headers. Follows the "Page color" setting:
 * the cover's own colour (Spotify-style), the accent, black, a fixed custom
 * colour, or nothing; blended with the surface by the chosen strength.
 */
export function useHeaderColor(thumb?: string, fallback?: string) {
  const dark = useTheme().dark;
  const mode = useSettings((s) => s.tintMode);
  const custom = useSettings((s) => s.tintColor);
  const strength = useSettings((s) => s.tintStrength);
  const c = useCoverColor(mode === 'cover' ? thumb : undefined) ?? fallback;
  const base =
    mode === 'cover'
      ? c
        ? tuneHeader(c, dark)
        : 'var(--surface-3)'
      : mode === 'accent'
        ? `color-mix(in oklab, var(--accent) ${dark ? 55 : 45}%, var(--surface))`
        : mode === 'black'
          ? '#000000'
          : mode === 'custom'
            ? custom
            : 'var(--surface)';
  return strength >= 0.995 ? base : `color-mix(in oklab, ${base} ${Math.round(strength * 100)}%, var(--surface))`;
}

/** Big Spotify-style hero: art + type + huge title + meta, washed in the cover colour. */
export function PageHeader({
  color,
  art,
  kind,
  title,
  meta,
  onTitleClick,
}: {
  color: string;
  art: ReactNode;
  kind: string;
  title: ReactNode;
  meta?: ReactNode;
  onTitleClick?: () => void;
}) {
  return (
    <div className="relative px-6 pb-6 pt-16" style={{ background: `linear-gradient(${color}, color-mix(in oklab, ${color} 45%, transparent))` }}>
      <div className="flex items-end gap-6">
        <div className="w-[min(232px,22vw)] shrink-0 shadow-[0_8px_48px_rgb(0_0_0/0.5)]">{art}</div>
        <div className="min-w-0 flex-1 pb-1">
          <div className="text-sm font-semibold">{kind}</div>
          <h1
            onClick={onTitleClick}
            className={`my-2 line-clamp-2 break-words font-extrabold leading-[1.05] tracking-tight ${onTitleClick ? 'cursor-pointer' : ''}`}
            style={{ fontSize: 'clamp(2rem, 5.6vw, 5.5rem)' }}
          >
            {title}
          </h1>
          {meta && <div className="flex flex-wrap items-center gap-x-1 text-sm text-fg/80">{meta}</div>}
        </div>
      </div>
    </div>
  );
}

/** Action bar with the soft gradient continuation under the header. */
export function ActionBar({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div className="relative px-6 py-5" style={{ background: `linear-gradient(color-mix(in oklab, ${color} 45%, transparent), transparent 220px)` }}>
      <div className="flex items-center gap-6">{children}</div>
    </div>
  );
}

/** Mini header that fades in once the hero has scrolled away. */
export function StickyBar({ color, title, playing, onPlay, threshold = 300 }: { color: string; title: string; playing: boolean; onPlay: () => void; threshold?: number }) {
  const show = useUI((s) => s.scrollY > threshold);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="sticky top-0 z-20 -mb-16 flex h-16 items-center gap-3 px-6"
          style={{ background: `color-mix(in oklab, ${color} 85%, var(--surface))` }}
        >
          <PlayFab size={44} playing={playing} onClick={onPlay} />
          <span className="truncate text-2xl font-bold">{title}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
