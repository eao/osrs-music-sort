import { createEmptyState, migrateStoredState } from './storage';
import type { StoredState, Track } from './types';

const APP_ID = 'osrs-music-ranker';
const BACKUP_VERSION = 1;

export type RankingBackup = {
  app: typeof APP_ID;
  backupVersion: typeof BACKUP_VERSION;
  exportedAt: string;
  state: StoredState;
};

export type ImportBackupResult =
  | { ok: true; state: StoredState }
  | { ok: false; message: string };

export function createRankingBackup(state: StoredState, exportedAt: string): RankingBackup {
  return {
    app: APP_ID,
    backupVersion: BACKUP_VERSION,
    exportedAt,
    state
  };
}

export function rankingBackupFilename(exportedAt: string): string {
  return `osrs-music-ranker-backup-${exportedAt.slice(0, 10)}.json`;
}

export function importRankingBackup(
  raw: string,
  datasetVersion: string,
  tracks: Track[]
): ImportBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Backup file is not valid JSON.' };
  }

  if (!isRecord(parsed) || parsed.app !== APP_ID) {
    return { ok: false, message: 'Backup file is not for OSRS Music Ranker.' };
  }

  if (parsed.backupVersion !== BACKUP_VERSION) {
    return { ok: false, message: 'Backup version is not supported.' };
  }

  if (!isStoredStateLike(parsed.state)) {
    return { ok: false, message: 'Backup file is missing ranking data.' };
  }

  const importedState = parsed.state;
  if (importedState.datasetVersion !== datasetVersion) {
    return { ok: true, state: migrateStoredState(importedState, datasetVersion, tracks) };
  }

  const initial = createEmptyState(datasetVersion, tracks);
  return {
    ok: true,
    state: {
      ...initial,
      ...importedState,
      ratings: {
        ...initial.ratings,
        ...filterImportedRatings(importedState.ratings, tracks)
      },
      unavailableTrackIds: importedState.unavailableTrackIds.filter((id) =>
        tracks.some((track) => track.id === id)
      )
    }
  };
}

function filterImportedRatings(
  ratings: StoredState['ratings'],
  tracks: Track[]
): StoredState['ratings'] {
  const trackIds = new Set(tracks.map((track) => track.id));

  return Object.fromEntries(
    Object.entries(ratings).filter(([trackId]) => trackIds.has(trackId))
  );
}

function isStoredStateLike(value: unknown): value is StoredState {
  if (!isRecord(value)) return false;

  return (
    value.schemaVersion === 1 &&
    typeof value.datasetVersion === 'string' &&
    isRecord(value.ratings) &&
    Array.isArray(value.comparisons) &&
    Array.isArray(value.unavailableTrackIds) &&
    (value.currentPair === null || isPair(value.currentPair)) &&
    (value.lastPair === null || isPair(value.lastPair)) &&
    isRecord(value.playback)
  );
}

function isPair(value: unknown): value is [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
