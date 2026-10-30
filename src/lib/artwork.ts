import type { Track } from '../../shared/types';
import { api, useQuery } from './api';
import { isVideoStill } from './format';

/**
 * The picture for the song that's playing. A YouTube video borrows the square
 * album art of the same song on YouTube Music when there is one; otherwise its
 * own thumbnail is used (and cropped square by `Cover`).
 */
export function useArtwork(track: Track | undefined): string | undefined {
  const video = !!track && isVideoStill(track.thumb);
  const art = useQuery(video ? `art:${track!.id}` : null, () => api.artwork(track!), Infinity);
  return art.data?.thumb || track?.thumb;
}
