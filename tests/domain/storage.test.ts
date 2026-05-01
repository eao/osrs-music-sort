import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../../src/domain/types';
import { loadStoredState, saveStoredState, STORAGE_KEY } from '../../src/domain/storage';

const tracks: Track[] = [
  {
    id: 'a',
    title: 'A',
    wikiUrl: 'https://example.test/a',
    audioUrl: null,
    duration: null,
    members: null,
    unlockHint: null,
    isHoliday: false,
    sourceRevision: null
  },
  {
    id: 'b',
    title: 'B',
    wikiUrl: 'https://example.test/b',
    audioUrl: null,
    duration: null,
    members: null,
    unlockHint: null,
    isHoliday: false,
    sourceRevision: null
  }
];

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('creates initial state when nothing is stored', () => {
    const state = loadStoredState('2026-04-30', tracks);

    expect(state.schemaVersion).toBe(1);
    expect(state.datasetVersion).toBe('2026-04-30');
    expect(Object.keys(state.ratings)).toEqual(['a', 'b']);
    expect(state.playback.volume).toBe(0.8);
  });

  it('round-trips stored state', () => {
    const state = loadStoredState('2026-04-30', tracks);
    state.unavailableTrackIds.push('b');
    state.currentPair = ['a', 'b'];

    saveStoredState(state);

    expect(loadStoredState('2026-04-30', tracks).unavailableTrackIds).toEqual(['b']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').currentPair).toEqual(['a', 'b']);
  });

  it('migrates existing ratings by stable track ID when dataset changes', () => {
    const state = loadStoredState('2026-04-30', tracks);
    state.ratings.a.mu = 31;
    state.comparisons.push(
      {
        id: 'kept',
        leftTrackId: 'a',
        rightTrackId: 'b',
        result: 'left',
        createdAt: '2026-04-30T00:00:00.000Z'
      },
      {
        id: 'removed',
        leftTrackId: 'a',
        rightTrackId: 'missing',
        result: 'right',
        createdAt: '2026-04-30T00:00:01.000Z'
      }
    );
    saveStoredState(state);

    const migrated = loadStoredState('2026-05-01', [
      tracks[0],
      {
        ...tracks[1],
        id: 'c',
        title: 'C'
      }
    ]);

    expect(migrated.datasetVersion).toBe('2026-05-01');
    expect(migrated.ratings.a.mu).toBe(31);
    expect(migrated.ratings.c.mu).toBe(25);
    expect(migrated.ratings.b).toBeUndefined();
    expect(migrated.comparisons.map((comparison) => comparison.id)).toEqual([]);
  });

  it('returns initial state when localStorage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const state = loadStoredState('2026-04-30', tracks);

    expect(state.datasetVersion).toBe('2026-04-30');
    expect(Object.keys(state.ratings)).toEqual(['a', 'b']);
  });

  it('does not throw when localStorage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    const state = loadStoredState('2026-04-30', tracks);

    expect(() => saveStoredState(state)).not.toThrow();
  });
});
