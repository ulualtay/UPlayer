import { create } from 'zustand';
import type { LucideIcon } from 'lucide-react';

export interface Toast {
  id: number;
  text: string;
  tone?: 'ok' | 'error' | 'info';
  thumb?: string;
  action?: { label: string; run: () => void };
}

export interface MenuItem {
  label?: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  submenu?: MenuItem[];
  divider?: boolean;
  hint?: string;
}

interface UIState {
  toasts: Toast[];
  toast: (text: string, opts?: Omit<Toast, 'id' | 'text'>) => void;
  dismissToast: (id: number) => void;

  menu: { x: number; y: number; items: MenuItem[] } | null;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  closeMenu: () => void;

  palette: boolean;
  setPalette: (open: boolean) => void;
  shortcuts: boolean;
  setShortcuts: (open: boolean) => void;
  fullscreen: boolean;
  setFullscreen: (open: boolean) => void;

  /** main scroll container offset, used for sticky page headers */
  scrollY: number;
}

let toastId = 0;

export const useUI = create<UIState>()((set, get) => ({
  toasts: [],
  toast: (text, opts) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-3), { id, text, ...opts }] });
    window.setTimeout(() => get().dismissToast(id), opts?.action ? 6000 : 3200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  menu: null,
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  closeMenu: () => set({ menu: null }),

  palette: false,
  setPalette: (palette) => set({ palette }),
  shortcuts: false,
  setShortcuts: (shortcuts) => set({ shortcuts }),
  fullscreen: false,
  setFullscreen: (fullscreen) => set({ fullscreen }),

  scrollY: 0,
}));

export const toast = (text: string, opts?: Omit<Toast, 'id' | 'text'>) => useUI.getState().toast(text, opts);
