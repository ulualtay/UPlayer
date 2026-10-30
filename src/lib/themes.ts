import { useMemo } from 'react';
import { isDark, mixHex } from './color';
import { useSettings, type CustomTheme } from '../store/settings';

export interface ThemeColors {
  /** app canvas behind the panels */
  bg: string;
  /** main panels */
  surface: string;
  /** hover / raised rows */
  surface2: string;
  /** pressed / inputs */
  surface3: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
}

export interface Theme {
  id: string;
  name: string;
  tagline: string;
  dark: boolean;
  colors: ThemeColors;
  /** two soft glow colours used by the aurora background */
  glow: [string, string];
}

export const THEMES: Theme[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Black canvas, green accent',
    dark: true,
    colors: { bg: '#000000', surface: '#121212', surface2: '#1f1f1f', surface3: '#2a2a2a', text: '#ffffff', text2: '#b3b3b3', text3: '#7c7c7c', accent: '#1ed760' },
    glow: ['#1ed760', '#0b6e3a'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    tagline: 'Ink blue and lavender',
    dark: true,
    colors: { bg: '#04040b', surface: '#0d0e1b', surface2: '#171930', surface3: '#21243f', text: '#f4f3ff', text2: '#aaa9cc', text3: '#6f6e95', accent: '#a78bfa' },
    glow: ['#7c3aed', '#1d4ed8'],
  },
  {
    id: 'sunset',
    name: 'Sunset',
    tagline: 'Ember orange, warm coffee',
    dark: true,
    colors: { bg: '#0c0504', surface: '#190e0b', surface2: '#261612', surface3: '#331f19', text: '#fff4ee', text2: '#d3b2a5', text3: '#917166', accent: '#ff7a45' },
    glow: ['#f97316', '#be123c'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    tagline: 'Deep sea and cyan',
    dark: true,
    colors: { bg: '#010a0f', surface: '#06141c', surface2: '#0c202b', surface3: '#122c39', text: '#ecfbff', text2: '#9fc2ce', text3: '#5f8492', accent: '#22d3ee' },
    glow: ['#0891b2', '#1e40af'],
  },
  {
    id: 'sakura',
    name: 'Sakura',
    tagline: 'Night cherry, neon pink',
    dark: true,
    colors: { bg: '#0d060a', surface: '#190d14', surface2: '#25141f', surface3: '#321c2a', text: '#fff1f7', text2: '#d6abbf', text3: '#946a7e', accent: '#f472b6' },
    glow: ['#db2777', '#7e22ce'],
  },
  {
    id: 'nord',
    name: 'Nord',
    tagline: 'Arctic grey, ice blue',
    dark: true,
    colors: { bg: '#191d25', surface: '#21262f', surface2: '#2a303b', surface3: '#343b48', text: '#eceff4', text2: '#b6bfcd', text3: '#7f899c', accent: '#88c0d0' },
    glow: ['#5e81ac', '#8fbcbb'],
  },
  {
    id: 'gold',
    name: 'Golden Hour',
    tagline: 'Record-store yellow',
    dark: true,
    colors: { bg: '#0b0905', surface: '#16130c', surface2: '#221d13', surface3: '#2e271a', text: '#fdf8ec', text2: '#cdbf9e', text3: '#8b7f62', accent: '#fbbf24' },
    glow: ['#d97706', '#78350f'],
  },
  {
    id: 'mono',
    name: 'Mono',
    tagline: 'Just black and white',
    dark: true,
    colors: { bg: '#000000', surface: '#0e0e0e', surface2: '#1a1a1a', surface3: '#262626', text: '#fafafa', text2: '#a3a3a3', text3: '#6b6b6b', accent: '#f5f5f5' },
    glow: ['#525252', '#262626'],
  },
  {
    id: 'latte',
    name: 'Latte',
    tagline: 'Light: cream and cinnamon',
    dark: false,
    colors: { bg: '#e6e1d7', surface: '#f7f4ee', surface2: '#ece7de', surface3: '#e0dace', text: '#1c1917', text2: '#57534e', text3: '#8a847c', accent: '#c2410c' },
    glow: ['#fdba74', '#fcd34d'],
  },
  {
    id: 'ice',
    name: 'Ice',
    tagline: 'Light: snow white',
    dark: false,
    colors: { bg: '#e3e8ef', surface: '#fbfcfe', surface2: '#eef2f7', surface3: '#e2e8f0', text: '#0f172a', text2: '#475569', text3: '#8291a7', accent: '#2563eb' },
    glow: ['#93c5fd', '#c4b5fd'],
  },
];

export const ACCENT_PRESETS = ['#1ed760', '#a78bfa', '#ff7a45', '#22d3ee', '#f472b6', '#fbbf24', '#f43f5e', '#84cc16', '#38bdf8', '#e879f9'];

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Expand the four user-picked colours into a full theme. */
export function customToTheme(c: CustomTheme): Theme {
  const dark = isDark(c.bg);
  return {
    id: 'custom',
    name: 'Custom',
    tagline: 'Your own colors',
    dark,
    colors: {
      bg: c.bg,
      surface: c.surface,
      surface2: mixHex(c.surface, c.text, 0.07),
      surface3: mixHex(c.surface, c.text, 0.13),
      text: c.text,
      text2: mixHex(c.text, c.surface, 0.3),
      text3: mixHex(c.text, c.surface, 0.52),
      accent: c.accent,
    },
    glow: [c.accent, mixHex(c.accent, c.bg, 0.55)],
  };
}

export function resolveTheme(id: string, custom: CustomTheme): Theme {
  return id === 'custom' ? customToTheme(custom) : themeById(id);
}

/** The active theme, including a user's custom one. */
export function useTheme(): Theme {
  const id = useSettings((s) => s.themeId);
  const custom = useSettings((s) => s.customTheme);
  return useMemo(() => resolveTheme(id, custom), [id, custom]);
}

/** Shareable text form of a custom theme, e.g. "uplayer:#000000,#101010,#ffffff,#1ed760". */
export const themeCode = (c: CustomTheme) => `uplayer:${c.bg},${c.surface},${c.text},${c.accent}`;

export function parseThemeCode(code: string): CustomTheme | null {
  const m = code.trim().match(/^uplayer:(#[0-9a-f]{6}),(#[0-9a-f]{6}),(#[0-9a-f]{6}),(#[0-9a-f]{6})$/i);
  return m ? { bg: m[1], surface: m[2], text: m[3], accent: m[4] } : null;
}
