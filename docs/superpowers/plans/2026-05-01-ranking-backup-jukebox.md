# Ranking Backup and Jukebox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JSON ranking backup/restore, a top-ranked shuffled jukebox mode, and a wiki snapshot footer to the existing static OSRS music ranker.

**Architecture:** Keep ranking data local in `localStorage`. Add pure domain modules for backup validation/import and jukebox playlist creation, then wire those modules into the existing vanilla TypeScript UI in `src/app.ts`.

**Tech Stack:** Vite, TypeScript, Vitest with jsdom, Playwright Chromium smoke tests, native browser `<audio>` controls.

---

## File Structure

- Create `src/domain/backup.ts`: export wrapper creation, import parsing, backup validation, and state migration helpers.
- Create `src/domain/jukebox.ts`: eligible track filtering, top-N limiting, deterministic shuffle injection for tests, and previous/next index helpers.
- Modify `src/domain/storage.ts`: expose `migrateStoredState()` so import can reuse the existing dataset migration rules.
- Modify `src/domain/types.ts`: leave unchanged unless TypeScript requires exporting shared backup or UI mode types; otherwise keep backup-specific types in `src/domain/backup.ts` and mode types in `src/app.ts`.
- Modify `src/app.ts`: render header settings, import/export status, mode switch, jukebox mode, and snapshot footer.
- Modify `src/styles.css`: add simple top-bar, settings, tabs, jukebox, and footer styles without rounded cards.
- Create `tests/domain/backup.test.ts`: pure backup behavior.
- Create `tests/domain/jukebox.test.ts`: pure playlist behavior.
- Modify `tests/domain/storage.test.ts`: cover exported migration helper if behavior moves.
- Modify `tests/app.test.ts`: app-level settings, import, jukebox, and footer tests.
- Modify `tests/e2e/ranker.spec.ts`: add a lightweight jukebox mode smoke assertion.

## Task 1: Backup Domain Module

**Files:**
- Create: `src/domain/backup.ts`
- Modify: `src/domain/storage.ts`
- Test: `tests/domain/backup.test.ts`

- [ ] **Step 1: Write failing backup tests**

Add `tests/domain/backup.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { StoredState, Track } from '../../src/domain/types';
import {
  createRankingBackup,
  importRankingBackup,
  rankingBackupFilename
} from '../../src/domain/backup';

const tracks: Track[] = [
  {
    id: 'a',
    title: 'A',
    wikiUrl: 'https://example.test/a',
    audioUrl: 'https://example.test/a.ogg',
    duration: null,
    members: null,
    unlockHint: null,
    isHoliday: false,
    sourceRevision: null
  },
  {
    id: 'b',
    title: 'B',
    wikiUrl: 'https://example.test/b',
    audioUrl: 'https://example.test/b.ogg',
    duration: null,
    members: null,
    unlockHint: null,
    isHoliday: false,
    sourceRevision: null
  }
];

function state(datasetVersion = '2026-05-01'): StoredState {
  return {
    schemaVersion: 1,
    datasetVersion,
    ratings: {
      a: { trackId: 'a', mu: 31, sigma: 7, comparisons: 2, wins: 2, losses: 0, ties: 0 },
      b: { trackId: 'b', mu: 19, sigma: 7, comparisons: 2, wins: 0, losses: 2, ties: 0 }
    },
    comparisons: [
      {
        id: 'comparison-1',
        leftTrackId: 'a',
        rightTrackId: 'b',
        result: 'left',
        createdAt: '2026-05-01T12:00:00.000Z'
      }
    ],
    unavailableTrackIds: [],
    currentPair: ['a', 'b'],
    lastPair: null,
    playback: { volume: 0.8 }
  };
}

describe('ranking backup', () => {
  it('wraps stored state with app and backup metadata', () => {
    const backup = createRankingBackup(state(), '2026-05-01T12:30:00.000Z');

    expect(backup).toMatchObject({
      app: 'osrs-music-ranker',
      backupVersion: 1,
      exportedAt: '2026-05-01T12:30:00.000Z',
      state: { datasetVersion: '2026-05-01' }
    });
  });

  it('uses the export date in the backup filename', () => {
    expect(rankingBackupFilename('2026-05-01T12:30:00.000Z')).toBe(
      'osrs-music-ranker-backup-2026-05-01.json'
    );
  });

  it('imports valid backup JSON', () => {
    const backup = createRankingBackup(state(), '2026-05-01T12:30:00.000Z');

    const result = importRankingBackup(JSON.stringify(backup), '2026-05-01', tracks);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.comparisons).toHaveLength(1);
      expect(result.state.ratings.a.mu).toBe(31);
    }
  });

  it('rejects malformed and wrong-app backups', () => {
    expect(importRankingBackup('{', '2026-05-01', tracks)).toMatchObject({
      ok: false,
      message: 'Backup file is not valid JSON.'
    });

    expect(
      importRankingBackup(
        JSON.stringify({ app: 'other-app', backupVersion: 1, exportedAt: 'x', state: state() }),
        '2026-05-01',
        tracks
      )
    ).toMatchObject({
      ok: false,
      message: 'Backup file is not for OSRS Music Ranker.'
    });
  });

  it('migrates imported state from an older dataset by stable track IDs', () => {
    const backup = createRankingBackup(state('2026-04-30'), '2026-05-01T12:30:00.000Z');
    const nextTracks = [
      tracks[0],
      {
        ...tracks[1],
        id: 'c',
        title: 'C'
      }
    ];

    const result = importRankingBackup(JSON.stringify(backup), '2026-05-01', nextTracks);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.datasetVersion).toBe('2026-05-01');
      expect(result.state.ratings.a.mu).toBe(31);
      expect(result.state.ratings.c.mu).toBe(25);
      expect(result.state.ratings.b).toBeUndefined();
      expect(result.state.comparisons).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run backup tests to verify they fail**

Run:

```bash
npm test tests/domain/backup.test.ts
```

Expected: fail because `src/domain/backup.ts` does not exist.

- [ ] **Step 3: Implement backup helpers**

In `src/domain/storage.ts`, export the migration helper:

```ts
export function migrateStoredState(
  previous: StoredState,
  datasetVersion: string,
  tracks: Track[]
): StoredState {
  const next = createEmptyState(datasetVersion, tracks);
  const filteredRatings = filterRatings(previous.ratings, tracks);
  const trackIds = new Set(tracks.map((track) => track.id));

  return {
    ...next,
    ratings: {
      ...next.ratings,
      ...filteredRatings
    },
    comparisons: previous.comparisons.filter(
      (comparison) =>
        trackIds.has(comparison.leftTrackId) && trackIds.has(comparison.rightTrackId)
    ),
    unavailableTrackIds: previous.unavailableTrackIds.filter((id) => trackIds.has(id)),
    playback: previous.playback ?? next.playback
  };
}
```

Then have `loadStoredState()` call `migrateStoredState()` instead of the private function.

Create `src/domain/backup.ts`:

```ts
import { createEmptyState, migrateStoredState } from './storage';
import type { StoredState, Track } from './types';

const APP_ID = 'osrs-music-ranker';
const BACKUP_VERSION = 1;

export type RankingBackup = {
  app: typeof APP_ID;
  backupVersion: typeof BACKUP_VERSION;
  exportedAt: string;
  state: StoredState;
};

export type ImportBackupResult =
  | { ok: true; state: StoredState }
  | { ok: false; message: string };

export function createRankingBackup(state: StoredState, exportedAt: string): RankingBackup {
  return {
    app: APP_ID,
    backupVersion: BACKUP_VERSION,
    exportedAt,
    state
  };
}

export function rankingBackupFilename(exportedAt: string): string {
  return `osrs-music-ranker-backup-${exportedAt.slice(0, 10)}.json`;
}

export function importRankingBackup(
  raw: string,
  datasetVersion: string,
  tracks: Track[]
): ImportBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Backup file is not valid JSON.' };
  }

  if (!isRecord(parsed) || parsed.app !== APP_ID) {
    return { ok: false, message: 'Backup file is not for OSRS Music Ranker.' };
  }

  if (parsed.backupVersion !== BACKUP_VERSION) {
    return { ok: false, message: 'Backup version is not supported.' };
  }

  if (!isStoredStateLike(parsed.state)) {
    return { ok: false, message: 'Backup file is missing ranking data.' };
  }

  const importedState = parsed.state as StoredState;
  if (importedState.datasetVersion !== datasetVersion) {
    return { ok: true, state: migrateStoredState(importedState, datasetVersion, tracks) };
  }

  return {
    ok: true,
    state: {
      ...createEmptyState(datasetVersion, tracks),
      ...importedState,
      ratings: {
        ...createEmptyState(datasetVersion, tracks).ratings,
        ...importedState.ratings
      }
    }
  };
}

function isStoredStateLike(value: unknown): value is StoredState {
  if (!isRecord(value)) return false;

  return (
    value.schemaVersion === 1 &&
    typeof value.datasetVersion === 'string' &&
    isRecord(value.ratings) &&
    Array.isArray(value.comparisons) &&
    Array.isArray(value.unavailableTrackIds) &&
    (value.currentPair === null || isPair(value.currentPair)) &&
    (value.lastPair === null || isPair(value.lastPair)) &&
    isRecord(value.playback)
  );
}

function isPair(value: unknown): value is [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
```

- [ ] **Step 4: Run backup tests to verify they pass**

Run:

```bash
npm test tests/domain/backup.test.ts tests/domain/storage.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/domain/backup.ts src/domain/storage.ts tests/domain/backup.test.ts tests/domain/storage.test.ts
git commit -m "feat: add ranking backup helpers"
```

## Task 2: Jukebox Domain Module

**Files:**
- Create: `src/domain/jukebox.ts`
- Test: `tests/domain/jukebox.test.ts`

- [ ] **Step 1: Write failing jukebox tests**

Add `tests/domain/jukebox.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { StoredRating, Track } from '../../src/domain/types';
import { buildJukeboxPlaylist, nextPlaylistIndex, previousPlaylistIndex } from '../../src/domain/jukebox';

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

    expect(playlist.map((track) => track.id).sort()).toEqual(['a', 'b']);
  });

  it('treats zero as unlimited and excludes unavailable or unplayable tracks', () => {
    const playlist = buildJukeboxPlaylist({
      tracks,
      ratings,
      unavailableTrackIds: new Set(['b']),
      limit: 0,
      random: () => 0.99
    });

    expect(playlist.map((track) => track.id).sort()).toEqual(['a', 'c']);
  });

  it('shuffles without repeating tracks in a run', () => {
    const playlist = buildJukeboxPlaylist({
      tracks,
      ratings,
      unavailableTrackIds: new Set<string>(),
      limit: 0,
      random: () => 0
    });

    expect(new Set(playlist.map((track) => track.id)).size).toBe(3);
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
```

- [ ] **Step 2: Run jukebox tests to verify they fail**

Run:

```bash
npm test tests/domain/jukebox.test.ts
```

Expected: fail because `src/domain/jukebox.ts` does not exist.

- [ ] **Step 3: Implement playlist helpers**

Create `src/domain/jukebox.ts`:

```ts
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
      const leftRating = ratings[left.id];
      const rightRating = ratings[right.id];
      return score(rightRating) - score(leftRating) || left.title.localeCompare(right.title);
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
```

- [ ] **Step 4: Run jukebox tests to verify they pass**

Run:

```bash
npm test tests/domain/jukebox.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/domain/jukebox.ts tests/domain/jukebox.test.ts
git commit -m "feat: add jukebox playlist helpers"
```

## Task 3: Settings Menu and Import/Export UI

**Files:**
- Modify: `src/app.ts`
- Modify: `src/styles.css`
- Test: `tests/app.test.ts`

- [ ] **Step 1: Write failing app tests for settings**

Add app tests that verify:

```ts
it('shows ranking import and export actions in the settings menu', () => {
  const root = document.createElement('main');
  renderApp(root);

  root.querySelector<HTMLDetailsElement>('[data-testid="settings"]')?.setAttribute('open', '');

  expect(root.querySelector<HTMLButtonElement>('[data-testid="export-ranking"]')?.textContent).toBe(
    'Export ranking data'
  );
  expect(root.querySelector<HTMLInputElement>('[data-testid="import-ranking"]')?.type).toBe('file');
});
```

For import success, use a `File` and fire a `change` event:

```ts
it('imports ranking data from a backup file and rerenders progress', async () => {
  const snapshot = getTrackSnapshot();
  const backup = {
    app: 'osrs-music-ranker',
    backupVersion: 1,
    exportedAt: '2026-05-01T12:00:00.000Z',
    state: {
      schemaVersion: 1,
      datasetVersion: snapshot.datasetVersion,
      ratings: Object.fromEntries(
        snapshot.tracks.map((track) => [
          track.id,
          { trackId: track.id, mu: 25, sigma: 25 / 3, comparisons: 0, wins: 0, losses: 0, ties: 0 }
        ])
      ),
      comparisons: [
        {
          id: 'imported',
          leftTrackId: '7th-realm',
          rightTrackId: 'adventure',
          result: 'left',
          createdAt: '2026-05-01T12:00:00.000Z'
        }
      ],
      unavailableTrackIds: [],
      currentPair: ['7th-realm', 'adventure'],
      lastPair: null,
      playback: { volume: 0.8 }
    }
  };

  const root = document.createElement('main');
  renderApp(root);
  const input = root.querySelector<HTMLInputElement>('[data-testid="import-ranking"]');
  const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });

  input?.dispatchEvent(new Event('change'));
  await Promise.resolve();

  expect(root.textContent).toContain('1 comparisons saved');
  expect(root.querySelector('[data-testid="settings-status"]')?.textContent).toBe(
    'Ranking data imported.'
  );
});
```

For import failure, dispatch a malformed file and assert local state remains unchanged and status contains `Backup file is not valid JSON.`

- [ ] **Step 2: Run app tests to verify they fail**

Run:

```bash
npm test tests/app.test.ts
```

Expected: fail because settings and import controls do not exist.

- [ ] **Step 3: Implement settings UI**

In `src/app.ts`:

- Import `createRankingBackup`, `importRankingBackup`, and `rankingBackupFilename`.
- Track `settingsStatus: string`.
- Add a `renderTopBar()` or extend `renderShell()` header with a `<details data-testid="settings">`.
- Add export button:
  - Create backup with `new Date(Date.now()).toISOString()`.
  - Serialize with `JSON.stringify(backup, null, 2)`.
  - Create a `Blob`, object URL, temporary `<a download>`, click it, and revoke URL.
  - On error, set settings status.
- Add import input:
  - `type="file"`, `accept="application/json,.json"`.
  - Read selected file with `await file.text()`.
  - Call `importRankingBackup(raw, snapshot.datasetVersion, snapshot.tracks)`.
  - On success, set `state`, clear `undoState`, save, set status, rerender.
  - On failure, leave state untouched and rerender with message.

- [ ] **Step 4: Style settings UI**

In `src/styles.css`, add compact header/top-bar styles:

```css
.site-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.settings {
  position: relative;
}

.settings summary {
  cursor: pointer;
}

.settings-menu {
  position: absolute;
  right: 0;
  z-index: 3;
  min-width: 15rem;
  padding: 0.5rem;
  color: #2b2118;
  background: #f0e5cc;
  border: 1px solid #8b7351;
}
```

- [ ] **Step 5: Run app tests to verify they pass**

Run:

```bash
npm test tests/app.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/app.ts src/styles.css tests/app.test.ts
git commit -m "feat: add ranking import export settings"
```

## Task 4: Jukebox Mode UI

**Files:**
- Modify: `src/app.ts`
- Modify: `src/styles.css`
- Test: `tests/app.test.ts`

- [ ] **Step 1: Write failing app tests for jukebox mode**

Add app tests that verify:

```ts
it('switches to jukebox mode and renders a shuffled playlist player', () => {
  const root = document.createElement('main');
  renderApp(root);

  root.querySelector<HTMLButtonElement>('[data-testid="mode-jukebox"]')?.click();

  expect(root.querySelector('[data-testid="jukebox"]')).not.toBeNull();
  expect(root.querySelector<HTMLInputElement>('[data-testid="jukebox-limit"]')?.value).toBe('0');
  expect(root.querySelector<HTMLAudioElement>('[data-testid="jukebox-audio"]')?.src).toContain(
    '.ogg'
  );
});
```

Add an ended test:

```ts
it('advances jukebox playback when the current track ends', async () => {
  const root = document.createElement('main');
  renderApp(root);
  root.querySelector<HTMLButtonElement>('[data-testid="mode-jukebox"]')?.click();

  const firstTitle = root.querySelector('[data-testid="jukebox-track-title"]')?.textContent;
  root.querySelector<HTMLAudioElement>('[data-testid="jukebox-audio"]')?.dispatchEvent(new Event('ended'));
  await Promise.resolve();

  expect(root.querySelector('[data-testid="jukebox-track-title"]')?.textContent).not.toBe(firstTitle);
});
```

Add a top-N test:

```ts
it('rebuilds the jukebox playlist when the top track limit changes', () => {
  const root = document.createElement('main');
  renderApp(root);
  root.querySelector<HTMLButtonElement>('[data-testid="mode-jukebox"]')?.click();

  const input = root.querySelector<HTMLInputElement>('[data-testid="jukebox-limit"]');
  if (input) {
    input.value = '1';
    input.dispatchEvent(new Event('input'));
  }

  expect(root.querySelector('[data-testid="jukebox-position"]')?.textContent).toBe('1 / 1');
});
```

- [ ] **Step 2: Run app tests to verify they fail**

Run:

```bash
npm test tests/app.test.ts
```

Expected: fail because mode controls and jukebox UI do not exist.

- [ ] **Step 3: Implement mode state and jukebox rendering**

In `src/app.ts`:

- Add `let mode: 'sort' | 'jukebox' = 'sort';`.
- Add a local `jukebox` state object with:

```ts
let jukebox = {
  limit: 0,
  playlist: [] as Track[],
  currentIndex: 0,
  blocked: false,
  message: ''
};
```

- Add mode buttons near the top of the shell:
  - `data-testid="mode-sort"`
  - `data-testid="mode-jukebox"`
- Render sort mode as current matchup plus rankings.
- Render jukebox mode as `renderJukebox()` plus rankings.
- Build playlist with `buildJukeboxPlaylist()` when entering jukebox mode, changing limit, pressing reshuffle, or after import/unavailable changes.
- Render empty playlist message when no tracks are eligible.
- Render current track title as a wiki link, native audio, `Previous`, `Next`, `Reshuffle`, and playlist position.
- On audio ended, advance index and attempt to play. If at the final track, keep the final index and set message `End of playlist.`
- If autoplay is blocked, set jukebox blocked state and render `Start playback`.

- [ ] **Step 4: Style jukebox mode**

In `src/styles.css`, add:

```css
.mode-switch,
.jukebox-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.mode-button[aria-pressed='true'] {
  color: #fff4df;
  background: #7b3029;
}

.jukebox-player {
  margin: 1rem;
  padding: 1rem;
  background: #f0e5cc;
  border: 1px solid #8b7351;
}

.jukebox-player audio {
  display: block;
  width: 100%;
  margin: 0.75rem 0;
}
```

- [ ] **Step 5: Run app tests to verify they pass**

Run:

```bash
npm test tests/domain/jukebox.test.ts tests/app.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/app.ts src/styles.css tests/app.test.ts
git commit -m "feat: add jukebox mode"
```

## Task 5: Snapshot Footer

**Files:**
- Modify: `src/app.ts`
- Modify: `src/styles.css`
- Test: `tests/app.test.ts`

- [ ] **Step 1: Write failing footer test**

Add to `tests/app.test.ts`:

```ts
it('renders the OSRS Wiki snapshot date and source revision in the footer', () => {
  const root = document.createElement('main');
  renderApp(root);

  expect(root.querySelector('[data-testid="snapshot-footer"]')?.textContent).toContain(
    'Music data snapshot from the OSRS Wiki, fetched May 1, 2026.'
  );
  expect(root.querySelector('[data-testid="snapshot-footer"]')?.textContent).toContain(
    'Source revision 15160007.'
  );
});
```

- [ ] **Step 2: Run app tests to verify it fails**

Run:

```bash
npm test tests/app.test.ts
```

Expected: fail because the footer does not exist.

- [ ] **Step 3: Implement footer**

In `src/app.ts`, append `renderSnapshotFooter()` to the shell:

```ts
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
```

- [ ] **Step 4: Style footer**

In `src/styles.css`:

```css
.snapshot-footer {
  margin: 1rem;
  padding: 0.75rem 1rem;
  color: #4f3e29;
  background: #eadbc0;
  border: 1px solid #b39a72;
  font-size: 0.9rem;
}
```

- [ ] **Step 5: Run app tests to verify they pass**

Run:

```bash
npm test tests/app.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/app.ts src/styles.css tests/app.test.ts
git commit -m "feat: show wiki snapshot footer"
```

## Task 6: E2E Smoke and Final Verification

**Files:**
- Modify: `tests/e2e/ranker.spec.ts`

- [ ] **Step 1: Write/update E2E smoke assertions**

Modify `tests/e2e/ranker.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('shows the ranker as the first screen', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'OSRS Music Ranker' })).toBeVisible();
  await expect(page.getByLabel('Current matchup')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prefer A' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Too close / Tie' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Prefer B' })).toBeEnabled();
  await expect(page.getByRole('table')).toBeVisible();
});

test('can switch to jukebox mode', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Jukebox' }).click();

  await expect(page.getByLabel('Jukebox')).toBeVisible();
  await expect(page.getByLabel('Top tracks')).toHaveValue('0');
  await expect(page.getByText('Music data snapshot from the OSRS Wiki')).toBeVisible();
});
```

- [ ] **Step 2: Run E2E to verify it passes**

Run:

```bash
npm run test:e2e
```

Expected: pass.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run build
npm run test:e2e
```

Expected: all pass.

- [ ] **Step 4: Visual check**

Start or reuse the dev server:

```bash
npm run dev -- --host 127.0.0.1
```

Capture a desktop screenshot:

```bash
TMPDIR=/tmp npx playwright screenshot --viewport-size=1800,900 http://127.0.0.1:5173/ /tmp/osrs-ranker-jukebox.png
```

If Vite chooses another port, use that URL. Confirm:

- Header settings menu does not overlap the title.
- Mode switch is visible.
- Sort mode still has side-by-side track panels on wide screens.
- Jukebox mode has a clear current track, top-N input, controls, and footer.
- Text does not overflow buttons or panels.

- [ ] **Step 5: Commit E2E/final fixes**

Run:

```bash
git add tests/e2e/ranker.spec.ts src/app.ts src/styles.css tests/app.test.ts
git commit -m "test: cover jukebox smoke flow"
```

Skip this commit if no files changed during final verification.

## Self-Review

- Spec coverage: backup/export/import, settings menu, jukebox top-N shuffle, no-repeat run, snapshot footer, error handling, app tests, and e2e smoke all have tasks.
- Placeholder scan: no placeholder markers or open-ended implementation steps remain.
- Type consistency: plan uses existing `StoredState`, `Track`, `StoredRating`, `ComparisonResult`, `conservativeScore`, and `localStorage` patterns.
