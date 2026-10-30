import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight, CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useUI, type MenuItem } from '../store/ui';
import { Cover, cx } from './ui';

// ---------- context menu ----------

function MenuList({ items, x, y, altX, onDone }: { items: MenuItem[]; x: number; y: number; altX?: number; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [sub, setSub] = useState<{ index: number; x: number; y: number; altX: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    // submenus flip to the parent's left edge; root menus just clamp to the viewport
    if (left + r.width > window.innerWidth - 8) left = altX !== undefined ? altX - r.width : window.innerWidth - r.width - 8;
    if (top + r.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - r.height - 8);
    setPos({ left: Math.max(8, left), top });
  }, [x, y, altX]);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[90] min-w-[220px] max-w-[320px] rounded-md bg-surface-3 p-1 shadow-[0_16px_48px_rgb(0_0_0/0.5)] ring-1 ring-line"
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onMouseEnter={(e) => {
              if (it.submenu) {
                const r = e.currentTarget.getBoundingClientRect();
                setSub({ index: i, x: r.right - 4, y: r.top - 4, altX: r.left + 4 });
              } else setSub(null);
            }}
            onClick={() => {
              if (it.submenu) return;
              it.onSelect?.();
              onDone();
            }}
            className={cx(
              'flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-40',
              it.danger ? 'text-red-400 hover:bg-red-500/15' : 'text-fg hover:bg-[color-mix(in_oklab,var(--text)_10%,transparent)]',
              sub?.index === i && 'bg-[color-mix(in_oklab,var(--text)_10%,transparent)]',
            )}
          >
            {it.icon && <it.icon className="h-4 w-4 shrink-0 text-fg-2" />}
            <span className="flex-1 truncate">{it.label}</span>
            {it.hint && <span className="text-xs text-fg-3">{it.hint}</span>}
            {it.submenu && <ChevronRight className="h-4 w-4 text-fg-2" />}
          </button>
        ),
      )}
      {sub && items[sub.index]?.submenu && <MenuList items={items[sub.index].submenu!} x={sub.x} y={sub.y} altX={sub.altX} onDone={onDone} />}
    </div>
  );
}

export function ContextMenu() {
  const menu = useUI((s) => s.menu);
  const close = useUI((s) => s.closeMenu);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[role="menu"]')) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [menu, close]);
  if (!menu) return null;
  return createPortal(<MenuList key={`${menu.x}-${menu.y}`} items={menu.items} x={menu.x} y={menu.y} onDone={close} />, document.body);
}

// ---------- toasts ----------

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-[96px] left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="pointer-events-auto flex max-w-[520px] items-center gap-3 rounded-lg bg-fg py-2.5 pl-3 pr-2 text-sm font-medium text-bg shadow-2xl"
          >
            {t.thumb ? (
              <Cover src={t.thumb} size={60} className="h-7 w-7 rounded" />
            ) : t.tone === 'error' ? (
              <CircleAlert className="h-5 w-5 text-red-500" />
            ) : t.tone === 'ok' ? (
              <CircleCheck className="h-5 w-5" />
            ) : (
              <Info className="h-5 w-5" />
            )}
            <span className="min-w-0 flex-1">{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
                className="rounded-full px-3 py-1 text-sm font-bold hover:bg-bg/10"
              >
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Close" onClick={() => dismiss(t.id)} className="grid h-6 w-6 place-items-center rounded-full opacity-60 hover:bg-bg/10 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------- keyboard shortcut sheet ----------

const SHORTCUTS: [string, string[]][] = [
  ['Play / pause', ['Space']],
  ['Next song', ['Ctrl', '→']],
  ['Previous song', ['Ctrl', '←']],
  ['Seek 5 s forward / back', ['→', '←']],
  ['Volume up / down', ['Ctrl', '↑ ↓']],
  ['Mute', ['M']],
  ['Shuffle', ['S']],
  ['Repeat mode', ['R']],
  ['Like', ['L']],
  ['Fullscreen', ['F']],
  ['Queue panel', ['Q']],
  ['Lyrics panel', ['Y']],
  ['Focus search', ['/']],
  ['Command palette', ['Ctrl', 'K']],
  ['This dialog', ['?']],
];

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcuts);
  const set = useUI((s) => s.setShortcuts);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] grid place-items-center bg-black/60 backdrop-blur-sm"
          onMouseDown={() => set(false)}
        >
          <motion.div
            initial={{ scale: 0.96, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 10 }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-[480px] max-w-[92vw] rounded-xl bg-surface-2 p-6 shadow-2xl ring-1 ring-line"
            role="dialog"
            aria-label="Keyboard shortcuts"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Keyboard shortcuts</h2>
              <button aria-label="Close" onClick={() => set(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface-3">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-1">
              {SHORTCUTS.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-surface-3">
                  <span className="text-fg-2">{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <kbd key={k} className="min-w-7 rounded border border-line bg-surface-3 px-2 py-0.5 text-center text-xs font-semibold">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
