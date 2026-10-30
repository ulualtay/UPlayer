import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Music2, Pause, Play } from 'lucide-react';
import { imageSources, isLetterboxed } from '../lib/format';
import { useSettings } from '../store/settings';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

// ---------- images ----------

/** Which entry of a source list worked last time, so a cover doesn't walk the chain again. */
const workingSource = new Map<string, number>();

/**
 * Tries each source from `imageSources` in turn (sharpest first) and ends with
 * nothing. YouTube answers a missing video still with a 120×90 grey stand-in,
 * which counts as a failure too; `ready` stays false until a real image is in,
 * so the stand-in never shows.
 */
export function useFallbackSrc(src: string | undefined, size: number) {
  const sources = useMemo(() => imageSources(src, size), [src, size]);
  const key = sources.join('\n');
  const fresh = () => ({ key, stage: workingSource.get(key) ?? 0, ready: false });
  const [state, setState] = useState(fresh);
  // a new image: start over during render, so a load event from the cache can't be undone afterwards
  let cur = state;
  if (state.key !== key) {
    cur = fresh();
    setState(cur);
  }
  const url = sources[cur.stage];
  if (!url) return { src: '', ready: false, onError: undefined, onLoad: undefined };
  const next = () => setState((s) => (s.key === key ? { ...s, stage: s.stage + 1, ready: false } : s));
  return {
    src: url,
    ready: cur.ready,
    onError: next,
    onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => {
      const im = e.currentTarget;
      if (im.naturalWidth === 120 && im.naturalHeight === 90 && cur.stage < sources.length - 1) return next();
      workingSource.set(key, cur.stage);
      setState((s) => (s.key === key ? { ...s, ready: true } : s));
    },
  };
}

const fade = (ready: boolean) => cx('transition-opacity duration-300', ready ? 'opacity-100' : 'opacity-0');

function MosaicTile({ src }: { src: string }) {
  const url = useFallbackSrc(src, 120);
  return url.src ? (
    <img src={url.src} alt="" loading="lazy" draggable={false} onError={url.onError} onLoad={url.onLoad} className={cx('h-full w-full object-cover', fade(url.ready))} />
  ) : (
    <div className="bg-surface-3" />
  );
}

export function Cover({
  src,
  size = 300,
  className,
  round,
  alt = '',
}: {
  src?: string;
  size?: number;
  className?: string;
  round?: boolean;
  alt?: string;
}) {
  const url = useFallbackSrc(src, size);
  return (
    <div className={cx('relative overflow-hidden bg-surface-3 shrink-0', round ? 'rounded-full' : 'rounded-md', className)}>
      {url.src ? (
        <img
          src={url.src}
          alt={alt}
          // big covers (now playing, fullscreen) are always in view: no reason to wait
          loading={size >= 400 ? 'eager' : 'lazy'}
          draggable={false}
          onError={url.onError}
          onLoad={url.onLoad}
          // video stills are cropped square; a 4:3 one is zoomed past its letterbox bars
          className={cx('absolute inset-0 h-full w-full object-cover', isLetterboxed(url.src) && 'scale-[1.34]', fade(url.ready))}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-fg-3">
          <Music2 className="h-1/3 w-1/3" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

/** 2x2 mosaic used for user playlists (Spotify does the same). */
export function Mosaic({ thumbs, className }: { thumbs: string[]; className?: string }) {
  const uniq = [...new Set(thumbs.filter(Boolean))];
  if (uniq.length < 4) return <Cover src={uniq[0]} className={className} />;
  return (
    <div className={cx('grid grid-cols-2 grid-rows-2 overflow-hidden rounded-md bg-surface-3 shrink-0', className)}>
      {uniq.slice(0, 4).map((t) => (
        <MosaicTile key={t} src={t} />
      ))}
    </div>
  );
}

// ---------- buttons ----------

export function PlayFab({
  playing,
  onClick,
  size = 56,
  className,
  label,
}: {
  playing?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  size?: number;
  className?: string;
  label?: string;
}) {
  const icon = Math.round(size * 0.42);
  return (
    <button
      type="button"
      aria-label={label ?? (playing ? 'Pause' : 'Play')}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      style={{ width: size, height: size }}
      className={cx(
        'play-fab grid place-items-center rounded-full bg-accent text-accent-ink shadow-[0_8px_24px_rgb(0_0_0/0.35)] transition hover:scale-105 hover:brightness-110 active:scale-95',
        className,
      )}
    >
      {playing ? (
        <Pause style={{ width: icon, height: icon }} fill="currentColor" strokeWidth={0} />
      ) : (
        <Play style={{ width: icon, height: icon, marginLeft: icon * 0.1 }} fill="currentColor" strokeWidth={0} />
      )}
    </button>
  );
}

export function IconBtn({
  tip,
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tip?: string; active?: boolean }) {
  return (
    <button
      type="button"
      data-tip={tip}
      aria-label={tip}
      aria-pressed={active}
      className={cx(
        'relative grid place-items-center rounded-full transition-colors disabled:opacity-40',
        active ? 'text-accent hover:brightness-110' : 'text-fg-2 hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
      {active && <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />}
    </button>
  );
}

export function Pill({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'h-8 shrink-0 rounded-full px-3 text-sm font-medium transition-colors',
        active ? 'bg-fg text-bg' : 'bg-surface-2 text-fg hover:bg-surface-3',
      )}
    >
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface-3')}
    >
      <span
        className={cx(
          'absolute top-1 h-4 w-4 rounded-full shadow transition-all',
          checked ? 'left-6 bg-accent-ink' : 'left-1 bg-fg-2',
        )}
      />
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx('inline-block h-5 w-5 animate-spin rounded-full border-2 border-fg-3 border-t-accent', className)}
      aria-label="Loading"
    />
  );
}

export function Equalizer({ paused }: { paused?: boolean }) {
  // with the visualizer on, the bars follow the real spectrum (CSS vars from lib/audio)
  const live = useSettings((s) => s.visualizer);
  return (
    <span className={cx('eq', live && 'live', paused && 'paused')} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-fg-3">{icon}</div>}
      <h3 className="text-xl font-bold">{title}</h3>
      {children && <div className="max-w-md text-sm text-fg-2">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <Empty title="Something went wrong">
      <p className="mb-4">Could not reach YouTube: {error.message}</p>
      {retry && (
        <button onClick={retry} className="rounded-full bg-fg px-5 py-2 text-sm font-bold text-bg hover:scale-105">
          Try again
        </button>
      )}
    </Empty>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-surface-2', className)} />;
}

// ---------- one global tooltip for every [data-tip] element ----------

export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tip]');
      window.clearTimeout(timer.current);
      if (!el || !el.dataset.tip) {
        setTip(null);
        return;
      }
      timer.current = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const below = r.top < 60;
        setTip({ text: el.dataset.tip!, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      }, 450);
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      setTip(null);
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('mousedown', hide);
    document.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mousedown', hide);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);
  if (!tip) return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] max-w-xs rounded-md bg-surface-3 px-2 py-1 text-xs font-semibold text-fg shadow-xl"
      style={{
        left: Math.min(Math.max(tip.x, 60), window.innerWidth - 60),
        top: tip.y,
        transform: `translate(-50%, ${tip.below ? '0' : '-100%'})`,
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
