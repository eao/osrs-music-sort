import { describe, expect, it } from 'vitest';
import type { StoredState, Track } from '../../src/domain/types';
import {
  createRankingBackup,
  importRankingBackup,
  rankingBackupFilename
} from '../../src/domain/backup';

const tracks: Track[] = [
  {
    id: 'a',
    title: 'A',
    wikiUrl: 'https://example.test/a',
    audioUrl: 'https://example.test/a.ogg',
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
    audioUrl: 'https://example.test/b.ogg',
    duration: null,
    members: null,
    unlockHint: null,
    isHoliday: false,
    sourceRevision: null
  }
];

function state(datasetVersion = '2026-05-01'): StoredState {
  return {
    schemaVersion: 1,
    datasetVersion,
    ratings: {
      a: { trackId: 'a', mu: 31, sigma: 7, comparisons: 2, wins: 2, losses: 0, ties: 0 },
      b: { trackId: 'b', mu: 19, sigma: 7, comparisons: 2, wins: 0, losses: 2, ties: 0 }
    },
    comparisons: [
      {
        id: 'comparison-1',
        leftTrackId: 'a',
        rightTrackId: 'b',
        result: 'left',
        createdAt: '2026-05-01T12:00:00.000Z'
      }
    ],
    unavailableTrackIds: [],
    currentPair: ['a', 'b'],
    lastPair: null,
    playback: { volume: 0.8 }
  };
}

describe('ranking backup', () => {
  it('wraps stored state with app and backup metadata', () => {
    const backup = createRankingBackup(state(), '2026-05-01T12:30:00.000Z');

    expect(backup).toMatchObject({
      app: 'osrs-music-ranker',
      backupVersion: 1,
      exportedAt: '2026-05-01T12:30:00.000Z',
      state: { datasetVersion: '2026-05-01' }
    });
  });

  it('uses the export date in the backup filename', () => {
    expect(rankingBackupFilename('2026-05-01T12:30:00.000Z')).toBe(
      'osrs-music-ranker-backup-2026-05-01.json'
    );
  });

  it('imports valid backup JSON', () => {
    const backup = createRankingBackup(state(), '2026-05-01T12:30:00.000Z');

    const result = importRankingBackup(JSON.stringify(backup), '2026-05-01', tracks);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.comparisons).toHaveLength(1);
      expect(result.state.ratings.a.mu).toBe(31);
    }
  });

  it('rejects malformed and wrong-app backups', () => {
    expect(importRankingBackup('{', '2026-05-01', tracks)).toMatchObject({
      ok: false,
      message: 'Backup file is not valid JSON.'
    });

    expect(
      importRankingBackup(
        JSON.stringify({ app: 'other-app', backupVersion: 1, exportedAt: 'x', state: state() }),
        '2026-05-01',
        tracks
      )
    ).toMatchObject({
      ok: false,
      message: 'Backup file is not for OSRS Music Ranker.'
    });
  });

  it('migrates imported state from an older dataset by stable track IDs', () => {
    const backup = createRankingBackup(state('2026-04-30'), '2026-05-01T12:30:00.000Z');
    const nextTracks = [
      tracks[0],
      {
        ...tracks[1],
        id: 'c',
        title: 'C'
      }
    ];

    const result = importRankingBackup(JSON.stringify(backup), '2026-05-01', nextTracks);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.datasetVersion).toBe('2026-05-01');
      expect(result.state.ratings.a.mu).toBe(31);
      expect(result.state.ratings.c.mu).toBe(25);
      expect(result.state.ratings.b).toBeUndefined();
      expect(result.state.comparisons).toEqual([]);
    }
  });
});
