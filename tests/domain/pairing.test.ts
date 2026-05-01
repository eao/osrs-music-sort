import { describe, expect, it } from 'vitest';
import type { StoredRating, Track } from '../../src/domain/types';
import { selectNextPair } from '../../src/domain/pairing';

const tracks: Track[] = [
  track('a', 'A'),
  track('b', 'B'),
  track('c', 'C'),
  track('d', 'D')
];

function track(id: string, title: string): Track {
  return {
    id,
    title,
    wikiUrl: `https://example.test/${id}`,
    audioUrl: `https://example.test/${id}.ogg`,
    duration: '01:00',
    members: false,
    unlockHint: null,
    isHoliday: false,
    sourceRevision: null
  };
}

function rating(trackId: string, mu: number, sigma: number, comparisons: number): StoredRating {
  return { trackId, mu, sigma, comparisons, wins: 0, losses: 0, ties: 0 };
}

describe('selectNextPair', () => {
  it('prefers under-compared tracks', () => {
    const pair = selectNextPair({
      tracks,
      ratings: {
        a: rating('a', 25, 8, 10),
        b: rating('b', 25, 8, 10),
        c: rating('c', 25, 8, 0),
        d: rating('d', 25, 8, 0)
      },
      unavailableTrackIds: new Set(),
      lastPair: null
    });

    expect(pair).toEqual(['c', 'd']);
  });

  it('skips unavailable tracks', () => {
    const pair = selectNextPair({
      tracks,
      ratings: {
        a: rating('a', 25, 8, 0),
        b: rating('b', 25, 8, 0),
        c: rating('c', 25, 8, 0),
        d: rating('d', 25, 8, 0)
      },
      unavailableTrackIds: new Set(['a', 'b']),
      lastPair: null
    });

    expect(pair).toEqual(['c', 'd']);
  });

  it('avoids repeating the previous pair when another pair exists', () => {
    const pair = selectNextPair({
      tracks,
      ratings: {
        a: rating('a', 25, 8, 0),
        b: rating('b', 25, 8, 0),
        c: rating('c', 25, 8, 0),
        d: rating('d', 25, 8, 0)
      },
      unavailableTrackIds: new Set(),
      lastPair: ['a', 'b']
    });

    expect(pair).not.toEqual(['a', 'b']);
  });

  it('returns null when fewer than two tracks are available', () => {
    const pair = selectNextPair({
      tracks,
      ratings: {
        a: rating('a', 25, 8, 0),
        b: rating('b', 25, 8, 0),
        c: rating('c', 25, 8, 0),
        d: rating('d', 25, 8, 0)
      },
      unavailableTrackIds: new Set(['a', 'b', 'c']),
      lastPair: null
    });

    expect(pair).toBeNull();
  });
});
