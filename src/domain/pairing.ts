import type { StoredRating, Track } from './types';
import { conservativeScore } from './rating';

type SelectNextPairInput = {
  tracks: Track[];
  ratings: Record<string, StoredRating>;
  unavailableTrackIds: Set<string>;
  lastPair: [string, string] | null;
};

export function selectNextPair(input: SelectNextPairInput): [string, string] | null {
  const available = input.tracks.filter((track) => !input.unavailableTrackIds.has(track.id));

  if (available.length < 2) {
    return null;
  }

  const candidates: Array<{ pair: [string, string]; score: number }> = [];

  for (let leftIndex = 0; leftIndex < available.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < available.length; rightIndex += 1) {
      const left = available[leftIndex];
      const right = available[rightIndex];
      const leftRating = input.ratings[left.id];
      const rightRating = input.ratings[right.id];

      if (!leftRating || !rightRating) {
        continue;
      }

      const pair: [string, string] = [left.id, right.id];
      const repeatPenalty = samePair(pair, input.lastPair) ? 10_000 : 0;
      const comparisonScore = leftRating.comparisons + rightRating.comparisons;
      const scoreDistance = Math.abs(conservativeScore(leftRating) - conservativeScore(rightRating));
      const uncertaintyBonus = -(leftRating.sigma + rightRating.sigma);

      candidates.push({
        pair,
        score: comparisonScore + scoreDistance + uncertaintyBonus + repeatPenalty
      });
    }
  }

  candidates.sort((a, b) => {
    const scoreDelta = a.score - b.score;
    if (scoreDelta !== 0) return scoreDelta;
    return a.pair.join(':').localeCompare(b.pair.join(':'));
  });

  return candidates[0]?.pair ?? null;
}

function samePair(pair: [string, string], lastPair: [string, string] | null): boolean {
  if (!lastPair) return false;
  return pair.includes(lastPair[0]) && pair.includes(lastPair[1]);
}
