import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleArrowDown,
  Command,
  Heart,
  History,
  House,
  Keyboard,
  LayoutTemplate,
  Menu,
  Palette,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { api, useQuery } from '../lib/api';
import { useDebounced } from '../lib/hooks';
import { useDownloads } from '../store/downloads';
import { useLibrary } from '../store/library';
import { useSettings } from '../store/settings';
import { useUI } from '../store/ui';
import { IconBtn, cx } from './ui';

export function TopBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const setPalette = useUI((s) => s.setPalette);
  const setShortcuts = useUI((s) => s.setShortcuts);
  const icons = useSettings((s) => s.topbarIcons);

  // everything the optional buttons do (plus Liked Songs and Downloads) lives in one menu
  const openAppMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const downloading = Object.values(useDownloads.getState().jobs).filter((j) => j.status !== 'error').length;
    useUI.getState().openMenu(r.right - 240, r.bottom + 6, [
      { label: 'Liked Songs', icon: Heart, onSelect: () => navigate('/liked') },
      { label: 'Downloads', icon: CircleArrowDown, hint: downloading ? `${downloading} active` : undefined, onSelect: () => navigate('/downloads') },
      { label: 'Stats', icon: BarChart3, onSelect: () => navigate('/stats') },
      { label: 'Wrapped', icon: Sparkles, onSelect: () => navigate('/wrapped') },
      { divider: true },
      { label: 'Style & layout', icon: LayoutTemplate, onSelect: () => navigate('/settings?tab=style') },
      { label: 'Themes', icon: Palette, onSelect: () => navigate('/settings?tab=themes') },
      { label: 'Settings', icon: Settings, onSelect: () => navigate('/settings?tab=playback') },
      { divider: true },
      { label: 'Keyboard shortcuts', icon: Keyboard, hint: '?', onSelect: () => setShortcuts(true) },
      { label: 'Command palette', icon: Command, hint: 'Ctrl K', onSelect: () => setPalette(true) },
    ]);
  };

  return (
    <header className="app-drag relative z-20 flex h-14 items-center gap-2 px-2">
      <div className="flex w-[216px] items-center gap-2">
        <IconBtn tip="Go back" onClick={() => navigate(-1)} className="h-8 w-8 bg-surface/70 hover:bg-surface-2">
          <ChevronLeft className="h-5 w-5" />
        </IconBtn>
        <IconBtn tip="Go forward" onClick={() => navigate(1)} className="h-8 w-8 bg-surface/70 hover:bg-surface-2">
          <ChevronRight className="h-5 w-5" />
        </IconBtn>
      </div>

      <div className="flex flex-1 items-center justify-center gap-2">
        <IconBtn
          tip="Home"
          onClick={() => navigate('/')}
          className={cx('h-12 w-12 bg-surface-2 hover:scale-105 hover:bg-surface-3', pathname === '/' && '!text-fg')}
        >
          <House className="h-6 w-6" fill={pathname === '/' ? 'currentColor' : 'none'} />
        </IconBtn>
        <SearchBox />
      </div>

      <div className="flex w-[216px] items-center justify-end gap-1">
        {icons && (
          <>
            <IconBtn tip="Stats" active={pathname === '/stats'} onClick={() => navigate('/stats')} className="h-10 w-10 hover:bg-surface-2">
              <BarChart3 className="h-5 w-5" />
            </IconBtn>
            <IconBtn tip="Themes & settings" active={pathname === '/settings'} onClick={() => navigate('/settings')} className="h-10 w-10 hover:bg-surface-2">
              <Palette className="h-5 w-5" />
            </IconBtn>
            <IconBtn tip="Keyboard shortcuts (?)" onClick={() => setShortcuts(true)} className="h-10 w-10 hover:bg-surface-2">
              <Keyboard className="h-5 w-5" />
            </IconBtn>
            <IconBtn tip="Command palette (Ctrl+K)" onClick={() => setPalette(true)} className="h-10 w-10 hover:bg-surface-2">
              <Command className="h-5 w-5" />
            </IconBtn>
          </>
        )}
        <IconBtn tip="Menu" onClick={openAppMenu} className="h-10 w-10 bg-surface/70 hover:bg-surface-2">
          <Menu className="h-5 w-5" />
        </IconBtn>
      </div>
    </header>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const urlQuery = pathname.startsWith('/search/') ? decodeURIComponent(pathname.slice(8)) : '';
  const [value, setValue] = useState(urlQuery);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const recent = useLibrary((s) => s.recentSearches);
  const debounced = useDebounced(value.trim(), 180);
  const sugg = useQuery(open && debounced ? `suggest:${debounced}` : null, () => api.suggest(debounced), 10 * 60_000);

  useEffect(() => setValue(urlQuery), [urlQuery]);

  // Results update while typing, like Spotify; Enter additionally records the search.
  const live = useDebounced(value.trim(), 550);
  useEffect(() => {
    if (!open || !live || live === urlQuery || !pathname.startsWith('/search')) return;
    navigate(`/search/${encodeURIComponent(live)}`, { replace: pathname !== '/search' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // "/" focuses search from anywhere
  useEffect(() => {
    const onFocus = () => input.current?.focus();
    window.addEventListener('uplayer:focus-search', onFocus);
    return () => window.removeEventListener('uplayer:focus-search', onFocus);
  }, []);

  const items: { text: string; recent?: boolean }[] = value.trim()
    ? (sugg.data ?? []).map((text) => ({ text }))
    : recent.slice(0, 6).map((text) => ({ text, recent: true }));

  const submit = (q: string) => {
    const s = q.trim();
    if (!s) return;
    setValue(s);
    setOpen(false);
    useLibrary.getState().addRecentSearch(s);
    navigate(`/search/${encodeURIComponent(s)}`);
    input.current?.blur();
  };

  return (
    <div className="relative w-full max-w-[480px]">
      <div
        className={cx(
          'flex h-12 items-center gap-3 rounded-full bg-surface-2 px-3 ring-1 ring-transparent transition hover:bg-surface-3 hover:ring-line focus-within:!bg-surface-3 focus-within:ring-2 focus-within:!ring-fg',
        )}
      >
        <Search className="h-6 w-6 shrink-0 text-fg-2" />
        <input
          ref={input}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setHi(-1);
          }}
          onFocus={() => {
            setOpen(true);
            if (!pathname.startsWith('/search')) navigate('/search');
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHi((h) => Math.min(items.length - 1, h + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((h) => Math.max(-1, h - 1));
            } else if (e.key === 'Enter') {
              submit(hi >= 0 ? items[hi].text : value);
            } else if (e.key === 'Escape') {
              setOpen(false);
              input.current?.blur();
            }
          }}
          placeholder="What do you want to play? A song, an artist or a YouTube link"
          className="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-fg-3"
          aria-label="Search"
          aria-autocomplete="list"
          aria-expanded={open && items.length > 0}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setValue('');
              input.current?.focus();
              navigate('/search');
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg-2 hover:text-fg"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        <kbd className="hidden shrink-0 rounded border border-line px-1.5 text-xs text-fg-3 lg:block">/</kbd>
      </div>
      {open && items.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 top-[52px] z-50 overflow-hidden rounded-xl bg-surface-2 py-2 shadow-2xl ring-1 ring-line">
          {!value.trim() && <li className="px-4 pb-1 pt-1 text-xs font-semibold text-fg-2">Recent searches</li>}
          {items.map((it, i) => (
            <li key={it.text} role="option" aria-selected={hi === i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => submit(it.text)}
                onMouseEnter={() => setHi(i)}
                className={cx('flex w-full items-center gap-3 px-4 py-2 text-left text-[15px]', hi === i && 'bg-surface-3')}
              >
                {it.recent ? <History className="h-4 w-4 text-fg-2" /> : <Search className="h-4 w-4 text-fg-2" />}
                <span className="truncate">{it.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
