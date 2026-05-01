import { getTrackSnapshot } from './data/tracks';
import {
  createRankingBackup,
  importRankingBackup,
  rankingBackupFilename
} from './domain/backup';
import {
  buildJukeboxPlaylist,
  nextPlaylistIndex,
  previousPlaylistIndex
} from './domain/jukebox';
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

type AppMode = 'sort' | 'jukebox';

type JukeboxState = {
  limit: number;
  playlist: Track[];
  currentIndex: number;
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
  let mode: AppMode = 'sort';
  let jukebox: JukeboxState = {
    limit: 0,
    playlist: [],
    currentIndex: 0,
    blocked: false,
    message: ''
  };
  let settingsStatus = '';

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

    if (mode === 'sort' && pairKey && (pairChanged || options.autoplay)) {
      queueMicrotask(() => {
        void playCurrentSide();
      });
    }
  };

  const renderShell = (): HTMLElement => {
    const shell = element('div', 'app-shell');
    const header = element('header', 'site-header');
    const headerText = element('div', 'header-text');
    headerText.append(
      element('h1', undefined, 'OSRS Music Ranker'),
      element(
        'p',
        'comparison-count',
        `${state.comparisons.length.toLocaleString()} comparisons saved`
      )
    );
    header.append(
      headerText,
      renderSettings()
    );

    shell.append(header, renderModeSwitch());
    if (mode === 'jukebox') {
      shell.append(renderJukebox(), renderRankings());
    } else {
      shell.append(renderMatchup(), renderRankings());
    }
    shell.append(renderSnapshotFooter());
    return shell;
  };

  const renderModeSwitch = (): HTMLElement => {
    const nav = element('nav', 'mode-switch');
    nav.setAttribute('aria-label', 'Mode');
    nav.append(modeButton('Sort', 'sort'), modeButton('Jukebox', 'jukebox'));
    return nav;
  };

  const modeButton = (label: string, nextMode: AppMode): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-button';
    button.dataset.testid = nextMode === 'sort' ? 'mode-sort' : 'mode-jukebox';
    button.setAttribute('aria-pressed', String(mode === nextMode));
    button.textContent = label;
    button.addEventListener('click', () => {
      mode = nextMode;
      if (mode === 'jukebox') {
        rebuildJukeboxPlaylist({ autoplay: false });
      }
      rerender();
    });
    return button;
  };

  const renderSettings = (): HTMLElement => {
    const details = document.createElement('details');
    details.className = 'settings';
    details.dataset.testid = 'settings';

    const summary = document.createElement('summary');
    summary.textContent = 'Settings';

    const menu = element('div', 'settings-menu');
    menu.append(exportButton(), importLabel());

    const status = element('p', 'settings-status', settingsStatus);
    status.dataset.testid = 'settings-status';
    menu.append(status);

    details.append(summary, menu);
    return details;
  };

  const exportButton = (): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'export-button';
    button.dataset.testid = 'export-ranking';
    button.textContent = 'Export ranking data';
    button.addEventListener('click', () => {
      exportRankingData();
    });
    return button;
  };

  const importLabel = (): HTMLLabelElement => {
    const label = element('label', 'import-label') as HTMLLabelElement;
    label.textContent = 'Import ranking data';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.dataset.testid = 'import-ranking';
    input.addEventListener('change', () => {
      void importRankingData(input.files?.[0] ?? null);
    });

    label.append(input);
    return label;
  };

  const exportRankingData = (): void => {
    try {
      const exportedAt = new Date(Date.now()).toISOString();
      const backup = createRankingBackup(state, exportedAt);
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = rankingBackupFilename(exportedAt);
      link.click();
      URL.revokeObjectURL(url);
      settingsStatus = 'Ranking data exported.';
    } catch {
      settingsStatus = 'Ranking data could not be exported.';
    }

    rerender();
  };

  const importRankingData = async (file: File | null): Promise<void> => {
    if (!file) {
      return;
    }

    const raw = await readFileText(file);
    const result = importRankingBackup(raw, snapshot.datasetVersion, snapshot.tracks);
    if (!result.ok) {
      settingsStatus = result.message;
      rerender();
      return;
    }

    state = result.state;
    undoState = null;
    settingsStatus = 'Ranking data imported.';
    rebuildJukeboxPlaylist({ autoplay: false });
    saveStoredState(state);
    rerender();
  };

  const renderJukebox = (): HTMLElement => {
    if (jukebox.playlist.length === 0) {
      rebuildJukeboxPlaylist({ autoplay: false });
    }

    const section = element('section', 'jukebox-player');
    section.dataset.testid = 'jukebox';
    section.setAttribute('aria-label', 'Jukebox');
    section.append(element('h2', undefined, 'Jukebox'));

    const controls = element('div', 'jukebox-controls');
    const limitLabel = element('label', 'jukebox-limit-label') as HTMLLabelElement;
    limitLabel.textContent = 'Top tracks';
    const limitInput = document.createElement('input');
    limitInput.type = 'number';
    limitInput.min = '0';
    limitInput.step = '1';
    limitInput.value = String(jukebox.limit);
    limitInput.dataset.testid = 'jukebox-limit';
    limitInput.addEventListener('input', () => {
      jukebox.limit = Math.max(0, Number.parseInt(limitInput.value, 10) || 0);
      rebuildJukeboxPlaylist({ autoplay: false });
      rerender();
    });
    limitLabel.append(limitInput);
    controls.append(limitLabel, element('p', 'jukebox-note', '0 means all eligible tracks.'));
    section.append(controls);

    const currentTrack = jukebox.playlist[jukebox.currentIndex];
    if (!currentTrack) {
      section.append(element('p', undefined, 'No playable tracks are available.'));
      return section;
    }

    const title = element('h3', 'jukebox-title');
    const titleLink = element('a', 'track-title-link', currentTrack.title);
    titleLink.href = currentTrack.wikiUrl;
    titleLink.target = '_blank';
    titleLink.rel = 'noreferrer';
    titleLink.dataset.testid = 'jukebox-track-title';
    title.append(titleLink);

    const position = element(
      'p',
      'jukebox-position',
      `${jukebox.currentIndex + 1} / ${jukebox.playlist.length}`
    );
    position.dataset.testid = 'jukebox-position';

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'auto';
    audio.dataset.testid = 'jukebox-audio';
    if (currentTrack.audioUrl) {
      audio.src = currentTrack.audioUrl;
    }
    audio.addEventListener('ended', () => {
      advanceJukebox(1);
    });

    const playbackMessage = element('p', 'jukebox-message', jukebox.message);
    playbackMessage.dataset.testid = 'jukebox-message';
    if (jukebox.blocked) {
      const startButton = document.createElement('button');
      startButton.type = 'button';
      startButton.textContent = 'Start playback';
      startButton.dataset.testid = 'jukebox-start';
      startButton.addEventListener('click', () => {
        void playJukeboxCurrent();
      });
      playbackMessage.append(' ', startButton);
    }

    const buttons = element('div', 'jukebox-buttons');
    buttons.append(
      jukeboxButton('Previous', () => advanceJukebox(-1)),
      jukeboxButton('Next', () => advanceJukebox(1)),
      jukeboxButton('Reshuffle', () => {
        rebuildJukeboxPlaylist({ autoplay: true });
        rerender();
      })
    );

    section.append(title, position, audio, playbackMessage, buttons);
    return section;
  };

  const renderSnapshotFooter = (): HTMLElement => {
    const footer = element('footer', 'snapshot-footer');
    footer.dataset.testid = 'snapshot-footer';

    const fetchedDate = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(snapshot.fetchedAt));
    const sourceRevision = snapshot.tracks.find((track) => track.sourceRevision)?.sourceRevision;

    footer.textContent = `Music data snapshot from the OSRS Wiki, fetched ${fetchedDate}.`;
    if (sourceRevision) {
      footer.append(` Source revision ${sourceRevision}.`);
    }

    return footer;
  };

  const jukeboxButton = (label: string, action: () => void): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  };

  const rebuildJukeboxPlaylist = (options: { autoplay: boolean }): void => {
    jukebox = {
      ...jukebox,
      playlist: buildJukeboxPlaylist({
        tracks: snapshot.tracks,
        ratings: state.ratings,
        unavailableTrackIds: new Set(state.unavailableTrackIds),
        limit: jukebox.limit
      }),
      currentIndex: 0,
      blocked: false,
      message: ''
    };

    if (options.autoplay) {
      queueMicrotask(() => {
        void playJukeboxCurrent();
      });
    }
  };

  const advanceJukebox = (direction: -1 | 1): void => {
    if (jukebox.playlist.length === 0) {
      return;
    }

    const nextIndex =
      direction === 1
        ? nextPlaylistIndex(jukebox.currentIndex, jukebox.playlist.length)
        : previousPlaylistIndex(jukebox.currentIndex);
    const atEnd = direction === 1 && nextIndex === jukebox.currentIndex;
    jukebox = {
      ...jukebox,
      currentIndex: nextIndex,
      blocked: false,
      message: atEnd ? 'End of playlist.' : ''
    };
    rerender();

    if (!atEnd) {
      queueMicrotask(() => {
        void playJukeboxCurrent();
      });
    }
  };

  const playJukeboxCurrent = async (): Promise<void> => {
    const audio = root.querySelector<HTMLAudioElement>('[data-testid="jukebox-audio"]');
    if (!audio) {
      return;
    }

    try {
      await audio.play();
      jukebox = { ...jukebox, blocked: false, message: '' };
    } catch {
      jukebox = {
        ...jukebox,
        blocked: true,
        message: 'Autoplay was blocked.'
      };
      rerender();
    }
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

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      resolve(String(reader.result ?? ''));
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('Could not read file.'));
    });
    reader.readAsText(file);
  });
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
  const titleCell = element('td');
  const titleLink = element('a', 'track-title-link', track.title);
  titleLink.href = track.wikiUrl;
  titleLink.target = '_blank';
  titleLink.rel = 'noreferrer';
  titleCell.append(titleLink);

  row.append(
    element('td', undefined, String(rank)),
    titleCell,
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
