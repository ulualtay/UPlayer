import { useEffect } from 'react';
import { hexToRgb, inkFor, mixHex, oklchHex, rgbToOklch, tuneAccent, tuneHeader } from '../lib/color';
import { useCoverColor } from '../lib/hooks';
import { useTheme } from '../lib/themes';
import { usePlayer } from '../store/player';
import { useSettings, type FontId } from '../store/settings';
import { img } from '../lib/format';

export const FONTS: Record<FontId, { label: string; stack: string }> = {
  figtree: { label: 'Figtree', stack: "'Figtree Variable', ui-sans-serif, system-ui, sans-serif" },
  inter: { label: 'Inter', stack: "'Inter Variable', ui-sans-serif, system-ui, sans-serif" },
  manrope: { label: 'Manrope', stack: "'Manrope Variable', ui-sans-serif, system-ui, sans-serif" },
  space: { label: 'Space Grotesk', stack: "'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif" },
  dm: { label: 'DM Sans', stack: "'DM Sans Variable', ui-sans-serif, system-ui, sans-serif" },
  system: { label: 'System', stack: "'Segoe UI Variable', 'Segoe UI', system-ui, -apple-system, sans-serif" },
};

/** Writes the active theme and every customization into CSS custom properties on <html>. */
export function ThemeController() {
  const s = useSettings();
  const t = useTheme();
  const thumb = usePlayer((p) => p.current?.track.thumb);
  const cover = useCoverColor(thumb);

  useEffect(() => {
    const c = t.colors;
    const root = document.documentElement;
    const acc = s.dynamicAccent && cover ? tuneAccent(cover, t.dark) : (s.accent ?? c.accent);
    let vivid = c.surface3;
    if (cover) {
      const [, C, H] = rgbToOklch(hexToRgb(cover));
      vivid = oklchHex(t.dark ? 0.55 : 0.8, Math.max(C, 0.08), H);
    }
    const glass = s.background !== 'solid';
    const vars: Record<string, string> = {
      '--bg': c.bg,
      '--surface': c.surface,
      '--surface-2': c.surface2,
      '--surface-3': c.surface3,
      '--text': c.text,
      // high contrast pulls secondary text towards the primary colour
      '--text-2': s.highContrast ? mixHex(c.text2, c.text, 0.55) : c.text2,
      '--text-3': s.highContrast ? mixHex(c.text3, c.text, 0.5) : c.text3,
      '--accent': acc,
      '--accent-ink': inkFor(acc),
      '--cover': vivid,
      '--cover-deep': cover ? tuneHeader(cover, t.dark) : c.surface3,
      '--glow-1': t.glow[0],
      '--glow-2': t.glow[1],
      '--panel': glass ? `color-mix(in oklab, ${c.surface} ${Math.round(s.panelOpacity * 100)}%, transparent)` : c.surface,
      '--panel-blur': `${s.glassBlur}px`,
      '--aurora-k': String(s.auroraIntensity),
      '--app-font': FONTS[s.font].stack,
    };
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.style.fontSize = `${16 * s.uiScale}px`;
    root.style.colorScheme = t.dark ? 'dark' : 'light';
    Object.assign(root.dataset, {
      bg: s.background,
      dark: String(t.dark),
      radius: s.radius,
      density: s.density,
      play: s.playButton,
      motion: s.reduceMotion ? 'reduce' : 'full',
    });
    document.body.classList.toggle('grain', s.grain);
    window.uplayer?.setTitleBar(c.bg, c.text);
  }, [t, s.accent, s.dynamicAccent, s.background, s.grain, s.highContrast, s.panelOpacity, s.glassBlur, s.auroraIntensity, s.font, s.uiScale, s.radius, s.density, s.playButton, s.reduceMotion, cover]);

  return null;
}

/** Ambient layer behind the panels: drifting aurora or a blurred cover. */
export function Backdrop() {
  const background = useSettings((s) => s.background);
  const thumb = usePlayer((s) => s.current?.track.thumb);
  if (background === 'aurora') {
    return (
      <div className="aurora" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    );
  }
  if (background === 'cover' && thumb) {
    return (
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <img
          key={thumb}
          src={img(thumb, 120)}
          alt=""
          className="absolute inset-[-10%] h-[120%] w-[120%] object-cover opacity-70 blur-[70px] saturate-150 transition-opacity duration-700"
        />
        <div className="absolute inset-0 bg-bg/55" />
      </div>
    );
  }
  return null;
}
