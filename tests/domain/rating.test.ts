import { describe, expect, it } from 'vitest';
import type { StoredRating } from '../../src/domain/types';
import {
  applyComparisonResult,
  conservativeScore,
  createInitialRatings,
  rankedRatings
} from '../../src/domain/rating';

const tracks = [
  { id: 'a', title: 'A' },
  { id: 'b', title: 'B' },
  { id: 'c', title: 'C' }
];

describe('rating engine', () => {
  it('creates default ratings for every track', () => {
    const ratings = createInitialRatings(tracks);

    expect(Object.keys(ratings)).toEqual(['a', 'b', 'c']);
    expect(ratings.a.mu).toBe(25);
    expect(ratings.a.sigma).toBeCloseTo(25 / 3);
    expect(ratings.a.comparisons).toBe(0);
  });

  it('updates winner and loser after a comparison', () => {
    const ratings = createInitialRatings(tracks);
    const updated = applyComparisonResult(ratings, 'a', 'b', 'left');

    expect(updated.a.mu).toBeGreaterThan(ratings.a.mu);
    expect(updated.b.mu).toBeLessThan(ratings.b.mu);
    expect(updated.a.wins).toBe(1);
    expect(updated.b.losses).toBe(1);
    expect(updated.a.comparisons).toBe(1);
    expect(updated.b.comparisons).toBe(1);
  });

  it('records ties without win or loss stats', () => {
    const ratings = createInitialRatings(tracks);
    const updated = applyComparisonResult(ratings, 'a', 'b', 'tie');

    expect(updated.a.ties).toBe(1);
    expect(updated.b.ties).toBe(1);
    expect(updated.a.wins).toBe(0);
    expect(updated.b.losses).toBe(0);
  });

  it('sorts by conservative score descending', () => {
    const ratings: Record<string, StoredRating> = {
      a: { trackId: 'a', mu: 30, sigma: 2, comparisons: 5, wins: 4, losses: 1, ties: 0 },
      b: { trackId: 'b', mu: 35, sigma: 8, comparisons: 1, wins: 1, losses: 0, ties: 0 },
      c: { trackId: 'c', mu: 22, sigma: 2, comparisons: 5, wins: 1, losses: 4, ties: 0 }
    };

    expect(conservativeScore(ratings.a)).toBe(24);
    expect(rankedRatings(ratings).map((rating) => rating.trackId)).toEqual(['a', 'c', 'b']);
  });
});
