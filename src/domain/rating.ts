import { Rating, rate_1vs1 } from 'ts-trueskill';
import type { ComparisonResult, StoredRating } from './types';

const DEFAULT_MU = 25;
const DEFAULT_SIGMA = DEFAULT_MU / 3;

type TrackLike = {
  id: string;
};

export function createInitialRatings(tracks: TrackLike[]): Record<string, StoredRating> {
  return Object.fromEntries(
    tracks.map((track) => [
      track.id,
      {
        trackId: track.id,
        mu: DEFAULT_MU,
        sigma: DEFAULT_SIGMA,
        comparisons: 0,
        wins: 0,
        losses: 0,
        ties: 0
      }
    ])
  );
}

export function conservativeScore(rating: Pick<StoredRating, 'mu' | 'sigma'>): number {
  return rating.mu - 3 * rating.sigma;
}

export function rankedRatings(ratings: Record<string, StoredRating>): StoredRating[] {
  return Object.values(ratings).sort((a, b) => {
    const scoreDelta = conservativeScore(b) - conservativeScore(a);
    if (scoreDelta !== 0) return scoreDelta;
    return a.trackId.localeCompare(b.trackId);
  });
}

export function applyComparisonResult(
  ratings: Record<string, StoredRating>,
  leftTrackId: string,
  rightTrackId: string,
  result: ComparisonResult
): Record<string, StoredRating> {
  const left = ratings[leftTrackId];
  const right = ratings[rightTrackId];

  if (!left || !right) {
    throw new Error(`Cannot rate missing pair: ${leftTrackId}, ${rightTrackId}`);
  }

  const [newLeft, newRight] =
    result === 'right'
      ? rate_1vs1(new Rating(right.mu, right.sigma), new Rating(left.mu, left.sigma)).reverse()
      : rate_1vs1(
          new Rating(left.mu, left.sigma),
          new Rating(right.mu, right.sigma),
          result === 'tie'
        );

  return {
    ...ratings,
    [leftTrackId]: {
      ...left,
      mu: newLeft.mu,
      sigma: newLeft.sigma,
      comparisons: left.comparisons + 1,
      wins: left.wins + (result === 'left' ? 1 : 0),
      losses: left.losses + (result === 'right' ? 1 : 0),
      ties: left.ties + (result === 'tie' ? 1 : 0)
    },
    [rightTrackId]: {
      ...right,
      mu: newRight.mu,
      sigma: newRight.sigma,
      comparisons: right.comparisons + 1,
      wins: right.wins + (result === 'right' ? 1 : 0),
      losses: right.losses + (result === 'left' ? 1 : 0),
      ties: right.ties + (result === 'tie' ? 1 : 0)
    }
  };
}
