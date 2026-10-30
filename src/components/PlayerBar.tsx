import { Link } from 'react-router-dom';
import {
  CircleCheck,
  CirclePlus,
  ListMusic,
  Maximize2,
  MicVocal,
  PanelRight,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useState } from 'react';
import { controls } from '../player/controls';
import { usePlayback, usePlayer } from '../store/player';
import { useSettings } from '../store/settings';
import { useLibrary } from '../store/library';
import { useUI } from '../store/ui';
import { fmtTime } from '../lib/format';
import { openTrackMenu, toggleLike } from '../lib/actions';
import { Slider } from './Slider';
import { Cover, IconBtn, cx } from './ui';
import { ArtistLinks } from './TrackList';
import { DownloadButton } from './DownloadButton';
import { useArtwork } from '../lib/artwork';

export function PlayerBar() {
  const floating = useSettings((s) => s.floatingPlayer);
  return (
    <footer
      className={cx(
        'relative z-10 grid h-[72px] grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-4',
        floating ? 'panel mx-auto w-full max-w-[1500px] px-3 shadow-[0_12px_40px_rgb(0_0_0/0.35)]' : 'px-2',
      )}
    >
      <NowPlayingMini />
      <Transport />
      <RightControls />
    </footer>
  );
}

export function LikeButton({ liked, onClick, size = 'h-5 w-5', ring = 'var(--surface)' }: { liked: boolean; onClick: () => void; size?: string; ring?: string }) {
  return (
    <IconBtn tip={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'} active={liked} onClick={onClick} className="h-8 w-8 shrink-0">
      {liked ? <CircleCheck className={size} fill="currentColor" stroke={ring} /> : <CirclePlus className={size} />}
    </IconBtn>
  );
}

function NowPlayingMini() {
  const current = usePlayer((s) => s.current);
  const liked = useLibrary((s) => (current ? s.liked.some((e) => e.id === current.track.id) : false));
  const setFullscreen = useUI((s) => s.setFullscreen);
  const extras = useSettings((s) => s.playerExtras);
  const art = useArtwork(current?.track);
  if (!current) return <div />;
  const t = current.track;
  return (
    <div className="flex min-w-0 items-center gap-3" onContextMenu={(e) => openTrackMenu(e, t)}>
      <button type="button" onClick={() => setFullscreen(true)} className="group relative shrink-0" data-tip="Fullscreen" aria-label="Open fullscreen player">
        <Cover src={art} size={120} className="h-14 w-14 shadow-lg" />
        <span className="absolute inset-0 grid place-items-center rounded-md bg-black/50 opacity-0 transition group-hover:opacity-100">
          <Maximize2 className="h-5 w-5 text-white" />
        </span>
      </button>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold hover:underline">
          {t.album?.id ? <Link to={`/album/${t.album.id}`}>{t.title}</Link> : t.title}
        </div>
        <div className="truncate text-xs text-fg-2">
          <ArtistLinks artists={t.artists} />
        </div>
      </div>
      <LikeButton liked={liked} onClick={() => toggleLike(t)} />
      {extras && <DownloadButton track={t} size={18} alwaysVisible className="-ml-2" />}
    </div>
  );
}

export function Transport() {
  const hasTrack = usePlayer((s) => !!s.current);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const playing = usePlayback((s) => s.playing);
  const buffering = usePlayback((s) => s.buffering);
  const { toggleShuffle, cycleRepeat, next, prev } = usePlayer.getState();
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-5">
        <IconBtn tip={shuffle ? 'Disable shuffle' : 'Enable shuffle'} active={shuffle} onClick={toggleShuffle} className="h-8 w-8">
          <Shuffle className="h-[18px] w-[18px]" />
        </IconBtn>
        <IconBtn tip="Previous" disabled={!hasTrack} onClick={() => prev(usePlayback.getState().position)} className="h-8 w-8">
          <SkipBack className="h-5 w-5" fill="currentColor" />
        </IconBtn>
        <button
          type="button"
          disabled={!hasTrack}
          onClick={() => controls.toggle()}
          aria-label={playing ? 'Pause' : 'Play'}
          data-tip={playing ? 'Pause' : 'Play'}
          className="relative grid h-9 w-9 place-items-center rounded-full bg-fg text-bg transition hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {playing ? <Pause className="h-[18px] w-[18px]" fill="currentColor" strokeWidth={0} /> : <Play className="ml-0.5 h-[18px] w-[18px]" fill="currentColor" strokeWidth={0} />}
          {buffering && <span className="absolute -inset-1 animate-spin rounded-full border-2 border-transparent border-t-accent" />}
        </button>
        <IconBtn tip="Next" disabled={!hasTrack} onClick={() => void next()} className="h-8 w-8">
          <SkipForward className="h-5 w-5" fill="currentColor" />
        </IconBtn>
        <IconBtn
          tip={repeat === 'off' ? 'Enable repeat' : repeat === 'all' ? 'Enable repeat one' : 'Disable repeat'}
          active={repeat !== 'off'}
          onClick={cycleRepeat}
          className="h-8 w-8"
        >
          {repeat === 'one' ? <Repeat1 className="h-[18px] w-[18px]" /> : <Repeat className="h-[18px] w-[18px]" />}
        </IconBtn>
      </div>
      <Progress />
    </div>
  );
}

export function Progress() {
  const position = usePlayback((s) => s.position);
  const duration = usePlayback((s) => s.duration);
  const [preview, setPreview] = useState<number | null>(null);
  return (
    <div className="flex w-full max-w-[640px] items-center gap-2 text-[11px] tabular-nums text-fg-2">
      <span className="w-10 text-right">{fmtTime(preview ?? position)}</span>
      <Slider
        className="flex-1"
        label="Song position"
        value={position}
        max={duration}
        step={5}
        valueText={(v) => `${fmtTime(v)} of ${fmtTime(duration)}`}
        hoverLabel={fmtTime}
        onInput={setPreview}
        onCommit={(v) => {
          setPreview(null);
          controls.seek(v);
        }}
      />
      <span className="w-10">{fmtTime(duration)}</span>
    </div>
  );
}

function RightControls() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const rightPanel = useSettings((s) => s.rightPanel);
  const toggleRight = useSettings((s) => s.toggleRight);
  const extras = useSettings((s) => s.playerExtras);
  const setFullscreen = useUI((s) => s.setFullscreen);
  const { setVolume, toggleMute } = usePlayer.getState();
  const v = muted ? 0 : volume;
  const VolIcon = v === 0 ? VolumeX : v < 34 ? Volume : v < 67 ? Volume1 : Volume2;
  return (
    <div className="flex items-center justify-end gap-2">
      <IconBtn tip="Now playing view" active={rightPanel === 'now'} onClick={() => toggleRight('now')} className="h-8 w-8">
        <PanelRight className="h-[18px] w-[18px]" />
      </IconBtn>
      {extras && (
        <IconBtn tip="Lyrics" active={rightPanel === 'lyrics'} onClick={() => toggleRight('lyrics')} className="h-8 w-8">
          <MicVocal className="h-[18px] w-[18px]" />
        </IconBtn>
      )}
      <IconBtn tip="Queue" active={rightPanel === 'queue'} onClick={() => toggleRight('queue')} className="h-8 w-8">
        <ListMusic className="h-[18px] w-[18px]" />
      </IconBtn>
      <div className="flex w-[140px] items-center gap-1">
        <IconBtn tip={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} className="h-8 w-8 shrink-0">
          <VolIcon className="h-[18px] w-[18px]" />
        </IconBtn>
        <Slider className="flex-1" label="Volume" value={v} max={100} step={5} valueText={(x) => `${Math.round(x)}%`} onInput={setVolume} onCommit={setVolume} />
      </div>
      <IconBtn tip="Fullscreen" onClick={() => setFullscreen(true)} className="h-8 w-8">
        <Maximize2 className="h-[18px] w-[18px]" />
      </IconBtn>
    </div>
  );
}
