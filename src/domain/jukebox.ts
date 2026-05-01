import { conservativeScore } from './rating';
import type { StoredRating, Track } from './types';

type PlaylistOptions = {
  tracks: Track[];
  ratings: Record<string, StoredRating>;
  unavailableTrackIds: Set<string>;
  limit: number;
  random?: () => number;
};

export function buildJukeboxPlaylist({
  tracks,
  ratings,
  unavailableTrackIds,
  limit,
  random = Math.random
}: PlaylistOptions): Track[] {
  const rankedPlayable = tracks
    .filter((track) => track.audioUrl && !unavailableTrackIds.has(track.id))
    .sort((left, right) => {
      const scoreDifference = score(ratings[right.id]) - score(ratings[left.id]);
      return scoreDifference || left.title.localeCompare(right.title);
    });

  const limited = limit > 0 ? rankedPlayable.slice(0, limit) : rankedPlayable;
  return shuffle(limited, random);
}

export function previousPlaylistIndex(currentIndex: number): number {
  return Math.max(0, currentIndex - 1);
}

export function nextPlaylistIndex(currentIndex: number, playlistLength: number): number {
  return Math.min(Math.max(playlistLength - 1, 0), currentIndex + 1);
}

function score(rating: StoredRating | undefined): number {
  return rating ? conservativeScore(rating) : Number.NEGATIVE_INFINITY;
}

function shuffle(tracks: Track[], random: () => number): Track[] {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
