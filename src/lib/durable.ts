// Saved state lives in localStorage, and every change is also copied to plain
// files by the local server (server/backup.ts). Browser storage can come back
// empty or older than it was (a reset profile, an interrupted write); when it
// does, the newer file copy is put back before any store reads it.
//
// Import this module first (see main.tsx): restoring must happen before the
// zustand stores hydrate, which is when their modules are evaluated.

import { createJSONStorage, type StateStorage } from 'zustand/middleware';

const KEYS = ['uplayer-library', 'uplayer-history', 'uplayer-settings', 'uplayer-player'];
const stamp = (key: string) => `${key}@at`;
const HEADERS = { 'x-uplayer': '1' };

function localAt(key: string): number {
  try {
    return Number(localStorage.getItem(stamp(key))) || 0;
  } catch {
    return 0;
  }
}

/** Put back any backup that is newer than what localStorage has. Synchronous on purpose. */
function restore() {
  let saved: Record<string, { at: number; value: string }> = {};
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/backup', false);
    xhr.setRequestHeader('x-uplayer', '1');
    xhr.send();
    if (xhr.status !== 200) return;
    saved = JSON.parse(xhr.responseText);
  } catch {
    return; // no server (or no backup yet): carry on with what we have
  }
  const restored: string[] = [];
  for (const key of KEYS) {
    const b = saved[key];
    if (!b) continue;
    let local: string | null = null;
    try {
      local = localStorage.getItem(key);
    } catch {
      /* storage blocked */
    }
    if (local !== null && localAt(key) >= b.at) continue;
    if (local === b.value) continue;
    try {
      localStorage.setItem(key, b.value);
      localStorage.setItem(stamp(key), String(b.at));
      restored.push(key);
    } catch (err) {
      console.error('[backup] could not restore', key, err);
    }
  }
  if (restored.length) console.warn('[backup] restored from disk:', restored.join(', '));
  // anything newer here than on disk (or never backed up) goes up again
  for (const key of KEYS) {
    const at = localAt(key);
    if (!saved[key] || at > saved[key].at) {
      try {
        const v = localStorage.getItem(key);
        if (v === null) continue;
        const when = at || Date.now();
        localStorage.setItem(stamp(key), String(when));
        queue(key, v, when);
      } catch {
        /* ignore */
      }
    }
  }
}

// ---------- uploads: debounced per key, newest value wins ----------

const pending = new Map<string, { value: string; at: number }>();
let timer: number | undefined;

function queue(key: string, value: string, at: number) {
  pending.set(key, { value, at });
  window.clearTimeout(timer);
  timer = window.setTimeout(flush, 1500);
}

async function flush() {
  const batch = [...pending.entries()];
  pending.clear();
  for (const [key, { value, at }] of batch) {
    try {
      const res = await fetch(`/api/backup/${key}?at=${at}`, {
        method: 'PUT',
        headers: { ...HEADERS, 'Content-Type': 'text/plain' },
        body: value,
        keepalive: value.length < 60_000,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // try again with the next change (or in a few seconds), unless something newer is queued
      if (!pending.has(key)) pending.set(key, { value, at });
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 5000);
    }
  }
}

/** localStorage for zustand's persist, with every write also copied to disk. */
const durableStorage: StateStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => {
    const at = Date.now();
    localStorage.setItem(key, value);
    if (!KEYS.includes(key)) return;
    localStorage.setItem(stamp(key), String(at));
    queue(key, value, at);
  },
  removeItem: (key) => localStorage.removeItem(key),
};

export const durableJSON = <S>() => createJSONStorage<S>(() => durableStorage);

// leaving the page: push out whatever is still waiting
window.addEventListener('pagehide', () => void flush());
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flush());

restore();
