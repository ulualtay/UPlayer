import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Radio, Shuffle } from 'lucide-react';
import { api, useQuery } from '../lib/api';
import { play } from '../lib/actions';
import { controls } from '../player/controls';
import { countsAsPlay, useHistory } from '../store/history';
import { useLibrary } from '../store/library';
import { usePlayback, usePlayer } from '../store/player';
import { toast } from '../store/ui';
import { MediaCard, Shelf, TrackCard } from '../components/Cards';
import { StickyBar, useHeaderColor } from '../components/PageHeader';
import { TrackList } from '../components/TrackList';
import { ErrorBox, IconBtn, PlayFab, Skeleton } from '../components/ui';
import { nf } from '../lib/format';

export function ArtistPage() {
  const { id = '' } = useParams();
  const { data, error, loading, refetch } = useQuery(`artist:${id}`, () => api.artist(id), 30 * 60_000);
  const color = useHeaderColor(data?.banner ?? data?.thumb);
  const isCtx = usePlayer((s) => s.context?.id === id);
  const playing = usePlayback((s) => s.playing) && isCtx;
  const shuffle = usePlayer((s) => s.shuffle);
  const saved = useLibrary((s) => s.saved.some((x) => x.id === id));
  const [more, setMore] = useState(false);
  const myPlays = useHistory((s) => {
    if (!data) return 0;
    const tracks = useLibrary.getState().tracks;
    return s.events.filter((e) => countsAsPlay(e) && tracks[e.t]?.artists.some((a) => a.id === id || a.name === data.name)).length;
  });

  if (loading)
    return (
      <div>
        <Skeleton className="h-[340px] rounded-none" />
        <div className="space-y-2 p-6">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      </div>
    );
  if (error || !data) return <ErrorBox error={error ?? new Error('Artist not found')} retry={refetch} />;

  const ctx = { type: 'artist' as const, id, name: data.name, path: `/artist/${id}` };
  const start = () => (isCtx ? controls.toggle() : play(data.top, 0, ctx));

  return (
    <div>
      <StickyBar color={color} title={data.name} playing={playing} onPlay={start} threshold={280} />
      <div className="relative h-[clamp(280px,38vh,420px)] overflow-hidden">
        {data.banner ? (
          <img src={data.banner} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_25%]" />
        ) : (
          <div className="absolute inset-0" style={{ background: color }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          {data.audience && <div className="mb-1 text-sm font-medium opacity-90">{data.audience}</div>}
          <h1 className="font-extrabold leading-none tracking-tight drop-shadow-lg" style={{ fontSize: 'clamp(3rem, 7vw, 6rem)' }}>
            {data.name}
          </h1>
          {myPlays > 0 && <div className="mt-3 text-sm opacity-90">You've played this artist {nf.format(myPlays)} times</div>}
        </div>
      </div>

      <div className="relative px-6 py-5" style={{ background: `linear-gradient(color-mix(in oklab, ${color} 40%, transparent), transparent 240px)` }}>
        <div className="flex items-center gap-6">
          <PlayFab size={56} playing={playing} onClick={start} />
          <IconBtn tip="Shuffle play" active={shuffle && isCtx} onClick={() => play(data.top, -1, ctx, { shuffle: true })} className="h-10 w-10">
            <Shuffle className="h-7 w-7" />
          </IconBtn>
          <button
            type="button"
            onClick={() => {
              const now = useLibrary.getState().toggleSaved({ type: 'artist', id, title: data.name, thumb: data.thumb ?? '', subtitle: undefined });
              toast(now ? `Following ${data.name}` : `Unfollowed ${data.name}`, { tone: 'ok' });
            }}
            className="rounded-full border border-fg-3 px-4 py-1.5 text-sm font-bold transition hover:scale-105 hover:border-fg"
          >
            {saved ? 'Following' : 'Follow'}
          </button>
          {data.top[0] && (
            <IconBtn tip="Artist radio" onClick={() => void usePlayer.getState().startRadio(data.top[0])} className="h-10 w-10">
              <Radio className="h-6 w-6" />
            </IconBtn>
          )}
        </div>
      </div>

      <div className="px-6 pb-10">
        {data.top.length > 0 && (
          <section className="mb-10 max-w-5xl">
            <h2 className="mb-3 text-2xl font-bold">Popular</h2>
            <TrackList tracks={more ? data.top : data.top.slice(0, 5)} context={ctx} showAlbum={false} compact />
            {data.top.length > 5 && (
              <button onClick={() => setMore(!more)} className="mt-3 px-4 text-sm font-bold text-fg-2 hover:text-fg">
                {more ? 'Show less' : 'See more'}
              </button>
            )}
          </section>
        )}
        <div className="-mx-3">
          {data.shelves.map((s) =>
            s.cards?.length ? (
              <Shelf key={s.title} title={s.title}>
                {s.cards.map((c) => (
                  <MediaCard key={c.id} card={c} />
                ))}
              </Shelf>
            ) : s.tracks?.length ? (
              <Shelf key={s.title} title={s.title}>
                {s.tracks.map((t, i, arr) => (
                  <TrackCard key={t.id} track={t} list={arr} index={i} context={{ ...ctx, id: `${id}:${s.title}` }} />
                ))}
              </Shelf>
            ) : null,
          )}
        </div>
        {data.description && (
          <section className="mt-6 max-w-3xl">
            <h2 className="mb-3 text-2xl font-bold">About</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-fg-2 line-clamp-[12]">{data.description}</p>
          </section>
        )}
      </div>
    </div>
  );
}
