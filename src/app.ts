import { getTrackSnapshot } from './data/tracks';
import { selectNextPair } from './domain/pairing';
import { applyComparisonResult, conservativeScore, rankedRatings } from './domain/rating';
import { loadStoredState, saveStoredState, STORAGE_KEY } from './domain/storage';
import type { ComparisonResult, StoredRating, StoredState, Track } from './domain/types';

type TrackSide = 'left' | 'right';

type PlaybackState = {
  pairKey: string | null;
  side: TrackSide | 'done';
  blocked: boolean;
  message: string;
};

export function renderApp(root: HTMLElement): void {
  const snapshot = getTrackSnapshot();
  const trackById = new Map(snapshot.tracks.map((track) => [track.id, track]));
  let state = loadStoredState(snapshot.datasetVersion, snapshot.tracks);
  let undoState: StoredState | null = null;
  let playback: PlaybackState = {
    pairKey: null,
    side: 'left',
    blocked: false,
    message: 'Ready'
  };

  const rerender = (options: { autoplay?: boolean } = {}): void => {
    state = ensureCurrentPair(state, snapshot.tracks);

    const pairKey = state.currentPair?.join('|') ?? null;
    const pairChanged = pairKey !== playback.pairKey;
    if (pairChanged) {
      playback = {
        pairKey,
        side: 'left',
        blocked: false,
        message: pairKey ? 'Playing Track A' : 'No matchup available'
      };
    }

    root.replaceChildren(renderShell());

    if (pairKey && (pairChanged || options.autoplay)) {
      queueMicrotask(() => {
        void playCurrentSide();
      });
    }
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
    if (!pair || !state.currentPair) {
      section.append(
        element('h2', undefined, 'No matchup available'),
        element('p', undefined, 'At least two rated tracks are needed to continue.')
      );
      return section;
    }

    const [leftTrack, rightTrack] = pair;
    const currentPair: [string, string] = [state.currentPair[0], state.currentPair[1]];
    const panels = element('div', 'matchup-panels');
    panels.append(panel(leftTrack, 'A', 'left'), panel(rightTrack, 'B', 'right'));

    const controls = element('div', 'choice-controls');
    controls.append(
      choiceButton('Prefer A', 'prefer-left', 'left', currentPair),
      choiceButton('Too close / Tie', 'tie', 'tie', currentPair),
      choiceButton('Prefer B', 'prefer-right', 'right', currentPair)
    );

    const secondaryControls = element('div', 'secondary-controls');
    secondaryControls.append(undoButton(), skipButton());

    section.append(
      element('h2', undefined, 'Current matchup'),
      playbackStatus(),
      panels,
      controls,
      secondaryControls
    );

    return section;
  };

  const panel = (track: Track, label: 'A' | 'B', side: TrackSide): HTMLElement => {
    const article = element('article', 'track-panel');
    article.dataset.testid = side === 'left' ? 'left-track' : 'right-track';

    const meta = [
      track.duration ? `Duration ${track.duration}` : null,
      track.members === null ? null : track.members ? 'Members' : 'Free',
      track.isHoliday ? 'Holiday' : null
    ].filter(Boolean);

    const heading = element('div', 'track-heading');
    heading.append(
      element('p', 'track-label', `Track ${label}`),
      trackOptions(label, side, track.id)
    );

    const title = element('h3', 'track-title');
    const titleLink = element('a', 'track-title-link', track.title);
    titleLink.setAttribute('href', track.wikiUrl);
    titleLink.setAttribute('target', '_blank');
    titleLink.setAttribute('rel', 'noreferrer');
    title.append(titleLink);

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'auto';
    audio.dataset.testid = side === 'left' ? 'left-audio' : 'right-audio';
    audio.addEventListener('ended', () => {
      handleTrackEnded(side);
    });
    if (track.audioUrl) {
      audio.src = track.audioUrl;
    }

    article.append(
      heading,
      title,
      element('p', 'track-meta', meta.join(' | ') || 'Music track'),
      track.unlockHint ? element('p', 'unlock-hint', track.unlockHint) : element('p'),
      audio
    );

    return article;
  };

  const playbackStatus = (): HTMLElement => {
    const status = element('div', 'playback-status');
    status.dataset.testid = 'playback-status';
    status.textContent = playback.message;

    if (playback.blocked) {
      const startButton = document.createElement('button');
      startButton.type = 'button';
      startButton.className = 'start-playback-button';
      startButton.dataset.testid = 'start-playback';
      startButton.textContent = 'Start playback';
      startButton.addEventListener('click', () => {
        playback = {
          ...playback,
          blocked: false,
          message: playback.side === 'right' ? 'Playing Track B' : 'Playing Track A'
        };
        rerender({ autoplay: true });
      });
      status.append(' ', startButton);
    }

    return status;
  };

  const trackOptions = (label: 'A' | 'B', side: TrackSide, trackId: string): HTMLElement => {
    const details = document.createElement('details');
    details.className = 'track-options';
    details.dataset.testid = side === 'left' ? 'left-options' : 'right-options';

    const summary = document.createElement('summary');
    summary.setAttribute('aria-label', `Track ${label} options`);
    summary.setAttribute('title', `Track ${label} options`);
    details.append(summary, unavailableButton(label, side, trackId));
    return details;
  };

  const unavailableButton = (
    label: 'A' | 'B',
    side: TrackSide,
    trackId: string
  ): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'unavailable-button';
    button.dataset.testid =
      side === 'left' ? 'mark-left-unavailable' : 'mark-right-unavailable';
    button.textContent = `Mark Track ${label} unavailable`;
    button.addEventListener('click', () => {
      markUnavailable(side, trackId);
    });
    return button;
  };

  const choiceButton = (
    label: string,
    testId: string,
    result: ComparisonResult,
    expectedPair: [string, string]
  ): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice-button';
    button.dataset.testid = testId;
    button.textContent = label;
    button.addEventListener('click', () => {
      saveComparison(result, expectedPair);
    });
    return button;
  };

  const undoButton = (): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'undo-button';
    button.dataset.testid = 'undo';
    button.disabled = !undoState;
    button.textContent = 'Undo';
    button.addEventListener('click', () => {
      if (!undoState) {
        return;
      }

      state = undoState;
      undoState = null;
      saveStoredState(state);
      rerender();
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
        const skippedPair: [string, string] = [state.currentPair[0], state.currentPair[1]];
        state = {
          ...state,
          lastPair: skippedPair,
          currentPair: selectNextPair({
            tracks: snapshot.tracks,
            ratings: state.ratings,
            unavailableTrackIds: new Set(state.unavailableTrackIds),
            lastPair: skippedPair
          })
        };
        saveStoredState(state);
        rerender();
      }
    });
    return button;
  };

  const markUnavailable = (side: TrackSide, trackId: string): void => {
    const pair = state.currentPair;
    if (!pair) {
      return;
    }

    const unavailableTrackId = side === 'left' ? pair[0] : pair[1];
    if (unavailableTrackId !== trackId) {
      return;
    }

    const unavailableTrackIds = new Set(state.unavailableTrackIds);
    unavailableTrackIds.add(unavailableTrackId);
    const nextLastPair: [string, string] = [pair[0], pair[1]];

    state = {
      ...state,
      unavailableTrackIds: [...unavailableTrackIds],
      lastPair: nextLastPair,
      currentPair: selectNextPair({
        tracks: snapshot.tracks,
        ratings: state.ratings,
        unavailableTrackIds,
        lastPair: nextLastPair
      })
    };

    saveStoredState(state);
    rerender();
  };

  const saveComparison = (result: ComparisonResult, expectedPair: [string, string]): void => {
    const pair = state.currentPair;
    if (!pair || pair[0] !== expectedPair[0] || pair[1] !== expectedPair[1]) {
      return;
    }

    if (!state.ratings[pair[0]] || !state.ratings[pair[1]]) {
      return;
    }

    undoState = cloneState(state);
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
      undoState = null;
      rerender();
    });
    return button;
  };

  const playCurrentSide = async (): Promise<void> => {
    if (!state.currentPair || playback.side === 'done') {
      return;
    }

    const side = playback.side;
    const currentAudio = root.querySelector<HTMLAudioElement>(
      `[data-testid="${side}-audio"]`
    );
    const otherAudio = root.querySelector<HTMLAudioElement>(
      `[data-testid="${side === 'left' ? 'right' : 'left'}-audio"]`
    );

    if (!currentAudio) {
      return;
    }

    otherAudio?.pause();
    if (otherAudio) {
      delete otherAudio.dataset.playing;
    }

    currentAudio.dataset.playing = 'true';

    try {
      await currentAudio.play();
      playback = {
        ...playback,
        blocked: false,
        message: side === 'left' ? 'Playing Track A' : 'Playing Track B'
      };
      updatePlaybackStatus();
    } catch {
      delete currentAudio.dataset.playing;
      playback = {
        ...playback,
        blocked: true,
        message: 'Autoplay was blocked. Start playback to listen to Track A, then Track B.'
      };
      rerender();
    }
  };

  const handleTrackEnded = (side: TrackSide): void => {
    if (side === 'left') {
      playback = { ...playback, side: 'right', message: 'Playing Track B', blocked: false };
      updatePlaybackStatus();
      void playCurrentSide();
      return;
    }

    playback = { ...playback, side: 'done', message: 'Choose your preference', blocked: false };
    updatePlaybackStatus();
  };

  const updatePlaybackStatus = (): void => {
    const status = root.querySelector<HTMLElement>('[data-testid="playback-status"]');
    if (status && !playback.blocked) {
      status.textContent = playback.message;
    }
  };

  rerender();
}

function cloneState(state: StoredState): StoredState {
  return {
    ...state,
    ratings: Object.fromEntries(
      Object.entries(state.ratings).map(([trackId, rating]) => [trackId, { ...rating }])
    ),
    comparisons: state.comparisons.map((comparison) => ({ ...comparison })),
    unavailableTrackIds: [...state.unavailableTrackIds],
    currentPair: state.currentPair ? [state.currentPair[0], state.currentPair[1]] : null,
    lastPair: state.lastPair ? [state.lastPair[0], state.lastPair[1]] : null,
    playback: { ...state.playback }
  };
}

function ensureCurrentPair(state: StoredState, tracks: Track[]): StoredState {
  const unavailableTrackIds = new Set(state.unavailableTrackIds);
  const currentPair = state.currentPair;
  const hasUsablePair =
    currentPair &&
    state.ratings[currentPair[0]] &&
    state.ratings[currentPair[1]] &&
    !unavailableTrackIds.has(currentPair[0]) &&
    !unavailableTrackIds.has(currentPair[1]) &&
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
