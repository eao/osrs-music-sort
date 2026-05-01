import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrackSnapshot } from '../src/data/tracks';
import { renderApp } from '../src/app';

describe('ranker app', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the first matchup with disabled choice buttons', () => {
    const root = document.createElement('main');
    renderApp(root);

    expect(root.querySelector('h1')?.textContent).toBe('OSRS Music Ranker');
    expect(root.querySelector('[data-testid="left-track"]')?.textContent).toContain('7th Realm');
    expect(root.querySelector('[data-testid="right-track"]')?.textContent).toContain(
      'A Dangerous Game'
    );
    expect(root.querySelector<HTMLButtonElement>('[data-testid="prefer-left"]')?.disabled).toBe(
      true
    );
    expect(root.querySelector<HTMLButtonElement>('[data-testid="prefer-right"]')?.disabled).toBe(
      true
    );
  });

  it('enables choices after both tracks are marked heard', () => {
    const root = document.createElement('main');
    renderApp(root);

    root.querySelector<HTMLButtonElement>('[data-testid="heard-left"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-testid="heard-right"]')?.click();

    expect(root.querySelector<HTMLButtonElement>('[data-testid="prefer-left"]')?.disabled).toBe(
      false
    );
    expect(root.querySelector<HTMLButtonElement>('[data-testid="tie"]')?.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="prefer-right"]')?.disabled).toBe(
      false
    );
  });

  it('saves a comparison and advances after choosing a winner', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));

    const root = document.createElement('main');
    renderApp(root);
    const displayedTrackIds = displayedPair(root);
    root.querySelector<HTMLButtonElement>('[data-testid="heard-left"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-testid="heard-right"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-testid="prefer-left"]')?.click();

    const stored = JSON.parse(localStorage.getItem('osrs-music-ranker-state') ?? '{}');
    expect(stored.comparisons).toHaveLength(1);
    expect(stored.comparisons[0]).toMatchObject({
      leftTrackId: displayedTrackIds[0],
      rightTrackId: displayedTrackIds[1],
      result: 'left'
    });
  });

  it('ignores stale choice clicks after advancing to a new matchup', () => {
    const root = document.createElement('main');
    renderApp(root);

    root.querySelector<HTMLButtonElement>('[data-testid="heard-left"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-testid="heard-right"]')?.click();
    const stalePreferLeft = root.querySelector<HTMLButtonElement>('[data-testid="prefer-left"]');

    stalePreferLeft?.click();
    stalePreferLeft?.click();

    const stored = JSON.parse(localStorage.getItem('osrs-music-ranker-state') ?? '{}');
    expect(stored.comparisons).toHaveLength(1);
  });

  it('marks a track unavailable and saves that marker', () => {
    const root = document.createElement('main');
    renderApp(root);

    root.querySelector<HTMLButtonElement>('[data-testid="mark-left-unavailable"]')?.click();

    const stored = JSON.parse(localStorage.getItem('osrs-music-ranker-state') ?? '{}');
    expect(stored.unavailableTrackIds).toContain('7th-realm');
  });

  it('ignores stale unavailable clicks after advancing to a new matchup', () => {
    const root = document.createElement('main');
    renderApp(root);
    const staleMarkLeftUnavailable = root.querySelector<HTMLButtonElement>(
      '[data-testid="mark-left-unavailable"]'
    );

    staleMarkLeftUnavailable?.click();
    staleMarkLeftUnavailable?.click();

    const stored = JSON.parse(localStorage.getItem('osrs-music-ranker-state') ?? '{}');
    expect(stored.unavailableTrackIds).toEqual(['7th-realm']);
  });

  it('replaces a stored current pair that contains an unavailable track', () => {
    const snapshot = getTrackSnapshot();
    localStorage.setItem(
      'osrs-music-ranker-state',
      JSON.stringify({
        schemaVersion: 1,
        datasetVersion: snapshot.datasetVersion,
        ratings: Object.fromEntries(
          snapshot.tracks.map((track) => [
            track.id,
            {
              trackId: track.id,
              mu: 25,
              sigma: 25 / 3,
              comparisons: 0,
              wins: 0,
              losses: 0,
              ties: 0
            }
          ])
        ),
        comparisons: [],
        unavailableTrackIds: ['adventure'],
        currentPair: ['7th-realm', 'adventure'],
        lastPair: null,
        playback: { volume: 0.8 }
      })
    );

    const root = document.createElement('main');
    renderApp(root);

    expect(displayedPair(root)).not.toContain('adventure');
  });

  it('labels unavailable controls by track side', () => {
    const root = document.createElement('main');
    renderApp(root);

    expect(
      root.querySelector<HTMLButtonElement>('[data-testid="mark-left-unavailable"]')?.textContent
    ).toBe('Mark Track A unavailable');
    expect(
      root.querySelector<HTMLButtonElement>('[data-testid="mark-right-unavailable"]')?.textContent
    ).toBe('Mark Track B unavailable');
  });
});

function displayedPair(root: HTMLElement): [string, string] {
  const snapshot = getTrackSnapshot();
  const leftTitle =
    root.querySelector('[data-testid="left-track"] h3')?.textContent ?? '';
  const rightTitle =
    root.querySelector('[data-testid="right-track"] h3')?.textContent ?? '';
  const left = snapshot.tracks.find((track) => track.title === leftTitle);
  const right = snapshot.tracks.find((track) => track.title === rightTitle);

  expect(left).toBeDefined();
  expect(right).toBeDefined();

  return [left?.id ?? '', right?.id ?? ''];
}
