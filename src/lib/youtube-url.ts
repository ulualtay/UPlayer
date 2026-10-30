/** Recognise pasted YouTube / YouTube Music links. */
export function parseYouTubeUrl(input: string): { videoId?: string; playlistId?: string } | null {
  const s = input.trim();
  if (!/^(https?:\/\/)?([\w-]+\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//i.test(s)) return null;
  try {
    const url = new URL(s.startsWith('http') ? s : `https://${s}`);
    const list = url.searchParams.get('list') ?? undefined;
    let v = url.searchParams.get('v') ?? undefined;
    if (url.hostname === 'youtu.be') v = url.pathname.slice(1, 12);
    const m = url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/);
    if (m) v = m[1];
    // Radio/mix lists (RD...) are generated per session and can't be fetched as playlists.
    const playlistId = list && !list.startsWith('RD') ? list : undefined;
    if (!v && !playlistId) return null;
    return { videoId: v && /^[\w-]{11}$/.test(v) ? v : undefined, playlistId };
  } catch {
    return null;
  }
}
