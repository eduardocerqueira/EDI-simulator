import { readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';
import { metrics } from './metrics.js';

/** Folders of a mailbox and what they mean. */
export const FOLDERS = {
  to_distributor: 'fresh',     // inbound X12 waiting to be picked up
  archive: 'archived',         // processed inbound files
  from_distributor: 'acks',    // TA1 / 997 waiting for the producer
  error: 'error',              // could not be downloaded
} as const;

export interface PartnerStorage {
  partner: string;
  folders: Record<keyof typeof FOLDERS, { files: number; bytes: number; inFlight: number; newest?: string }>;
  totalFiles: number;
  totalBytes: number;
}

export interface StorageSnapshot {
  scannedAt?: string;
  scanMs?: number;
  path: string;
  volume?: { sizeBytes: number; freeBytes: number; usedBytes: number; usedRatio: number };
  partners: PartnerStorage[];
  totals: { files: number; bytes: number; fresh: number; archived: number; acks: number; error: number };
  error?: string;
}

let snapshot: StorageSnapshot = { path: config.storagePath, partners: [], totals: { files: 0, bytes: 0, fresh: 0, archived: 0, acks: 0, error: 0 } };

export async function scanStorage(): Promise<void> {
  const started = Date.now();
  try {
    const entries = (await readdir(config.storagePath, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith('.'));
    const partners: PartnerStorage[] = [];
    for (const dir of entries) {
      const p: PartnerStorage = { partner: dir.name, folders: {} as PartnerStorage['folders'], totalFiles: 0, totalBytes: 0 };
      for (const folder of Object.keys(FOLDERS) as Array<keyof typeof FOLDERS>) {
        const agg = { files: 0, bytes: 0, inFlight: 0, newest: undefined as string | undefined };
        const files = await readdir(join(config.storagePath, dir.name, folder), { withFileTypes: true }).catch(() => []);
        let newest = 0;
        for (const f of files) {
          if (!f.isFile()) continue;
          if (f.name.endsWith('.tmp')) { agg.inFlight++; continue; }
          const st = await stat(join(config.storagePath, dir.name, folder, f.name)).catch(() => undefined);
          if (!st) continue;
          agg.files++;
          agg.bytes += st.size;
          newest = Math.max(newest, st.mtimeMs);
        }
        if (newest) agg.newest = new Date(newest).toISOString();
        p.folders[folder] = agg;
        p.totalFiles += agg.files;
        p.totalBytes += agg.bytes;
        metrics.storageFiles.set({ partner: dir.name, folder: FOLDERS[folder] }, agg.files);
        metrics.storageBytes.set({ partner: dir.name, folder: FOLDERS[folder] }, agg.bytes);
      }
      partners.push(p);
    }
    const fs = await statfs(config.storagePath);
    const size = fs.blocks * fs.bsize;
    const free = fs.bavail * fs.bsize;
    metrics.volumeSize.set(size);
    metrics.volumeFree.set(free);
    const sum = (k: keyof typeof FOLDERS) => partners.reduce((n, p) => n + p.folders[k].files, 0);
    snapshot = {
      scannedAt: new Date().toISOString(),
      scanMs: Date.now() - started,
      path: config.storagePath,
      volume: { sizeBytes: size, freeBytes: free, usedBytes: size - free, usedRatio: size ? (size - free) / size : 0 },
      partners: partners.sort((a, b) => a.partner.localeCompare(b.partner)),
      totals: {
        files: partners.reduce((n, p) => n + p.totalFiles, 0),
        bytes: partners.reduce((n, p) => n + p.totalBytes, 0),
        fresh: sum('to_distributor'), archived: sum('archive'), acks: sum('from_distributor'), error: sum('error'),
      },
    };
  } catch (e) {
    snapshot = { ...snapshot, error: (e as Error).message };
  }
}

export const storageSnapshot = () => snapshot;
