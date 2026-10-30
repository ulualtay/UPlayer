// Ready-made "personalities": each sets how busy the interface is and how it
// feels (background, motion, shape), but never touches your theme or colors.

import type { RightPanel, SettingsState } from '../store/settings';

export const PRESET_KEYS = [
  'topbarIcons',
  'playerExtras',
  'libraryFilters',
  'pinLiked',
  'pinDownloads',
  'homeMemories',
  'background',
  'grain',
  'beatPulse',
  'floatingPlayer',
  'density',
  'radius',
  'tintMode',
  'tintStrength',
  'dynamicAccent',
  'vizStyle',
] as const satisfies readonly (keyof SettingsState)[];

export type PresetValues = Pick<SettingsState, (typeof PRESET_KEYS)[number]>;

export interface Preset {
  id: 'minimal' | 'classic' | 'vibes' | 'power';
  name: string;
  tagline: string;
  values: PresetValues;
  /** the side panel to open when the preset is picked (not part of matching: it changes all the time) */
  panel: RightPanel;
}

export const PRESETS: Preset[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    tagline: 'Just search and play. Nothing else on screen.',
    panel: null,
    values: {
      topbarIcons: false,
      playerExtras: false,
      libraryFilters: false,
      pinLiked: false,
      pinDownloads: false,
      homeMemories: false,
      background: 'solid',
      grain: false,
      beatPulse: false,
      floatingPlayer: false,
      density: 'cozy',
      radius: 'soft',
      tintMode: 'cover',
      tintStrength: 0.6,
      dynamicAccent: false,
      vizStyle: 'halo',
    },
  },
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'The familiar streaming-app layout with Now playing on the side.',
    panel: 'now',
    values: {
      topbarIcons: false,
      playerExtras: true,
      libraryFilters: true,
      pinLiked: true,
      pinDownloads: true,
      homeMemories: true,
      background: 'solid',
      grain: false,
      beatPulse: false,
      floatingPlayer: false,
      density: 'cozy',
      radius: 'soft',
      tintMode: 'cover',
      tintStrength: 1,
      dynamicAccent: false,
      vizStyle: 'bars',
    },
  },
  {
    id: 'vibes',
    name: 'Vibes',
    tagline: 'Moody light that moves with the music. Round, roomy, floating.',
    panel: 'now',
    values: {
      topbarIcons: false,
      playerExtras: true,
      libraryFilters: false,
      pinLiked: true,
      pinDownloads: false,
      homeMemories: true,
      background: 'aurora',
      grain: true,
      beatPulse: true,
      floatingPlayer: true,
      density: 'roomy',
      radius: 'round',
      tintMode: 'cover',
      tintStrength: 1,
      dynamicAccent: true,
      vizStyle: 'halo',
    },
  },
  {
    id: 'power',
    name: 'Power user',
    tagline: 'Every button, shortcut and shelf. Compact and sharp.',
    panel: 'now',
    values: {
      topbarIcons: true,
      playerExtras: true,
      libraryFilters: true,
      pinLiked: true,
      pinDownloads: true,
      homeMemories: true,
      background: 'aurora',
      grain: true,
      beatPulse: true,
      floatingPlayer: false,
      density: 'compact',
      radius: 'sharp',
      tintMode: 'cover',
      tintStrength: 1,
      dynamicAccent: false,
      vizStyle: 'bars',
    },
  },
];

export const DEFAULT_PRESET = PRESETS[0];

/** The preset the current settings match exactly, if any. */
export function matchPreset(s: PresetValues): Preset | undefined {
  return PRESETS.find((p) => PRESET_KEYS.every((k) => s[k] === p.values[k]));
}
