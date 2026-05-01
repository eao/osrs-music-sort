import { describe, expect, it } from 'vitest';
import type { StoredRating, Track } from '../../src/domain/types';
import {
  buildJukeboxPlaylist,
  nextPlaylistIndex,
  previousPlaylistIndex
} from '../../src/domain/jukebox';

const tracks: Track[] = [
  track('a', 'A'),
  track('b', 'B'),
  track('c', 'C'),
  { ...track('d', 'D'), audioUrl: null }
];

const ratings: Record<string, StoredRating> = {
  a: rating('a', 40),
  b: rating('b', 30),
  c: rating('c', 20),
  d: rating('d', 50)
};

describe('jukebox playlist', () => {
  it('limits the playlist to the top ranked playable tracks', () => {
    const playlist = buildJukeboxPlaylist({
      tracks,
      ratings,
      unavailableTrackIds: new Set<string>(),
      limit: 2,
      random: () => 0.99
    });

    expect(playlist.map((playlistTrack) => playlistTrack.id).sort()).toEqual(['a', 'b']);
  });

  it('treats zero as unlimited and excludes unavailable or unplayable tracks', () => {
    const playlist = buildJukeboxPlaylist({
      tracks,
      ratings,
      unavailableTrackIds: new Set(['b']),
      limit: 0,
      random: () => 0.99
    });

    expect(playlist.map((playlistTrack) => playlistTrack.id).sort()).toEqual(['a', 'c']);
  });

  it('shuffles without repeating tracks in a run', () => {
    const playlist = buildJukeboxPlaylist({
      tracks,
      ratings,
      unavailableTrackIds: new Set<string>(),
      limit: 0,
      random: () => 0
    });

    expect(new Set(playlist.map((playlistTrack) => playlistTrack.id)).size).toBe(3);
    expect(playlist).toHaveLength(3);
  });

  it('calculates previous and next indexes without wrapping past playlist ends', () => {
    expect(previousPlaylistIndex(0)).toBe(0);
    expect(previousPlaylistIndex(2)).toBe(1);
    expect(nextPlaylistIndex(0, 3)).toBe(1);
    expect(nextPlaylistIndex(2, 3)).toBe(2);
  });
});

function track(id: string, title: string): Track {
  return {
    id,
    title,
    wikiUrl: `https://example.test/${id}`,
    audioUrl: `https://example.test/${id}.ogg`,
    duration: null,
    members: null,
    unlockHint: null,
    isHoliday: false,
    sourceRevision: null
  };
}

function rating(trackId: string, mu: number): StoredRating {
  return {
    trackId,
    mu,
    sigma: 1,
    comparisons: 1,
    wins: 1,
    losses: 0,
    ties: 0
  };
}
