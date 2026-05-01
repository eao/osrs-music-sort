import { getTrackSnapshot } from './data/tracks';
import { selectNextPair } from './domain/pairing';
import { applyComparisonResult, conservativeScore, rankedRatings } from './domain/rating';
import { loadStoredState, saveStoredState, STORAGE_KEY } from './domain/storage';
import type { ComparisonResult, StoredRating, StoredState, Track } from './domain/types';

type HeardState = {
  left: boolean;
  right: boolean;
};

export function renderApp(root: HTMLElement): void {
  const snapshot = getTrackSnapshot();
  const trackById = new Map(snapshot.tracks.map((track) => [track.id, track]));
  let state = loadStoredState(snapshot.datasetVersion, snapshot.tracks);
  let heard: HeardState = { left: false, right: false };

  const rerender = (): void => {
    state = ensureCurrentPair(state, snapshot.tracks);
    root.replaceChildren(renderShell());
  };

  const renderShell = (): HTMLElement => {
    const shell = element('div', 'app-shell');
    const header = element('header', 'site-header');
    header.append(
      element('h1', undefined, 'OSRS Music Ranker'),
      element(
        'p',
        'comparison-count',
        `${state.comparisons.length.toLocaleString()} comparisons saved`
      )
    );

    shell.append(header, renderMatchup(), renderRankings());
    return shell;
  };

  const renderMatchup = (): HTMLElement => {
    const section = element('section', 'matchup');
    section.setAttribute('aria-label', 'Current matchup');

    const pair = getCurrentTracks(state, trackById);
    if (!pair) {
      section.append(
        element('h2', undefined, 'No matchup available'),
        element('p', undefined, 'At least two rated tracks are needed to continue.')
      );
      return section;
    }

    const [leftTrack, rightTrack] = pair;
    const controls = element('div', 'choice-controls');
    const canChoose = heard.left && heard.right;
    controls.append(
      choiceButton('Prefer A', 'prefer-left', 'left', canChoose),
      choiceButton('Too close / Tie', 'tie', 'tie', canChoose),
      choiceButton('Prefer B', 'prefer-right', 'right', canChoose)
    );

    section.append(
      element('h2', undefined, 'Current matchup'),
      panel(leftTrack, 'A', 'left', heard.left),
      panel(rightTrack, 'B', 'right', heard.right),
      controls,
      skipButton()
    );

    return section;
  };

  const panel = (
    track: Track,
    label: 'A' | 'B',
    side: keyof HeardState,
    isHeard: boolean
  ): HTMLElement => {
    const article = element('article', 'track-panel');
    article.dataset.testid = side === 'left' ? 'left-track' : 'right-track';

    const meta = [
      track.duration ? `Duration ${track.duration}` : null,
      track.members === null ? null : track.members ? 'Members' : 'Free',
      track.isHoliday ? 'Holiday' : null
    ].filter(Boolean);

    const title = element('h3', undefined, track.title);
    const wikiLink = element('a', undefined, 'Wiki');
    wikiLink.setAttribute('href', track.wikiUrl);
    wikiLink.setAttribute('target', '_blank');
    wikiLink.setAttribute('rel', 'noreferrer');

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    if (track.audioUrl) {
      audio.src = track.audioUrl;
    }

    article.append(
      element('p', 'track-label', `Track ${label}`),
      title,
      element('p', 'track-meta', meta.join(' | ') || 'Music track'),
      track.unlockHint ? element('p', 'unlock-hint', track.unlockHint) : element('p'),
      audio,
      wikiLink,
      heardButton(label, side, isHeard)
    );

    return article;
  };

  const heardButton = (label: 'A' | 'B', side: keyof HeardState, isHeard: boolean): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = isHeard ? 'heard-button is-active' : 'heard-button';
    button.dataset.testid = side === 'left' ? 'heard-left' : 'heard-right';
    button.textContent = isHeard ? `Heard ${label}` : `Mark heard ${label}`;
    button.addEventListener('click', () => {
      heard = { ...heard, [side]: true };
      rerender();
    });
    return button;
  };

  const choiceButton = (
    label: string,
    testId: string,
    result: ComparisonResult,
    enabled: boolean
  ): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.dataset.testid = testId;
    button.disabled = !enabled;
    button.textContent = label;
    button.addEventListener('click', () => {
      saveComparison(result);
    });
    return button;
  };

  const skipButton = (): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'skip-button';
    button.textContent = 'Skip matchup';
    button.addEventListener('click', () => {
      if (state.currentPair) {
        state = {
          ...state,
          lastPair: state.currentPair,
          currentPair: selectNextPair({
            tracks: snapshot.tracks,
            ratings: state.ratings,
            unavailableTrackIds: new Set(state.unavailableTrackIds),
            lastPair: state.currentPair
          })
        };
        heard = { left: false, right: false };
        saveStoredState(state);
        rerender();
      }
    });
    return button;
  };

  const saveComparison = (result: ComparisonResult): void => {
    const pair = state.currentPair;
    if (!heard.left || !heard.right || !pair || !state.ratings[pair[0]] || !state.ratings[pair[1]]) {
      return;
    }

    const createdAt = new Date(Date.now()).toISOString();
    const ratings = applyComparisonResult(state.ratings, pair[0], pair[1], result);
    const nextLastPair: [string, string] = [pair[0], pair[1]];

    state = {
      ...state,
      ratings,
      comparisons: [
        ...state.comparisons,
        {
          id: String(Date.now()),
          leftTrackId: pair[0],
          rightTrackId: pair[1],
          result,
          createdAt
        }
      ],
      lastPair: nextLastPair,
      currentPair: selectNextPair({
        tracks: snapshot.tracks,
        ratings,
        unavailableTrackIds: new Set(state.unavailableTrackIds),
        lastPair: nextLastPair
      })
    };

    heard = { left: false, right: false };
    saveStoredState(state);
    rerender();
  };

  const renderRankings = (): HTMLElement => {
    const section = element('section', 'rankings');
    section.append(element('h2', undefined, 'Current rankings'), resetButton());

    const table = element('table', 'rankings-table') as HTMLTableElement;
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['#', 'Track', 'Score', 'W-L-T', 'Comparisons'].forEach((heading) => {
      headerRow.append(element('th', undefined, heading));
    });
    thead.append(headerRow);

    const tbody = document.createElement('tbody');
    rankedRatings(state.ratings).forEach((rating, index) => {
      const track = trackById.get(rating.trackId);
      if (!track) return;
      tbody.append(rankingRow(index + 1, track, rating));
    });

    table.append(thead, tbody);
    section.append(table);
    return section;
  };

  const resetButton = (): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reset-button';
    button.textContent = 'Reset local progress';
    button.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      state = loadStoredState(snapshot.datasetVersion, snapshot.tracks);
      heard = { left: false, right: false };
      rerender();
    });
    return button;
  };

  rerender();
}

function ensureCurrentPair(state: StoredState, tracks: Track[]): StoredState {
  const unavailableTrackIds = new Set(state.unavailableTrackIds);
  const currentPair = state.currentPair;
  const hasUsablePair =
    currentPair &&
    state.ratings[currentPair[0]] &&
    state.ratings[currentPair[1]] &&
    tracks.some((track) => track.id === currentPair[0]) &&
    tracks.some((track) => track.id === currentPair[1]);

  if (hasUsablePair) {
    return state;
  }

  return {
    ...state,
    currentPair: selectNextPair({
      tracks,
      ratings: state.ratings,
      unavailableTrackIds,
      lastPair: state.lastPair
    })
  };
}

function getCurrentTracks(
  state: StoredState,
  trackById: Map<string, Track>
): [Track, Track] | null {
  if (!state.currentPair) return null;
  const leftTrack = trackById.get(state.currentPair[0]);
  const rightTrack = trackById.get(state.currentPair[1]);
  if (!leftTrack || !rightTrack) return null;
  return [leftTrack, rightTrack];
}

function rankingRow(rank: number, track: Track, rating: StoredRating): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.append(
    element('td', undefined, String(rank)),
    element('td', undefined, track.title),
    element('td', undefined, conservativeScore(rating).toFixed(2)),
    element('td', undefined, `${rating.wins}-${rating.losses}-${rating.ties}`),
    element('td', undefined, String(rating.comparisons))
  );
  return row;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tagName);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}
