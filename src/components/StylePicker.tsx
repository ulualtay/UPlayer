import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import { PRESETS, matchPreset, type Preset } from '../lib/presets';
import { useSettings } from '../store/settings';
import { cx } from './ui';

export function applyPreset(p: Preset) {
  useSettings.getState().set({ ...p.values, rightPanel: p.panel });
}

/** Which preset the current settings match (undefined once something was tweaked). */
export function useActivePreset(): Preset | undefined {
  return useSettings((s) => matchPreset(s));
}

const dot = 'h-1.5 w-1.5 shrink-0 rounded-full bg-fg-3';

/** A schematic of the whole window as the preset would lay it out, in the current theme's colors. */
export function PresetPreview({ preset }: { preset: Preset }) {
  const v = preset.values;
  const r = v.radius === 'sharp' ? 'rounded-[1px]' : v.radius === 'round' ? 'rounded-[7px]' : 'rounded-[4px]';
  const gap = v.density === 'compact' ? 'gap-[2px] p-[3px]' : v.density === 'roomy' ? 'gap-[5px] p-[6px]' : 'gap-[3px] p-[4px]';
  const glass = v.background === 'aurora' ? 'bg-surface/70 backdrop-blur-sm' : 'bg-surface';
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-bg">
      {v.background === 'aurora' && (
        <>
          <div className="absolute -left-[10%] top-[5%] h-2/3 w-2/3 rounded-full bg-accent opacity-45 blur-2xl" />
          <div className="absolute -right-[10%] bottom-0 h-2/3 w-1/2 rounded-full bg-[#7c4dff] opacity-35 blur-2xl" />
        </>
      )}
      <div className={cx('relative flex h-full flex-col', gap)}>
        {/* top bar */}
        <div className="flex h-[9%] items-center gap-1 px-0.5">
          <span className={dot} />
          <span className={dot} />
          <span className="mx-auto flex h-full w-[46%] items-center gap-1">
            <span className="aspect-square h-full rounded-full bg-surface-3" />
            <span className="h-full flex-1 rounded-full bg-surface-3" />
          </span>
          {v.topbarIcons && (
            <>
              <span className={dot} />
              <span className={dot} />
              <span className={dot} />
            </>
          )}
          <span className="h-2 w-2 shrink-0 rounded-full bg-fg-2" />
        </div>

        <div className={cx('flex min-h-0 flex-1', v.density === 'roomy' ? 'gap-[5px]' : v.density === 'compact' ? 'gap-[2px]' : 'gap-[3px]')}>
          {/* library */}
          <div className={cx('flex w-[22%] flex-col gap-[3px] p-[3px]', glass, r)}>
            {v.libraryFilters && (
              <div className="flex gap-[2px]">
                <span className="h-1.5 w-3 rounded-full bg-surface-3" />
                <span className="h-1.5 w-3 rounded-full bg-surface-3" />
              </div>
            )}
            {v.pinLiked && <LibRow cover="bg-[linear-gradient(135deg,#4f2dd8,#c4efd9)]" />}
            {v.pinDownloads && <LibRow cover="bg-[linear-gradient(135deg,#0f766e,#34d399)]" />}
            <LibRow cover="bg-surface-3" />
            <LibRow cover="bg-surface-3" />
          </div>

          {/* main */}
          <div className={cx('relative flex min-w-0 flex-1 flex-col gap-[3px] overflow-hidden p-[4px]', glass, r)}>
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[#8a5a3c] to-transparent" style={{ opacity: v.tintStrength * 0.8 }} />
            <span className="relative h-1.5 w-1/3 rounded bg-fg" />
            <div className="relative grid grid-cols-2 gap-[2px]">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="h-2 rounded-[2px] bg-fg/10" />
              ))}
            </div>
            <Shelf />
            {v.homeMemories && <span className="relative h-2.5 rounded-[2px] bg-gradient-to-r from-accent/70 to-[#ff3cac]/60" />}          </div>

          {/* now playing */}
          {preset.panel === 'now' && (
            <div className={cx('flex w-[22%] flex-col gap-[3px] p-[3px]', glass, r)}>
              <div className="relative aspect-square w-full rounded-[2px] bg-gradient-to-br from-surface-3 to-fg/20">
                <div className="absolute inset-x-[10%] bottom-[8%] flex h-1/3 items-end gap-[1px]">
                  {[5, 8, 6, 9, 4, 7, 5, 3].map((h, i) => (
                    <span key={i} className="flex-1 rounded-t-[1px] bg-accent" style={{ height: `${h * 10}%` }} />
                  ))}
                </div>
              </div>
              <span className="h-1 w-2/3 rounded bg-fg/70" />
              <span className="h-1 w-1/2 rounded bg-fg/30" />
            </div>
          )}
        </div>

        {/* player bar */}
        <div className={cx('flex h-[12%] items-center gap-1 px-1', v.floatingPlayer && cx('mx-[4%] shadow-lg', glass, r))}>
          <span className="aspect-square h-[70%] rounded-[2px] bg-surface-3" />
          <span className="h-1 w-[10%] rounded bg-fg/50" />
          {v.playerExtras && <span className={dot} />}
          <span className="mx-auto flex flex-col items-center gap-[2px]">
            <span className="h-2.5 w-2.5 rounded-full bg-fg" />
            <span className="h-[2px] w-12 rounded bg-fg/30" />
          </span>
          {v.playerExtras && (
            <>
              <span className={dot} />
              <span className={dot} />
            </>
          )}
          <span className={dot} />
          <span className="h-[2px] w-[8%] rounded bg-fg/40" />
        </div>
      </div>
    </div>
  );
}

function LibRow({ cover }: { cover: string }) {
  return (
    <div className="flex items-center gap-[3px]">
      <span className={cx('aspect-square w-[28%] shrink-0 rounded-[2px]', cover)} />
      <span className="h-1 flex-1 rounded bg-fg/25" />
    </div>
  );
}

function Shelf() {
  return (
    <div className="relative flex gap-[3px]">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="aspect-square flex-1 rounded-[2px] bg-fg/10" />
      ))}
    </div>
  );
}

export function PresetCard({ preset, active, onClick }: { preset: Preset; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx('group relative overflow-hidden rounded-xl text-left ring-2 transition hover:-translate-y-0.5', active ? 'ring-accent' : 'ring-line/60 hover:ring-line')}
    >
      <PresetPreview preset={preset} />
      <div className="bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">{preset.name}</span>
          {active && (
            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-ink">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-fg-2">{preset.tagline}</div>
      </div>
    </button>
  );
}

/** First run: pick how much you want on screen. Every card applies live behind the dialog. */
export function StyleOnboarding() {
  const onboarded = useSettings((s) => s.onboarded);
  const active = useActivePreset();
  const done = () => useSettings.getState().set({ onboarded: true });
  return (
    <AnimatePresence>
      {!onboarded && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[85] grid place-items-center bg-black/55 p-6 backdrop-blur-[2px]">
          <motion.div
            initial={{ scale: 0.96, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 12 }}
            role="dialog"
            aria-label="Choose your style"
            className="max-h-full w-[880px] max-w-full overflow-y-auto rounded-2xl bg-surface p-7 shadow-[0_24px_80px_rgb(0_0_0/0.6)] ring-1 ring-line"
          >
            <h2 className="text-2xl font-extrabold tracking-tight">How much do you want on screen?</h2>
            <p className="mt-1 text-fg-2">Pick a style to start with. You can switch any part on or off later in Settings → Style.</p>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {PRESETS.map((p) => (
                <PresetCard key={p.id} preset={p} active={active?.id === p.id} onClick={() => applyPreset(p)} />
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between gap-4">
              <span className="text-sm text-fg-3">Your theme and colors stay the same.</span>
              <button type="button" onClick={done} className="rounded-full bg-accent px-6 py-2.5 font-bold text-accent-ink transition hover:scale-105">
                {active ? `Start with ${active.name}` : 'Done'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
