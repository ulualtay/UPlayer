import { QueueView } from '../components/Queue';

/** Full-width queue (a common complaint about Spotify is that the queue only lives in a narrow sidebar). */
export function QueuePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 pb-10 pt-6">
      <h1 className="text-[32px] font-extrabold tracking-tight">Queue</h1>
      <p className="mb-2 text-sm text-fg-2">Drag to reorder, press Delete to remove, double-click to play.</p>
      <QueueView full />
    </div>
  );
}
