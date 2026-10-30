// A plain-file copy of what the app keeps in localStorage (library, history,
// settings, queue). Browser storage can be reset or rolled back without
// warning; these files are what the client restores from when that happens.
// One current file per key, written atomically, plus a dated snapshot per day
// (the last 14 are kept) as a safety net against a bad state overwriting a good one.

import fs from 'node:fs';
import path from 'node:path';

export const BACKUP_KEYS = ['uplayer-library', 'uplayer-history', 'uplayer-settings', 'uplayer-player'] as const;
export type BackupKey = (typeof BACKUP_KEYS)[number];
const KEEP_DAYS = 14;

export interface BackupEntry {
  /** when the client wrote this value (ms since epoch) */
  at: number;
  /** the raw string the client stores in localStorage */
  value: string;
}

let dir = '';

export function initBackup(dataDir: string) {
  dir = dataDir;
  fs.mkdirSync(dir, { recursive: true });
}

export const isBackupKey = (k: string): k is BackupKey => (BACKUP_KEYS as readonly string[]).includes(k);

const file = (key: BackupKey) => path.join(dir, `${key}.json`);

export function readAll(): Partial<Record<BackupKey, BackupEntry>> {
  const out: Partial<Record<BackupKey, BackupEntry>> = {};
  for (const key of BACKUP_KEYS) {
    try {
      const e = JSON.parse(fs.readFileSync(file(key), 'utf8')) as BackupEntry;
      if (typeof e?.value === 'string' && typeof e.at === 'number') out[key] = e;
    } catch {
      /* not written yet */
    }
  }
  return out;
}

export function write(key: BackupKey, entry: BackupEntry) {
  const target = file(key);
  // never let an older write (a slow request, a second window) replace newer data
  try {
    const cur = JSON.parse(fs.readFileSync(target, 'utf8')) as BackupEntry;
    if (cur.at > entry.at) return false;
  } catch {
    /* first write */
  }
  const data = JSON.stringify(entry);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, target);
  snapshot(key, data);
  return true;
}

function snapshot(key: BackupKey, data: string) {
  const day = new Date().toISOString().slice(0, 10);
  const snapDir = path.join(dir, 'daily');
  const snap = path.join(snapDir, `${key}.${day}.json`);
  if (fs.existsSync(snap)) return;
  fs.mkdirSync(snapDir, { recursive: true });
  fs.writeFileSync(snap, data);
  const old = fs
    .readdirSync(snapDir)
    .filter((f) => f.startsWith(`${key}.`))
    .sort()
    .slice(0, -KEEP_DAYS);
  for (const f of old) fs.rmSync(path.join(snapDir, f), { force: true });
}
