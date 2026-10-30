import { useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AudioLines,
  Check,
  CircleArrowDown,
  ClipboardPaste,
  Copy,
  Database,
  Download,
  FlaskConical,
  FolderOpen,
  LayoutTemplate,
  Monitor,
  Paintbrush,
  Palette,
  Pipette,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { ACCENT_PRESETS, THEMES, customToTheme, parseThemeCode, themeCode, useTheme, type Theme } from '../lib/themes';
import { generateDemoHistory } from '../lib/demo';
import { count, nf } from '../lib/format';
import { DEFAULT_CUSTOM, useSettings, type Background, type CustomTheme, type Density, type FontId, type Radius, type TintMode, type VizStyle } from '../store/settings';
import { useHistory } from '../store/history';
import { useLibrary } from '../store/library';
import { fmtBytes, useDownloads } from '../store/downloads';
import { toast } from '../store/ui';
import { Spinner, Switch, cx } from '../components/ui';
import { Slider } from '../components/Slider';
import { Visualizer } from '../components/Visualizer';
import { VIZ_STYLES } from '../components/FullscreenPlayer';
import { FONTS } from '../components/ThemeController';
import { PresetCard, applyPreset, useActivePreset } from '../components/StylePicker';
import { PRESETS } from '../lib/presets';

type TabId = 'style' | 'themes' | 'customize' | 'playback' | 'visualizer' | 'downloads' | 'desktop' | 'data';
const TABS: { id: TabId; label: string; icon: LucideIcon; desktopOnly?: boolean }[] = [
  { id: 'style', label: 'Style', icon: LayoutTemplate },
  { id: 'themes', label: 'Themes', icon: Palette },
  { id: 'customize', label: 'Customize', icon: SlidersHorizontal },
  { id: 'playback', label: 'Playback', icon: Play },
  { id: 'visualizer', label: 'Visualizer', icon: AudioLines },
  { id: 'downloads', label: 'Downloads', icon: CircleArrowDown },
  { id: 'desktop', label: 'Desktop', icon: Monitor, desktopOnly: true },
  { id: 'data', label: 'Data', icon: Database },
];

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => !t.desktopOnly || window.uplayer);
  const tab = (tabs.find((t) => t.id === params.get('tab'))?.id ?? 'style') as TabId;
  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-6">
      <h1 className="text-[32px] font-extrabold tracking-tight">Settings</h1>
      <p className="mb-5 text-fg-2">Make UPlayer yours. Every change applies instantly.</p>
      <div className="no-scrollbar sticky top-0 z-10 -mx-2 mb-8 flex gap-1 overflow-x-auto bg-panel px-2 py-2 backdrop-blur-xl">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={cx(
              'flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition',
              tab === t.id ? 'bg-fg text-bg' : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'style' && <StyleTab />}
      {tab === 'themes' && <ThemesTab />}
      {tab === 'customize' && <CustomizeTab />}
      {tab === 'playback' && <PlaybackTab />}
      {tab === 'visualizer' && <VisualizerTab />}
      {tab === 'downloads' && <DownloadsTab />}
      {tab === 'desktop' && <DesktopTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}

// ---------- building blocks ----------

function Section({ title, desc, children, action }: { title: string; desc?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-xl font-bold">{title}</h2>
        {action}
      </div>
      {desc ? <p className="mb-4 text-sm text-fg-2">{desc}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-6 rounded-lg bg-surface-2 px-4 py-3">
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        {desc && <div className="text-sm text-fg-2">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-full bg-surface-3 p-1">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cx('rounded-full px-3.5 py-1.5 text-sm font-semibold transition', value === v ? 'bg-fg text-bg' : 'text-fg-2 hover:text-fg')}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Slider over an arbitrary [min, max] range with a value readout. */
function Range({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  const span = max - min;
  const toPct = (v: number) => ((v - min) / span) * 100;
  const fromPct = (p: number) => Math.round((min + (p / 100) * span) / step) * step;
  return (
    <div className="flex w-64 shrink-0 items-center gap-3">
      <Slider className="flex-1" label={label} value={toPct(value)} max={100} step={(step / span) * 100} valueText={(p) => format(fromPct(p))} onInput={(p) => onChange(fromPct(p))} onCommit={(p) => onChange(fromPct(p))} />
      <span className="w-14 text-right text-sm tabular-nums text-fg-2">{format(value)}</span>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-2 p-3 transition hover:bg-surface-3">
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md ring-1 ring-line" style={{ background: value }}>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block font-mono text-xs uppercase text-fg-2">{value}</span>
      </span>
    </label>
  );
}

function Swatch({ color, active, label, onClick }: { color: string; active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-tip={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx('grid h-10 w-10 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-bg transition hover:scale-110', active ? 'ring-fg' : 'ring-transparent')}
      style={{ background: color }}
    >
      {active && <Check className="h-4 w-4 mix-blend-difference" color="#fff" />}
    </button>
  );
}

// ---------- Style ----------

function StyleTab() {
  const s = useSettings();
  const active = useActivePreset();
  const toggle = (title: string, desc: string, value: boolean, onChange: (v: boolean) => void) => (
    <Row title={title} desc={desc}>
      <Switch checked={value} onChange={onChange} label={title} />
    </Row>
  );
  return (
    <>
      <Section
        title="Style"
        desc="Ready-made layouts, from calm to everything-on. Your theme and colors stay as they are."
        action={!active && <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-bold text-fg-2">Custom mix</span>}
      >
        <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
          {PRESETS.map((p) => (
            <PresetCard key={p.id} preset={p} active={active?.id === p.id} onClick={() => applyPreset(p)} />
          ))}
        </div>
      </Section>

      <Section title="What's on screen" desc="Switch single parts on or off. Anything hidden is still one click away in the menu at the top right.">
        <h3 className="mt-2 text-sm font-bold uppercase tracking-wider text-fg-3">Top & bottom</h3>
        {toggle('Top bar shortcuts', 'Stats, Settings, Keyboard shortcuts and Command palette buttons next to the menu.', s.topbarIcons, (topbarIcons) => s.set({ topbarIcons }))}
        {toggle('Player bar extras', 'Lyrics and Download buttons in the player bar.', s.playerExtras, (playerExtras) => s.set({ playerExtras }))}
        {toggle('Now playing panel', 'The big cover, visualizer and lyrics on the right side.', s.rightPanel !== null, (v) => s.set({ rightPanel: v ? 'now' : null }))}

        <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-fg-3">Your Library</h3>
        {toggle('Liked Songs', 'Pinned at the top of Your Library.', s.pinLiked, (pinLiked) => s.set({ pinLiked }))}
        {toggle('Downloads', 'Your offline songs, pinned at the top of Your Library.', s.pinDownloads, (pinDownloads) => s.set({ pinDownloads }))}
        {toggle('Filters, search and sort', 'Playlists / Albums / Artists chips above the list.', s.libraryFilters, (libraryFilters) => s.set({ libraryFilters }))}

        <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-fg-3">Home</h3>
        {toggle('Memories', 'Wrapped, “On this day” and forgotten favorites.', s.homeMemories, (homeMemories) => s.set({ homeMemories }))}      </Section>
    </>
  );
}

// ---------- Themes ----------

function ThemesTab() {
  const s = useSettings();
  const theme = useTheme();
  const accent = s.accent ?? theme.colors.accent;
  const custom = customToTheme(s.customTheme);
  return (
    <>
      <Section title="Theme" desc="Each theme brings its own canvas, surface and accent colors. Build your own under Customize.">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {THEMES.map((t) => (
            <ThemeCard key={t.id} theme={t} active={s.themeId === t.id} onClick={() => s.set({ themeId: t.id, accent: null })} />
          ))}
          <ThemeCard theme={custom} active={s.themeId === 'custom'} badge={<Paintbrush className="h-4 w-4" />} onClick={() => s.set({ themeId: 'custom', accent: null })} />
        </div>
      </Section>

      <Section title="Accent color" desc="Buttons, the progress bar and active items use this color.">
        <div className="flex flex-wrap items-center gap-3">
          <Swatch color={theme.colors.accent} active={!s.accent && !s.dynamicAccent} label="Theme default" onClick={() => s.set({ accent: null, dynamicAccent: false })} />
          <span className="mx-1 h-8 w-px bg-line" />
          {ACCENT_PRESETS.filter((c) => c !== theme.colors.accent).map((c) => (
            <Swatch key={c} color={c} active={s.accent === c && !s.dynamicAccent} label={c} onClick={() => s.set({ accent: c, dynamicAccent: false })} />
          ))}
          <label data-tip="Custom color" className="relative grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-surface-3 text-fg-2 hover:text-fg">
            <Pipette className="h-4 w-4" />
            <input type="color" value={accent} onChange={(e) => s.set({ accent: e.target.value, dynamicAccent: false })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom accent color" />
          </label>
        </div>
        <Row title="Match cover art" desc="The accent follows the cover of the song that is playing.">
          <Switch checked={s.dynamicAccent} onChange={(v) => s.set({ dynamicAccent: v })} label="Match cover art" />
        </Row>
      </Section>

      <Section title="Background" desc="What sits behind the panels. Fine-tune glass and light under Customize.">
        <div className="grid grid-cols-3 gap-4">
          {(
            [
              ['solid', 'Solid', 'Classic and distraction-free'],
              ['aurora', 'Aurora', 'Light drifting in cover and theme colors'],
              ['cover', 'Cover', 'A blurred cover of the current song'],
            ] as [Background, string, string][]
          ).map(([k, label, desc]) => (
            <button
              key={k}
              type="button"
              onClick={() => s.set({ background: k })}
              className={cx('overflow-hidden rounded-xl text-left ring-2 transition', s.background === k ? 'ring-accent' : 'ring-transparent hover:ring-line')}
            >
              <BgPreview kind={k} theme={theme} accent={accent} />
              <div className="bg-surface-2 p-3">
                <div className="font-bold">{label}</div>
                <div className="text-xs text-fg-2">{desc}</div>
              </div>
            </button>
          ))}
        </div>
        <Row title="Film grain" desc="Adds a very subtle texture to surfaces.">
          <Switch checked={s.grain} onChange={(v) => s.set({ grain: v })} label="Film grain" />
        </Row>
      </Section>
    </>
  );
}

/** A miniature of the whole app painted with the theme's colours. */
function ThemeCard({ theme: t, active, onClick, badge }: { theme: Theme; active: boolean; onClick: () => void; badge?: ReactNode }) {
  const c = t.colors;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx('group overflow-hidden rounded-xl text-left ring-2 transition hover:-translate-y-0.5', active ? 'ring-accent' : 'ring-transparent hover:ring-line')}
    >
      <div className="relative aspect-[16/10] p-1.5" style={{ background: c.bg }}>
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-40 blur-2xl" style={{ background: t.glow[0] }} />
        <div className="relative grid h-[calc(100%-18px)] grid-cols-[28%_1fr] gap-1">
          <div className="space-y-1 rounded p-1.5" style={{ background: c.surface }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i === 0 ? c.accent : c.surface3 }} />
                <span className="h-1 flex-1 rounded" style={{ background: c.text3 }} />
              </div>
            ))}
          </div>
          <div className="rounded p-1.5" style={{ background: `linear-gradient(${c.surface3}, ${c.surface} 60%)` }}>
            <div className="mb-1 h-1.5 w-1/2 rounded" style={{ background: c.text }} />
            <div className="mb-2 h-1 w-1/3 rounded" style={{ background: c.text2 }} />
            <div className="grid grid-cols-3 gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-square rounded-sm" style={{ background: c.surface2 }} />
              ))}
            </div>
          </div>
        </div>
        <div className="relative mt-1 flex h-3 items-center gap-1 px-1">
          <span className="h-2 w-2 rounded-full" style={{ background: c.text }} />
          <span className="h-0.5 flex-1 rounded" style={{ background: c.surface3 }}>
            <span className="block h-full w-2/5 rounded" style={{ background: c.accent }} />
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between bg-surface-2 px-3 py-2.5">
        <div>
          <div className="flex items-center gap-1.5 font-bold">
            {badge}
            {t.name}
          </div>
          <div className="text-xs text-fg-2">{t.tagline}</div>
        </div>
        <span className="h-5 w-5 rounded-full ring-2 ring-surface-3" style={{ background: c.accent }} />
      </div>
    </button>
  );
}

function BgPreview({ kind, theme, accent }: { kind: Background; theme: Theme; accent: string }) {
  const c = theme.colors;
  return (
    <div className="relative aspect-[16/9] overflow-hidden" style={{ background: c.bg }}>
      {kind === 'aurora' && (
        <>
          <div className="absolute left-[10%] top-[10%] h-2/3 w-1/2 rounded-full opacity-70 blur-2xl" style={{ background: theme.glow[0] }} />
          <div className="absolute bottom-0 right-[5%] h-2/3 w-1/2 rounded-full opacity-70 blur-2xl" style={{ background: theme.glow[1] }} />
        </>
      )}
      {kind === 'cover' && <div className="absolute inset-0 opacity-80 blur-xl" style={{ background: `linear-gradient(135deg, ${accent}, ${theme.glow[1]}, ${c.bg})` }} />}
      <div
        className="absolute inset-3 rounded-md"
        style={{
          background: kind === 'solid' ? c.surface : `color-mix(in oklab, ${c.surface} 65%, transparent)`,
          backdropFilter: kind === 'solid' ? undefined : 'blur(8px)',
        }}
      >
        <div className="m-2 h-1.5 w-1/3 rounded" style={{ background: c.text }} />
        <div className="mx-2 h-1 w-1/4 rounded" style={{ background: c.text2 }} />
      </div>
    </div>
  );
}

// ---------- Customize ----------

const TINTS: { id: TintMode; label: string; desc: string }[] = [
  { id: 'cover', label: 'Cover color', desc: 'Each page takes its artwork’s color' },
  { id: 'accent', label: 'Accent', desc: 'Your accent color everywhere' },
  { id: 'black', label: 'Black', desc: 'Deep black, no color' },
  { id: 'custom', label: 'Custom', desc: 'One color you pick' },
  { id: 'off', label: 'Off', desc: 'Plain panels' },
];

const CUSTOM_PRESETS: { name: string; c: CustomTheme }[] = [
  { name: 'OLED black', c: { bg: '#000000', surface: '#000000', text: '#ffffff', accent: '#1ed760' } },
  { name: 'Graphite', c: { bg: '#0b0c0f', surface: '#16181d', text: '#e8eaed', accent: '#8ab4f8' } },
  { name: 'Espresso', c: { bg: '#120c08', surface: '#1d1510', text: '#f3e9df', accent: '#d39a5c' } },
  { name: 'Forest', c: { bg: '#06100b', surface: '#0d1b14', text: '#e6f4ea', accent: '#5fd38d' } },
  { name: 'Synthwave', c: { bg: '#0b0618', surface: '#160d2b', text: '#f6eaff', accent: '#ff3cac' } },
  { name: 'Paper', c: { bg: '#e9e7e1', surface: '#fbfaf7', text: '#1f1f1f', accent: '#e4572e' } },
];

function CustomizeTab() {
  const s = useSettings();
  const theme = useTheme();
  const [code, setCode] = useState('');
  const editCustom = (patch: Partial<CustomTheme>) => s.set({ customTheme: { ...s.customTheme, ...patch }, themeId: 'custom', accent: null });

  return (
    <>
      <Section
        title="Page color"
        desc="The color washed across the top of the home page, playlists, albums and artists."
        action={
          <button onClick={() => s.set({ tintMode: 'cover', tintStrength: 1 })} className="flex items-center gap-1.5 text-sm font-semibold text-fg-2 hover:text-fg">
            <RotateCcw className="h-3.5 w-3.5" /> Default
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-5">
          {TINTS.map((t) => {
            // what the top of a page looks like in this mode (cover uses a sample artwork brown)
            const top =
              t.id === 'cover'
                ? '#7a4a2b'
                : t.id === 'accent'
                  ? 'color-mix(in oklab, var(--accent) 55%, var(--surface))'
                  : t.id === 'black'
                    ? '#000'
                    : t.id === 'custom'
                      ? s.tintColor
                      : 'var(--surface)';
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => s.set({ tintMode: t.id })}
                className={cx('overflow-hidden rounded-xl text-left ring-2 transition', s.tintMode === t.id ? 'ring-accent' : 'ring-transparent hover:ring-line')}
              >
                <div className="relative h-20 bg-surface">
                  <div className="absolute inset-0" style={{ background: `linear-gradient(${top}, var(--surface))` }} />
                  <div className="absolute bottom-3 left-3 h-2 w-16 rounded bg-fg/90" />
                  <div className="absolute bottom-7 left-3 h-1.5 w-10 rounded bg-fg/50" />
                </div>
                <div className="bg-surface-2 p-3">
                  <div className="text-sm font-bold">{t.label}</div>
                  <div className="text-xs text-fg-2">{t.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
        {s.tintMode === 'custom' && (
          <div className="mt-3 max-w-xs">
            <ColorField label="Page color" value={s.tintColor} onChange={(v) => s.set({ tintColor: v })} />
          </div>
        )}
        <Row title="Strength" desc="How strongly the color shows before fading into the page.">
          <Range label="Page color strength" value={s.tintStrength} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => s.set({ tintStrength: v })} />
        </Row>
      </Section>

      <Section
        title="Your own theme"
        desc="Pick four colors; hover and secondary shades are worked out for you."
        action={
          s.themeId === 'custom' ? (
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-ink">Active</span>
          ) : (
            <button
              onClick={() => {
                const c = theme.colors;
                s.set({ customTheme: { bg: c.bg, surface: c.surface, text: c.text, accent: s.accent ?? c.accent }, themeId: 'custom', accent: null });
                toast('Custom theme started from your current theme', { tone: 'ok' });
              }}
              className="rounded-full bg-fg px-4 py-1.5 text-sm font-bold text-bg transition hover:scale-105"
            >
              Start from current theme
            </button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          <ColorField label="Background" value={s.customTheme.bg} onChange={(v) => editCustom({ bg: v })} />
          <ColorField label="Panels" value={s.customTheme.surface} onChange={(v) => editCustom({ surface: v })} />
          <ColorField label="Text" value={s.customTheme.text} onChange={(v) => editCustom({ text: v })} />
          <ColorField label="Accent" value={s.customTheme.accent} onChange={(v) => editCustom({ accent: v })} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {CUSTOM_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => editCustom(p.c)}
              className="flex items-center gap-2 rounded-full bg-surface-2 py-1.5 pl-1.5 pr-3 text-sm font-semibold hover:bg-surface-3"
            >
              <span className="flex h-6 w-6 overflow-hidden rounded-full ring-1 ring-line">
                <span className="w-1/2" style={{ background: p.c.surface }} />
                <span className="w-1/2" style={{ background: p.c.accent }} />
              </span>
              {p.name}
            </button>
          ))}
          <button type="button" onClick={() => editCustom(DEFAULT_CUSTOM)} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-fg-2 hover:text-fg">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-3">
          <span className="text-sm font-semibold">Theme code</span>
          <code className="truncate rounded bg-surface-3 px-2 py-1 font-mono text-xs text-fg-2">{themeCode(s.customTheme)}</code>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(themeCode(s.customTheme));
              toast('Theme code copied', { tone: 'ok' });
            }}
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-fg-2 hover:bg-surface-3 hover:text-fg"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          <span className="mx-1 h-5 w-px bg-line" />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste a theme code"
            className="h-8 min-w-48 flex-1 rounded bg-surface-3 px-2 font-mono text-xs outline-none placeholder:font-sans placeholder:text-fg-3"
          />
          <button
            onClick={() => {
              const parsed = parseThemeCode(code);
              if (!parsed) return toast('That doesn’t look like a UPlayer theme code', { tone: 'error' });
              editCustom(parsed);
              setCode('');
              toast('Theme applied', { tone: 'ok' });
            }}
            className="flex items-center gap-1.5 rounded-full bg-fg px-3 py-1 text-sm font-bold text-bg"
          >
            <ClipboardPaste className="h-3.5 w-3.5" /> Apply
          </button>
        </div>
      </Section>

      <Section title="Shape & layout">
        <Row title="Corners" desc="From crisp and sharp to soft and bubbly.">
          <Segmented<Radius> label="Corners" value={s.radius} onChange={(radius) => s.set({ radius })} options={[['sharp', 'Sharp'], ['soft', 'Soft'], ['round', 'Round']]} />
        </Row>
        <Row title="Density" desc="Spacing between panels and the height of song rows.">
          <Segmented<Density> label="Density" value={s.density} onChange={(density) => s.set({ density })} options={[['compact', 'Compact'], ['cozy', 'Cozy'], ['roomy', 'Roomy']]} />
        </Row>
        <Row title="Interface size" desc="Zoom the whole app in or out.">
          <Range label="Interface size" value={s.uiScale} min={0.85} max={1.25} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(uiScale) => s.set({ uiScale })} />
        </Row>
        <Row title="Floating player bar" desc="Lift the player into its own rounded panel.">
          <Switch checked={s.floatingPlayer} onChange={(v) => s.set({ floatingPlayer: v })} label="Floating player bar" />
        </Row>
      </Section>

      <Section title="Typography">
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
          {(Object.entries(FONTS) as [FontId, (typeof FONTS)[FontId]][]).map(([id, f]) => (
            <button
              key={id}
              type="button"
              onClick={() => s.set({ font: id })}
              className={cx('rounded-xl bg-surface-2 p-4 text-left ring-2 transition', s.font === id ? 'ring-accent' : 'ring-transparent hover:ring-line')}
              style={{ fontFamily: f.stack }}
            >
              <div className="text-3xl font-extrabold tracking-tight">Aa</div>
              <div className="mt-1 text-lg font-bold">Good evening</div>
              <div className="text-sm text-fg-2">{f.label}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Surfaces & light">
        <Row title="Play buttons" desc="Big round play buttons in your accent color, or plain white.">
          <Segmented<'accent' | 'white'> label="Play buttons" value={s.playButton} onChange={(playButton) => s.set({ playButton })} options={[['accent', 'Accent'], ['white', 'White']]} />
        </Row>
        <Row title="Glass opacity" desc={s.background === 'solid' ? 'Used with the Aurora and Cover backgrounds.' : 'How see-through the panels are.'}>
          <Range label="Glass opacity" value={s.panelOpacity} min={0.35} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(panelOpacity) => s.set({ panelOpacity })} />
        </Row>
        <Row title="Glass blur" desc="How much the background is blurred behind the panels.">
          <Range label="Glass blur" value={s.glassBlur} min={0} max={60} step={2} format={(v) => `${v}px`} onChange={(glassBlur) => s.set({ glassBlur })} />
        </Row>
        <Row title="Aurora intensity" desc="Brightness of the drifting light in the Aurora background.">
          <Range label="Aurora intensity" value={s.auroraIntensity} min={0} max={1.5} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(auroraIntensity) => s.set({ auroraIntensity })} />
        </Row>
        <Row title="High contrast text" desc="Brighter secondary text for readability.">
          <Switch checked={s.highContrast} onChange={(v) => s.set({ highContrast: v })} label="High contrast text" />
        </Row>
        <Row title="Reduce motion" desc="Turns off drifting light, slide animations and transitions.">
          <Switch checked={s.reduceMotion} onChange={(v) => s.set({ reduceMotion: v })} label="Reduce motion" />
        </Row>
      </Section>

      <button
        onClick={() =>
          s.set({
            tintMode: 'cover',
            tintStrength: 1,
            radius: 'soft',
            density: 'cozy',
            font: 'figtree',
            uiScale: 1,
            panelOpacity: 0.7,
            glassBlur: 28,
            auroraIntensity: 1,
            playButton: 'accent',
            floatingPlayer: false,
            highContrast: false,
            reduceMotion: false,
          })
        }
        className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-fg-2 ring-1 ring-line hover:text-fg"
      >
        <RotateCcw className="h-4 w-4" /> Reset all customization
      </button>
    </>
  );
}

// ---------- Playback ----------

function PlaybackTab() {
  const s = useSettings();
  return (
    <Section title="Playback">
      <Row title="Autoplay" desc="Keep playing similar songs when your queue ends.">
        <Switch checked={s.autoplay} onChange={(v) => s.set({ autoplay: v })} label="Autoplay" />
      </Row>
      <Row title="Crossfade" desc="Blend the end of a song into the next one. Set to 0 for gapless switching.">
        <Range label="Crossfade" value={s.crossfade} min={0} max={12} step={1} format={(v) => (v ? `${v} s` : 'Off')} onChange={(crossfade) => s.set({ crossfade })} />
      </Row>
    </Section>
  );
}

// ---------- Visualizer ----------

const VIZ_DESC: Record<VizStyle, string> = {
  halo: 'A ring of light around the artwork',
  bars: 'Classic spectrum bars',
  dots: 'A glowing dot-matrix equalizer',
  wave: 'An oscilloscope line',
};

function VisualizerTab() {
  const s = useSettings();
  return (
    <Section title="Visualizer" desc="A live spectrum of what's playing, drawn in your theme's colors.">
      <div className="grid grid-cols-2 gap-4 @2xl:grid-cols-4">
        {VIZ_STYLES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => s.set({ visualizer: true, vizStyle: id })}
            className={cx('overflow-hidden rounded-xl text-left ring-2 transition', s.visualizer && s.vizStyle === id ? 'ring-accent' : 'ring-transparent hover:ring-line')}
          >
            <div className="relative aspect-[16/10] bg-bg">
              {id === 'halo' && <div className="absolute left-1/2 top-1/2 h-[46%] w-[29%] -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface-3" />}
              <Visualizer variant={id} core={0.5} />
            </div>
            <div className="bg-surface-2 p-3">
              <div className="font-bold">{label}</div>
              <div className="text-xs text-fg-2">{VIZ_DESC[id]}</div>
            </div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-fg-3">Previews move while music is playing.</p>
      <Row title="Show visualizers" desc="In the fullscreen player, on the Now playing cover, and as live equalizer bars.">
        <Switch checked={s.visualizer} onChange={(v) => s.set({ visualizer: v })} label="Show visualizers" />
      </Row>
      <Row title="Pulse with the beat" desc="The aurora background and the fullscreen cover breathe with the bass.">
        <Switch checked={s.beatPulse} onChange={(v) => s.set({ beatPulse: v })} label="Pulse with the beat" />
      </Row>
      <Row title="Sensitivity" desc="Raise it for quiet recordings, lower it if the bars hit the ceiling.">
        <Range label="Visualizer sensitivity" value={s.vizGain} min={0.3} max={2} step={0.1} format={(v) => `${v.toFixed(1)}×`} onChange={(vizGain) => s.set({ vizGain })} />
      </Row>
    </Section>
  );
}

// ---------- Downloads ----------

function DownloadsTab() {
  const folder = useDownloads((s) => s.folder);
  const entries = useDownloads((s) => s.entries);
  const list = Object.values(entries);
  const bytes = list.reduce((sum, e) => sum + e.size, 0);
  return (
    <Section title="Downloads" desc="Songs are saved as audio files (M4A, best available quality) on this computer.">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-2 px-4 py-3">
        <FolderOpen className="h-5 w-5 text-fg-2" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{folder || 'Connecting to the download service…'}</div>
          <div className="text-sm text-fg-2">
            {count(list.length, 'song')} • {fmtBytes(bytes)}
          </div>
        </div>
        <button onClick={() => useDownloads.getState().openFolder()} className="rounded-full bg-surface-3 px-4 py-2 text-sm font-semibold hover:brightness-110">
          Open folder
        </button>
      </div>
    </Section>
  );
}

// ---------- Desktop ----------

function DesktopTab() {
  const s = useSettings();
  return (
    <Section title="Desktop" desc="How UPlayer behaves as a Windows app.">
      <Row title="When I close the window" desc="Keep music playing from the system tray, or quit completely.">
        <Segmented<'tray' | 'quit'>
          label="Close button"
          value={s.closeToTray ? 'tray' : 'quit'}
          onChange={(v) => s.set({ closeToTray: v === 'tray' })}
          options={[
            ['tray', 'Keep playing in tray'],
            ['quit', 'Quit UPlayer'],
          ]}
        />
      </Row>
      <Row title="Open when Windows starts" desc="Starts quietly in the tray, ready to play.">
        <Switch checked={s.openAtLogin} onChange={(v) => s.set({ openAtLogin: v })} label="Open when Windows starts" />
      </Row>
      <p className="mt-3 text-sm text-fg-2">
        While UPlayer is in the tray, your keyboard’s media keys, the Windows media controls and the tray icon’s menu (right-click) keep working. Use “Quit UPlayer” in that menu to exit.
      </p>
    </Section>
  );
}

// ---------- Data ----------

function DataTab() {
  const events = useHistory((h) => h.events);
  const demoCount = events.filter((e) => e.demo).length;
  const [busy, setBusy] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const lib = useLibrary.getState();
    const payload = {
      app: 'UPlayer',
      version: 1,
      exportedAt: new Date().toISOString(),
      library: { tracks: lib.tracks, liked: lib.liked, playlists: lib.playlists, saved: lib.saved },
      history: useHistory.getState().events,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `uplayer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== 'UPlayer') throw new Error('This is not a UPlayer backup');
      if (!confirm('Replace your current library and history with this backup?')) return;
      useLibrary.getState().replaceAll(data.library ?? {});
      useHistory.setState({ events: data.history ?? [] });
      toast('Backup restored', { tone: 'ok' });
    } catch (err) {
      toast(`Import failed: ${(err as Error).message}`, { tone: 'error' });
    }
  };

  const demo = async () => {
    setBusy('Preparing…');
    try {
      const n = await generateDemoHistory(setBusy);
      toast(`Added ${nf.format(n)} demo listens. Take a look at Stats!`, { tone: 'ok', action: { label: 'Open', run: () => (window.location.hash = '/stats') } });
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Your data" desc={`Everything is stored on this device. ${nf.format(events.length)} listening records so far.`}>
      <div className="flex flex-wrap gap-3">
        <button onClick={exportData} className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-surface-3">
          <Download className="h-4 w-4" /> Export backup
        </button>
        <button onClick={() => file.current?.click()} className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-surface-3">
          <Upload className="h-4 w-4" /> Restore from backup
        </button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importData(e.target.files[0])} />
        {demoCount > 0 ? (
          <button
            onClick={() => {
              useHistory.getState().clearDemo();
              toast('Demo data removed', { tone: 'ok' });
            }}
            className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-surface-3"
          >
            <FlaskConical className="h-4 w-4" /> Remove demo data ({nf.format(demoCount)})
          </button>
        ) : (
          <button disabled={!!busy} onClick={demo} className="flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold hover:bg-surface-3">
            {busy ? <Spinner className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />} {busy ?? 'Generate demo listening history'}
          </button>
        )}
        <button
          onClick={() => {
            if (confirm('Delete your entire listening history? This cannot be undone.')) {
              useHistory.getState().clear();
              toast('Listening history deleted', { tone: 'ok' });
            }
          }}
          className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-red-400 ring-1 ring-red-400/40 hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" /> Delete history
        </button>
      </div>
    </Section>
  );
}
