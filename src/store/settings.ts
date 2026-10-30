import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PRESET } from '../lib/presets';
import { durableJSON } from '../lib/durable';

export type Background = 'solid' | 'aurora' | 'cover';
export type RightPanel = 'now' | 'queue' | 'lyrics' | null;
export type VizStyle = 'halo' | 'bars' | 'dots' | 'wave';
/** colour washed over page headers (home, playlists, albums, artists) */
export type TintMode = 'cover' | 'accent' | 'black' | 'custom' | 'off';
export type Radius = 'sharp' | 'soft' | 'round';
export type Density = 'compact' | 'cozy' | 'roomy';
export type FontId = 'figtree' | 'inter' | 'manrope' | 'space' | 'dm' | 'system';

/** The four colours a user picks for their own theme; the rest is derived. */
export interface CustomTheme {
  bg: string;
  surface: string;
  text: string;
  accent: string;
}

export interface SettingsState {
  themeId: string;
  /** user-picked accent overriding the theme's own */
  accent: string | null;
  /** take the accent from the playing cover */
  dynamicAccent: boolean;
  background: Background;
  grain: boolean;
  /** keep playing similar songs when the queue runs out */
  autoplay: boolean;
  rightPanel: RightPanel;
  libraryCollapsed: boolean;
  libraryWidth: number;
  /** seconds of overlap between songs; 0 = off */
  crossfade: number;
  /** draw the live spectrum visualizers */
  visualizer: boolean;
  vizStyle: VizStyle;
  /** background and accents breathe with the bass */
  beatPulse: boolean;
  /** visualizer sensitivity multiplier */
  vizGain: number;

  // ---- customization ----
  tintMode: TintMode;
  tintColor: string;
  /** 0..1, how strongly the header colour shows */
  tintStrength: number;
  customTheme: CustomTheme;
  radius: Radius;
  density: Density;
  font: FontId;
  /** whole-interface zoom, 0.85..1.25 */
  uiScale: number;
  /** glass panels: how opaque (0.35..1) and how blurred (px) */
  panelOpacity: number;
  glassBlur: number;
  /** 0..1.5 multiplier for the aurora background */
  auroraIntensity: number;
  playButton: 'accent' | 'white';
  floatingPlayer: boolean;
  highContrast: boolean;
  reduceMotion: boolean;

  // ---- what's on screen (see lib/presets) ----
  /** Stats / Settings / Shortcuts / Command buttons next to the search bar */
  topbarIcons: boolean;
  /** Lyrics and Download buttons in the player bar */
  playerExtras: boolean;
  /** filter chips, search and sort above Your Library */
  libraryFilters: boolean;
  pinLiked: boolean;
  pinDownloads: boolean;
  /** Wrapped, On this day and forgotten favorites on Home */
  homeMemories: boolean;
  /** the first-run style picker has been answered */
  onboarded: boolean;

  // ---- desktop app ----
  /** the window's close button hides to the tray and music keeps playing */
  closeToTray: boolean;
  openAtLogin: boolean;

  set: (patch: Partial<Omit<SettingsState, 'set' | 'toggleRight'>>) => void;
  toggleRight: (panel: Exclude<RightPanel, null>) => void;
}

export const DEFAULT_CUSTOM: CustomTheme = { bg: '#000000', surface: '#101010', text: '#ffffff', accent: '#1ed760' };

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      themeId: 'classic',
      accent: null,
      autoplay: true,
      rightPanel: DEFAULT_PRESET.panel,
      libraryCollapsed: false,
      libraryWidth: 300,
      crossfade: 6,
      visualizer: true,
      vizGain: 1,

      tintColor: '#1e3a8a',
      customTheme: DEFAULT_CUSTOM,
      font: 'figtree',
      uiScale: 1,
      panelOpacity: 0.7,
      glassBlur: 28,
      auroraIntensity: 1,
      playButton: 'accent',
      highContrast: false,
      reduceMotion: false,

      // a calm first impression; the first-run picker and Settings → Style offer the rest
      ...DEFAULT_PRESET.values,
      onboarded: false,

      closeToTray: true,
      openAtLogin: false,

      set: (patch) => set(patch),
      toggleRight: (panel) => set({ rightPanel: get().rightPanel === panel ? null : panel }),
    }),
    {
      name: 'uplayer-settings',
      version: 2,
      storage: durableJSON(),
      migrate: (persisted, version) => {
        const s = persisted as Partial<SettingsState>;
        // v2 introduced styles: start everyone on the calm default and let them pick (theme and colors are kept)
        if (version < 2) return { ...s, ...DEFAULT_PRESET.values, rightPanel: DEFAULT_PRESET.panel, onboarded: false };
        return s;
      },
    },
  ),
);
