import type { StoredState, Track } from './types';
import { createInitialRatings } from './rating';

export const STORAGE_KEY = 'osrs-music-ranker-state';

export function loadStoredState(datasetVersion: string, tracks: Track[]): StoredState {
  const initial = createEmptyState(datasetVersion, tracks);
  let raw: string | null;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return initial;
  }

  if (!raw) {
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as StoredState;
    if (parsed.schemaVersion !== 1) {
      return initial;
    }

    if (parsed.datasetVersion !== datasetVersion) {
      return migrateStoredState(parsed, datasetVersion, tracks);
    }

    return {
      ...initial,
      ...parsed,
      ratings: {
        ...initial.ratings,
        ...filterRatings(parsed.ratings, tracks)
      }
    };
  } catch {
    return initial;
  }
}

export function saveStoredState(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is best-effort; keep the in-memory ranking flow usable.
  }
}

export function createEmptyState(datasetVersion: string, tracks: Track[]): StoredState {
  return {
    schemaVersion: 1,
    datasetVersion,
    ratings: createInitialRatings(tracks),
    comparisons: [],
    unavailableTrackIds: [],
    currentPair: null,
    lastPair: null,
    playback: {
      volume: 0.8
    }
  };
}

export function migrateStoredState(
  previous: StoredState,
  datasetVersion: string,
  tracks: Track[]
): StoredState {
  const next = createEmptyState(datasetVersion, tracks);
  const filteredRatings = filterRatings(previous.ratings, tracks);
  const trackIds = new Set(tracks.map((track) => track.id));

  return {
    ...next,
    ratings: {
      ...next.ratings,
      ...filteredRatings
    },
    comparisons: previous.comparisons.filter(
      (comparison) =>
        trackIds.has(comparison.leftTrackId) && trackIds.has(comparison.rightTrackId)
    ),
    unavailableTrackIds: previous.unavailableTrackIds.filter((id) => trackIds.has(id)),
    playback: previous.playback ?? next.playback
  };
}

function filterRatings(ratings: StoredState['ratings'], tracks: Track[]): StoredState['ratings'] {
  const trackIds = new Set(tracks.map((track) => track.id));

  return Object.fromEntries(
    Object.entries(ratings).filter(([trackId]) => trackIds.has(trackId))
  );
}
