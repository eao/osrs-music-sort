# OSRS Music Ranker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static OSRS music ranker where users compare two listed tracks at a time, producing locally persisted TrueSkill-style rankings with tie support.

**Architecture:** Use a vanilla Vite + TypeScript app with pure domain modules for tracks, ratings, pair selection, and storage. Generate a bundled track snapshot from the OSRS Wiki at build time, then keep all runtime state in `localStorage`.

**Tech Stack:** Vite, TypeScript, Vitest, jsdom, Playwright, `ts-trueskill`, `node-html-parser`, `tsx`.

---

## File Structure

- Create `package.json`: npm scripts and dependencies.
- Create `tsconfig.json`: strict TypeScript config for app, tests, and scripts.
- Create `vite.config.ts`: Vite + Vitest config using jsdom.
- Create `playwright.config.ts`: browser smoke test config.
- Create `index.html`: static app shell.
- Create `src/styles.css`: OSRS Wiki-inspired square-corner theme.
- Create `src/main.ts`: bootstraps the app.
- Create `src/app.ts`: DOM rendering and event handling.
- Create `src/domain/types.ts`: shared track, rating, comparison, and state types.
- Create `src/domain/rating.ts`: TrueSkill adapter and ranking helpers.
- Create `src/domain/pairing.ts`: next-pair selection.
- Create `src/domain/storage.ts`: `localStorage` load/save/migration.
- Create `src/data/tracks.json`: starter snapshot with a small valid dataset; refreshed by script.
- Create `src/data/tracks.ts`: typed loader for bundled snapshot.
- Create `scripts/fetchTracks.ts`: OSRS Wiki fetch and normalization script.
- Create `tests/fixtures/music-page.html`: focused wiki table fixture.
- Create `tests/domain/rating.test.ts`: rating update tests.
- Create `tests/domain/pairing.test.ts`: pair-selection tests.
- Create `tests/domain/storage.test.ts`: persistence tests.
- Create `tests/data/fetchTracks.test.ts`: data normalization tests.
- Create `tests/app.test.ts`: DOM flow tests.
- Create `tests/e2e/ranker.spec.ts`: first-screen smoke test.

Keep the app vanilla TypeScript for the initial release. Do not introduce React, routing, state-management libraries, accounts, a backend, or CSS frameworks.

---

### Task 1: Scaffold The Static TypeScript App

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `playwright.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/app.ts`
- Create: `src/styles.css`

- [ ] **Step 1: Create npm project metadata**

Create `package.json` with this content:

```json
{
  "name": "osrs-sort",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "fetch:tracks": "tsx scripts/fetchTracks.ts"
  },
  "dependencies": {
    "ts-trueskill": "^5.1.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.52.0",
    "@types/node": "^22.15.0",
    "jsdom": "^26.1.0",
    "node-html-parser": "^7.0.1",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vite": "^6.3.4",
    "vitest": "^3.1.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: npm creates `package-lock.json` and installs dependencies without audit failures that block installation.

- [ ] **Step 3: Add TypeScript and test config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "scripts", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts']
  }
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true
  },
  use: {
    baseURL: 'http://127.0.0.1:5173'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
```

- [ ] **Step 4: Add the minimal app shell**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OSRS Music Ranker</title>
  </head>
  <body>
    <main id="app" class="app-shell"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `src/styles.css`:

```css
:root {
  color: #2b2118;
  background: #c8b28c;
  font-family: Arial, Helvetica, sans-serif;
}

body {
  margin: 0;
  background: #c8b28c;
}

button,
input,
select {
  font: inherit;
}

button {
  border: 1px solid #5f4b32;
  background: #d8c7a6;
  color: #2b2118;
  padding: 0.45rem 0.7rem;
  border-radius: 0;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.app-shell {
  max-width: 1120px;
  margin: 0 auto;
  min-height: 100vh;
  background: #e7ddc8;
  border-left: 1px solid #a8916c;
  border-right: 1px solid #a8916c;
}
```

Create `src/app.ts`:

```ts
export function renderApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="site-header">
      <h1>OSRS Music Ranker</h1>
    </header>
    <section aria-label="Current matchup">
      <p>Loading music tracks...</p>
    </section>
  `;
}
```

Create `src/main.ts`:

```ts
import './styles.css';
import { renderApp } from './app';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Missing #app root element');
}

renderApp(root);
```

- [ ] **Step 5: Verify scaffold builds**

Run: `npm run build`

Expected: command exits 0 and creates `dist/`.

- [ ] **Step 6: Commit scaffold**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts playwright.config.ts index.html src/main.ts src/app.ts src/styles.css
git commit -m "feat: scaffold static music ranker app"
```

---

### Task 2: Add Domain Types And Starter Dataset

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/data/tracks.json`
- Create: `src/data/tracks.ts`
- Modify: `src/app.ts`
- Test: `tests/data/tracks.test.ts`

- [ ] **Step 1: Write failing dataset loader test**

Create `tests/data/tracks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getTrackSnapshot } from '../../src/data/tracks';

describe('track snapshot', () => {
  it('loads a versioned starter dataset with stable track IDs', () => {
    const snapshot = getTrackSnapshot();

    expect(snapshot.datasetVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(snapshot.sourceUrls).toContain('https://oldschool.runescape.wiki/w/Music');
    expect(snapshot.tracks.length).toBeGreaterThanOrEqual(3);
    expect(snapshot.tracks[0]).toMatchObject({
      id: '7th-realm',
      title: '7th Realm',
      wikiUrl: 'https://oldschool.runescape.wiki/w/7th_Realm',
      duration: '04:07',
      members: false,
      isHoliday: false
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test tests/data/tracks.test.ts`

Expected: FAIL because `src/data/tracks` does not exist.

- [ ] **Step 3: Add shared domain types**

Create `src/domain/types.ts`:

```ts
export type Track = {
  id: string;
  title: string;
  wikiUrl: string;
  audioUrl: string | null;
  duration: string | null;
  members: boolean | null;
  unlockHint: string | null;
  isHoliday: boolean;
  sourceRevision: string | null;
};

export type TrackSnapshot = {
  datasetVersion: string;
  fetchedAt: string;
  sourceUrls: string[];
  tracks: Track[];
};

export type ComparisonResult = 'left' | 'right' | 'tie';

export type StoredRating = {
  trackId: string;
  mu: number;
  sigma: number;
  comparisons: number;
  wins: number;
  losses: number;
  ties: number;
};

export type StoredComparison = {
  id: string;
  leftTrackId: string;
  rightTrackId: string;
  result: ComparisonResult;
  createdAt: string;
};

export type StoredState = {
  schemaVersion: 1;
  datasetVersion: string;
  ratings: Record<string, StoredRating>;
  comparisons: StoredComparison[];
  unavailableTrackIds: string[];
  currentPair: [string, string] | null;
  lastPair: [string, string] | null;
  playback: {
    volume: number;
  };
};
```

- [ ] **Step 4: Add starter dataset and typed loader**

Create `src/data/tracks.json`:

```json
{
  "datasetVersion": "2026-04-30",
  "fetchedAt": "2026-04-30T00:00:00.000Z",
  "sourceUrls": [
    "https://oldschool.runescape.wiki/w/Music"
  ],
  "tracks": [
    {
      "id": "7th-realm",
      "title": "7th Realm",
      "wikiUrl": "https://oldschool.runescape.wiki/w/7th_Realm",
      "audioUrl": "https://oldschool.runescape.wiki/images/7th_Realm.ogg",
      "duration": "04:07",
      "members": false,
      "unlockHint": "Unlocked in the Brimhaven Dungeon",
      "isHoliday": false,
      "sourceRevision": null
    },
    {
      "id": "adventure",
      "title": "Adventure",
      "wikiUrl": "https://oldschool.runescape.wiki/w/Adventure",
      "audioUrl": "https://oldschool.runescape.wiki/images/Adventure.ogg",
      "duration": "02:41",
      "members": false,
      "unlockHint": "Unlocked in Varrock",
      "isHoliday": false,
      "sourceRevision": null
    },
    {
      "id": "al-kharid",
      "title": "Al Kharid",
      "wikiUrl": "https://oldschool.runescape.wiki/w/Al_Kharid_(music_track)",
      "audioUrl": "https://oldschool.runescape.wiki/images/Al_Kharid.ogg",
      "duration": "03:18",
      "members": false,
      "unlockHint": "Unlocked in Al Kharid",
      "isHoliday": false,
      "sourceRevision": null
    }
  ]
}
```

Create `src/data/tracks.ts`:

```ts
import snapshot from './tracks.json';
import type { TrackSnapshot } from '../domain/types';

export function getTrackSnapshot(): TrackSnapshot {
  return snapshot as TrackSnapshot;
}
```

- [ ] **Step 5: Run the dataset test**

Run: `npm test tests/data/tracks.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit domain types and starter dataset**

```bash
git add src/domain/types.ts src/data/tracks.json src/data/tracks.ts tests/data/tracks.test.ts
git commit -m "feat: add track domain types and starter dataset"
```

---

### Task 3: Implement Rating Updates

**Files:**
- Create: `src/domain/rating.ts`
- Test: `tests/domain/rating.test.ts`

- [ ] **Step 1: Write failing rating tests**

Create `tests/domain/rating.test.ts`:

```ts
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
    expect(rankedRatings(ratings).map((rating) => rating.trackId)).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test tests/domain/rating.test.ts`

Expected: FAIL because `src/domain/rating` does not exist.

- [ ] **Step 3: Implement the rating module**

Create `src/domain/rating.ts`:

```ts
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
      ? rate_1vs1(new Rating(right.mu, right.sigma), new Rating(left.mu, left.sigma))
          .reverse()
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
```

- [ ] **Step 4: Run rating tests**

Run: `npm test tests/domain/rating.test.ts`

Expected: PASS.

- [ ] **Step 5: Run all unit tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit rating engine**

```bash
git add src/domain/rating.ts tests/domain/rating.test.ts
git commit -m "feat: add comparison-based rating engine"
```

---

### Task 4: Implement Pair Selection

**Files:**
- Create: `src/domain/pairing.ts`
- Test: `tests/domain/pairing.test.ts`

- [ ] **Step 1: Write failing pair-selection tests**

Create `tests/domain/pairing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { StoredRating, Track } from '../../src/domain/types';
import { selectNextPair } from '../../src/domain/pairing';

const tracks: Track[] = [
  track('a', 'A'),
  track('b', 'B'),
  track('c', 'C'),
  track('d', 'D')
];

function track(id: string, title: string): Track {
  return {
    id,
    title,
    wikiUrl: `https://example.test/${id}`,
    audioUrl: `https://example.test/${id}.ogg`,
    duration: '01:00',
    members: false,
    unlockHint: null,
    isHoliday: false,
    sourceRevision: null
  };
}

function rating(trackId: string, mu: number, sigma: number, comparisons: number): StoredRating {
  return { trackId, mu, sigma, comparisons, wins: 0, losses: 0, ties: 0 };
}

describe('selectNextPair', () => {
  it('prefers under-compared tracks', () => {
    const pair = selectNextPair({
      tracks,
      ratings: {
        a: rating('a', 25, 8, 10),
        b: rating('b', 25, 8, 10),
        c: rating('c', 25, 8, 0),
        d: rating('d', 25, 8, 0)
      },
      unavailableTrackIds: new Set(),
      lastPair: null
    });

    expect(pair).toEqual(['c', 'd']);
  });

  it('skips unavailable tracks', () => {
    const pair = selectNextPair({
      tracks,
      ratings: {
        a: rating('a', 25, 8, 0),
        b: rating('b', 25, 8, 0),
        c: rating('c', 25, 8, 0),
        d: rating('d', 25, 8, 0)
      },
      unavailableTrackIds: new Set(['a', 'b']),
      lastPair: null
    });

    expect(pair).toEqual(['c', 'd']);
  });

  it('avoids repeating the previous pair when another pair exists', () => {
    const pair = selectNextPair({
      tracks,
      ratings: {
        a: rating('a', 25, 8, 0),
        b: rating('b', 25, 8, 0),
        c: rating('c', 25, 8, 0),
        d: rating('d', 25, 8, 0)
      },
      unavailableTrackIds: new Set(),
      lastPair: ['a', 'b']
    });

    expect(pair).not.toEqual(['a', 'b']);
  });

  it('returns null when fewer than two tracks are available', () => {
    const pair = selectNextPair({
      tracks,
      ratings: {
        a: rating('a', 25, 8, 0),
        b: rating('b', 25, 8, 0),
        c: rating('c', 25, 8, 0),
        d: rating('d', 25, 8, 0)
      },
      unavailableTrackIds: new Set(['a', 'b', 'c']),
      lastPair: null
    });

    expect(pair).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test tests/domain/pairing.test.ts`

Expected: FAIL because `src/domain/pairing` does not exist.

- [ ] **Step 3: Implement pair selection**

Create `src/domain/pairing.ts`:

```ts
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
```

- [ ] **Step 4: Run pair-selection tests**

Run: `npm test tests/domain/pairing.test.ts`

Expected: PASS.

- [ ] **Step 5: Run all unit tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit pair selection**

```bash
git add src/domain/pairing.ts tests/domain/pairing.test.ts
git commit -m "feat: select informative music matchups"
```

---

### Task 5: Implement Local Persistence

**Files:**
- Create: `src/domain/storage.ts`
- Test: `tests/domain/storage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `tests/domain/storage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '../../src/domain/types';
import { loadStoredState, saveStoredState, STORAGE_KEY } from '../../src/domain/storage';

const tracks: Track[] = [
  {
    id: 'a',
    title: 'A',
    wikiUrl: 'https://example.test/a',
    audioUrl: null,
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
    audioUrl: null,
    duration: null,
    members: null,
    unlockHint: null,
    isHoliday: false,
    sourceRevision: null
  }
];

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates initial state when nothing is stored', () => {
    const state = loadStoredState('2026-04-30', tracks);

    expect(state.schemaVersion).toBe(1);
    expect(state.datasetVersion).toBe('2026-04-30');
    expect(Object.keys(state.ratings)).toEqual(['a', 'b']);
    expect(state.playback.volume).toBe(0.8);
  });

  it('round-trips stored state', () => {
    const state = loadStoredState('2026-04-30', tracks);
    state.unavailableTrackIds.push('b');
    state.currentPair = ['a', 'b'];

    saveStoredState(state);

    expect(loadStoredState('2026-04-30', tracks).unavailableTrackIds).toEqual(['b']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').currentPair).toEqual(['a', 'b']);
  });

  it('migrates existing ratings by stable track ID when dataset changes', () => {
    const state = loadStoredState('2026-04-30', tracks);
    state.ratings.a.mu = 31;
    saveStoredState(state);

    const migrated = loadStoredState('2026-05-01', [
      tracks[0],
      {
        ...tracks[1],
        id: 'c',
        title: 'C'
      }
    ]);

    expect(migrated.datasetVersion).toBe('2026-05-01');
    expect(migrated.ratings.a.mu).toBe(31);
    expect(migrated.ratings.c.mu).toBe(25);
    expect(migrated.ratings.b).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test tests/domain/storage.test.ts`

Expected: FAIL because `src/domain/storage` does not exist.

- [ ] **Step 3: Implement storage helpers**

Create `src/domain/storage.ts`:

```ts
import type { StoredState, Track } from './types';
import { createInitialRatings } from './rating';

export const STORAGE_KEY = 'osrs-music-ranker-state';

export function loadStoredState(datasetVersion: string, tracks: Track[]): StoredState {
  const initial = createEmptyState(datasetVersion, tracks);
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as StoredState;
    if (parsed.schemaVersion !== 1) {
      return initial;
    }

    if (parsed.datasetVersion !== datasetVersion) {
      return migrateState(parsed, datasetVersion, tracks);
    }

    return {
      ...initial,
      ...parsed,
      ratings: {
        ...initial.ratings,
        ...filterRatings(parsed.ratings, tracks)
      }
    };
  } catch {
    return initial;
  }
}

export function saveStoredState(state: StoredState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createEmptyState(datasetVersion: string, tracks: Track[]): StoredState {
  return {
    schemaVersion: 1,
    datasetVersion,
    ratings: createInitialRatings(tracks),
    comparisons: [],
    unavailableTrackIds: [],
    currentPair: null,
    lastPair: null,
    playback: {
      volume: 0.8
    }
  };
}

function migrateState(previous: StoredState, datasetVersion: string, tracks: Track[]): StoredState {
  const next = createEmptyState(datasetVersion, tracks);
  const filteredRatings = filterRatings(previous.ratings, tracks);

  return {
    ...next,
    ratings: {
      ...next.ratings,
      ...filteredRatings
    },
    comparisons: previous.comparisons,
    unavailableTrackIds: previous.unavailableTrackIds.filter((id) =>
      tracks.some((track) => track.id === id)
    ),
    playback: previous.playback ?? next.playback
  };
}

function filterRatings(
  ratings: StoredState['ratings'],
  tracks: Track[]
): StoredState['ratings'] {
  const trackIds = new Set(tracks.map((track) => track.id));

  return Object.fromEntries(
    Object.entries(ratings).filter(([trackId]) => trackIds.has(trackId))
  );
}
```

- [ ] **Step 4: Run storage tests**

Run: `npm test tests/domain/storage.test.ts`

Expected: PASS.

- [ ] **Step 5: Run all unit tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit storage**

```bash
git add src/domain/storage.ts tests/domain/storage.test.ts
git commit -m "feat: persist local ranking sessions"
```

---

### Task 6: Add OSRS Wiki Data Importer

**Files:**
- Create: `scripts/fetchTracks.ts`
- Create: `tests/fixtures/music-page.html`
- Test: `tests/data/fetchTracks.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write a focused wiki table fixture**

Create `tests/fixtures/music-page.html`:

```html
<html>
  <body>
    <h2 id="Track_list">Track list</h2>
    <table class="wikitable">
      <tbody>
        <tr>
          <th>Name</th>
          <th>Unlock details</th>
          <th>Members</th>
          <th>Duration</th>
          <th>Music track</th>
        </tr>
        <tr>
          <td><a href="/w/7th_Realm">7th Realm</a></td>
          <td>Unlocked in the Brimhaven Dungeon</td>
          <td>No</td>
          <td>04:07</td>
          <td><a href="/w/File:7th_Realm.ogg">Play track</a></td>
        </tr>
        <tr>
          <td><i><a href="/w/Diango%27s_Little_Helpers">Diango's Little Helpers</a></i></td>
          <td>Unlocked during a Christmas event</td>
          <td>No</td>
          <td>02:00</td>
          <td><a href="/w/File:Diango%27s_Little_Helpers.ogg">Play track</a></td>
        </tr>
      </tbody>
    </table>
    <h2 id="Updated_tracks">Updated tracks</h2>
    <p>Rows after this heading are not part of the track list.</p>
  </body>
</html>
```

- [ ] **Step 2: Write failing importer tests**

Create `tests/data/fetchTracks.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMusicPage, slugifyTrackId, wikiFileToAudioUrl } from '../../scripts/fetchTracks';

describe('fetchTracks helpers', () => {
  it('creates stable lowercase IDs', () => {
    expect(slugifyTrackId("Diango's Little Helpers")).toBe('diangos-little-helpers');
    expect(slugifyTrackId('Al Kharid')).toBe('al-kharid');
  });

  it('converts wiki file links to direct audio URLs', () => {
    expect(wikiFileToAudioUrl('/w/File:7th_Realm.ogg')).toBe(
      'https://oldschool.runescape.wiki/images/7th_Realm.ogg'
    );
  });

  it('parses listed tracks and marks italic holiday tracks', () => {
    const html = readFileSync('tests/fixtures/music-page.html', 'utf8');
    const tracks = parseMusicPage(html, '12345');

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      id: '7th-realm',
      title: '7th Realm',
      wikiUrl: 'https://oldschool.runescape.wiki/w/7th_Realm',
      audioUrl: 'https://oldschool.runescape.wiki/images/7th_Realm.ogg',
      duration: '04:07',
      members: false,
      unlockHint: 'Unlocked in the Brimhaven Dungeon',
      isHoliday: false,
      sourceRevision: '12345'
    });
    expect(tracks[1].isHoliday).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test tests/data/fetchTracks.test.ts`

Expected: FAIL because `scripts/fetchTracks` does not exist.

- [ ] **Step 4: Implement importer helpers and script**

Create `scripts/fetchTracks.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, HTMLElement } from 'node-html-parser';
import type { Track, TrackSnapshot } from '../src/domain/types';

const WIKI_ORIGIN = 'https://oldschool.runescape.wiki';
const MUSIC_PAGE = `${WIKI_ORIGIN}/w/Music`;
const OUTPUT_PATH = 'src/data/tracks.json';

type ParseApiResponse = {
  parse: {
    revid: number;
    text: {
      '*': string;
    };
  };
};

export function slugifyTrackId(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function wikiFileToAudioUrl(fileHref: string | null | undefined): string | null {
  if (!fileHref) return null;
  const fileName = decodeURIComponent(fileHref.split('/').pop() ?? '').replace(/^File:/, '');
  if (!fileName.endsWith('.ogg')) return null;
  return `${WIKI_ORIGIN}/images/${encodeURIComponent(fileName).replace(/%20/g, '_')}`;
}

export function parseMusicPage(html: string, sourceRevision: string | null): Track[] {
  const root = parse(html);
  const table = findTrackListTable(root);

  if (!table) {
    throw new Error('Could not find Music page track list table');
  }

  return table.querySelectorAll('tr').slice(1).flatMap((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) return [];

    const titleLink = cells[0].querySelector('a');
    const title = titleLink?.text.trim();
    const titleHref = titleLink?.getAttribute('href') ?? null;

    if (!title || !titleHref) return [];

    const fileHref = cells[4].querySelector('a[href*="File:"]')?.getAttribute('href');

    return [
      {
        id: slugifyTrackId(title),
        title,
        wikiUrl: toWikiUrl(titleHref),
        audioUrl: wikiFileToAudioUrl(fileHref),
        duration: textOrNull(cells[3]),
        members: parseMembers(textOrNull(cells[2])),
        unlockHint: textOrNull(cells[1]),
        isHoliday: Boolean(cells[0].querySelector('i')),
        sourceRevision
      }
    ];
  });
}

async function main(): Promise<void> {
  const url = new URL(`${WIKI_ORIGIN}/api.php`);
  url.search = new URLSearchParams({
    action: 'parse',
    page: 'Music',
    prop: 'text',
    format: 'json',
    origin: '*'
  }).toString();

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'osrs-music-ranker/0.1.0 (local build script)'
    }
  });

  if (!response.ok) {
    throw new Error(`OSRS Wiki request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as ParseApiResponse;
  const sourceRevision = String(data.parse.revid);
  const tracks = parseMusicPage(data.parse.text['*'], sourceRevision);
  const today = new Date().toISOString().slice(0, 10);

  const snapshot: TrackSnapshot = {
    datasetVersion: today,
    fetchedAt: new Date().toISOString(),
    sourceUrls: [MUSIC_PAGE],
    tracks
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(`${OUTPUT_PATH}`, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${tracks.length} tracks to ${OUTPUT_PATH}`);
}

function findTrackListTable(root: HTMLElement): HTMLElement | null {
  const heading = root.querySelector('#Track_list');
  let node = heading?.parentNode?.nextElementSibling ?? null;

  while (node) {
    if (node.tagName.toLowerCase() === 'table') {
      return node;
    }
    node = node.nextElementSibling;
  }

  return root.querySelector('table.wikitable');
}

function toWikiUrl(href: string): string {
  if (href.startsWith('http')) return href;
  return `${WIKI_ORIGIN}${href}`;
}

function textOrNull(element: HTMLElement): string | null {
  const text = element.text.trim().replace(/\s+/g, ' ');
  return text.length > 0 ? text : null;
}

function parseMembers(value: string | null): boolean | null {
  if (!value) return null;
  if (/^yes$/i.test(value)) return true;
  if (/^no$/i.test(value)) return false;
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 5: Run importer tests**

Run: `npm test tests/data/fetchTracks.test.ts`

Expected: PASS.

- [ ] **Step 6: Fetch the real OSRS Wiki snapshot**

Run: `npm run fetch:tracks`

Expected: command exits 0 and prints `Wrote N tracks to src/data/tracks.json`, where `N` is greater than 700.

- [ ] **Step 7: Verify the generated snapshot**

Run: `npm test tests/data/tracks.test.ts`

Expected: PASS. If the first track on the wiki is no longer `7th Realm`, update `tests/data/tracks.test.ts` to assert stable snapshot metadata and a known track found by ID rather than array position.

- [ ] **Step 8: Commit importer and generated snapshot**

```bash
git add scripts/fetchTracks.ts tests/fixtures/music-page.html tests/data/fetchTracks.test.ts src/data/tracks.json tests/data/tracks.test.ts
git commit -m "feat: fetch OSRS music tracks from wiki"
```

---

### Task 7: Build The Ranker UI Flow

**Files:**
- Modify: `src/app.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Test: `tests/app.test.ts`

- [ ] **Step 1: Write failing DOM flow tests**

Create `tests/app.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../src/app';

describe('ranker app', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the first matchup with disabled choice buttons', () => {
    const root = document.createElement('main');
    renderApp(root);

    expect(root.querySelector('h1')?.textContent).toBe('OSRS Music Ranker');
    expect(root.querySelector('[data-testid="left-track"]')?.textContent).toContain('7th Realm');
    expect(root.querySelector('[data-testid="right-track"]')?.textContent).toContain('Adventure');
    expect(root.querySelector<HTMLButtonElement>('[data-testid="prefer-left"]')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="prefer-right"]')?.disabled).toBe(true);
  });

  it('enables choices after both tracks are marked heard', () => {
    const root = document.createElement('main');
    renderApp(root);

    root.querySelector<HTMLButtonElement>('[data-testid="heard-left"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-testid="heard-right"]')?.click();

    expect(root.querySelector<HTMLButtonElement>('[data-testid="prefer-left"]')?.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="tie"]')?.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="prefer-right"]')?.disabled).toBe(false);
  });

  it('saves a comparison and advances after choosing a winner', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T12:00:00.000Z'));

    const root = document.createElement('main');
    renderApp(root);
    root.querySelector<HTMLButtonElement>('[data-testid="heard-left"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-testid="heard-right"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-testid="prefer-left"]')?.click();

    const stored = JSON.parse(localStorage.getItem('osrs-music-ranker-state') ?? '{}');
    expect(stored.comparisons).toHaveLength(1);
    expect(stored.comparisons[0]).toMatchObject({
      leftTrackId: '7th-realm',
      rightTrackId: 'adventure',
      result: 'left'
    });

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test tests/app.test.ts`

Expected: FAIL because the app does not render matchup controls yet.

- [ ] **Step 3: Implement app state and DOM flow**

Replace `src/app.ts` with:

```ts
import { getTrackSnapshot } from './data/tracks';
import { applyComparisonResult, rankedRatings } from './domain/rating';
import { selectNextPair } from './domain/pairing';
import { loadStoredState, saveStoredState } from './domain/storage';
import type { ComparisonResult, StoredState, Track } from './domain/types';

type Runtime = {
  root: HTMLElement;
  tracks: Track[];
  state: StoredState;
  heardLeft: boolean;
  heardRight: boolean;
};

export function renderApp(root: HTMLElement): void {
  const snapshot = getTrackSnapshot();
  const state = loadStoredState(snapshot.datasetVersion, snapshot.tracks);
  const runtime: Runtime = {
    root,
    tracks: snapshot.tracks,
    state,
    heardLeft: false,
    heardRight: false
  };

  ensurePair(runtime);
  render(runtime);
}

function render(runtime: Runtime): void {
  const pair = runtime.state.currentPair;
  const left = pair ? findTrack(runtime.tracks, pair[0]) : null;
  const right = pair ? findTrack(runtime.tracks, pair[1]) : null;
  const choicesEnabled = Boolean(left && right && runtime.heardLeft && runtime.heardRight);

  runtime.root.innerHTML = `
    <header class="site-header">
      <h1>OSRS Music Ranker</h1>
      <p>${runtime.state.comparisons.length} comparisons saved</p>
    </header>
    <section class="matchup" aria-label="Current matchup">
      ${
        left && right
          ? `
            ${renderTrackPanel('left', left, runtime.heardLeft)}
            <div class="matchup-controls">
              <button data-testid="heard-left" type="button">Heard A</button>
              <button data-testid="heard-right" type="button">Heard B</button>
            </div>
            ${renderTrackPanel('right', right, runtime.heardRight)}
            <div class="choice-row">
              <button data-testid="prefer-left" type="button" ${choicesEnabled ? '' : 'disabled'}>Prefer A</button>
              <button data-testid="tie" type="button" ${choicesEnabled ? '' : 'disabled'}>Too close / Tie</button>
              <button data-testid="prefer-right" type="button" ${choicesEnabled ? '' : 'disabled'}>Prefer B</button>
            </div>
            <div class="secondary-actions">
              <button data-testid="skip" type="button">Skip matchup</button>
              <button data-testid="reset" type="button">Reset progress</button>
            </div>
          `
          : '<p>No available matchup remains.</p>'
      }
    </section>
    ${renderRankings(runtime)}
  `;

  runtime.root.querySelector('[data-testid="heard-left"]')?.addEventListener('click', () => {
    runtime.heardLeft = true;
    render(runtime);
  });
  runtime.root.querySelector('[data-testid="heard-right"]')?.addEventListener('click', () => {
    runtime.heardRight = true;
    render(runtime);
  });
  runtime.root.querySelector('[data-testid="prefer-left"]')?.addEventListener('click', () => choose(runtime, 'left'));
  runtime.root.querySelector('[data-testid="tie"]')?.addEventListener('click', () => choose(runtime, 'tie'));
  runtime.root.querySelector('[data-testid="prefer-right"]')?.addEventListener('click', () => choose(runtime, 'right'));
  runtime.root.querySelector('[data-testid="skip"]')?.addEventListener('click', () => {
    runtime.state.lastPair = runtime.state.currentPair;
    runtime.state.currentPair = null;
    runtime.heardLeft = false;
    runtime.heardRight = false;
    ensurePair(runtime);
    saveStoredState(runtime.state);
    render(runtime);
  });
  runtime.root.querySelector('[data-testid="reset"]')?.addEventListener('click', () => {
    localStorage.removeItem('osrs-music-ranker-state');
    renderApp(runtime.root);
  });
}

function renderTrackPanel(side: 'left' | 'right', track: Track, heard: boolean): string {
  const label = side === 'left' ? 'Track A' : 'Track B';
  return `
    <article class="track-panel" data-testid="${side}-track">
      <h2>${label}: ${escapeHtml(track.title)}</h2>
      <p>${escapeHtml(track.unlockHint ?? 'No unlock hint available')}</p>
      ${
        track.audioUrl
          ? `<audio controls preload="none" src="${track.audioUrl}"></audio>`
          : '<p>Audio unavailable.</p>'
      }
      <p>${heard ? 'Heard' : 'Not heard yet'}</p>
    </article>
  `;
}

function renderRankings(runtime: Runtime): string {
  const trackById = new Map(runtime.tracks.map((track) => [track.id, track]));
  const rows = rankedRatings(runtime.state.ratings)
    .slice(0, 20)
    .map((rating, index) => {
      const track = trackById.get(rating.trackId);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(track?.title ?? rating.trackId)}</td>
          <td>${rating.mu.toFixed(2)}</td>
          <td>${rating.sigma.toFixed(2)}</td>
          <td>${rating.comparisons}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <section class="rankings" aria-label="Current rankings">
      <h2>Current rankings</h2>
      <table>
        <thead>
          <tr><th>Rank</th><th>Track</th><th>Rating</th><th>Uncertainty</th><th>Comparisons</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function choose(runtime: Runtime, result: ComparisonResult): void {
  const pair = runtime.state.currentPair;
  if (!pair) return;

  runtime.state.ratings = applyComparisonResult(runtime.state.ratings, pair[0], pair[1], result);
  runtime.state.comparisons.push({
    id: `${Date.now()}-${runtime.state.comparisons.length + 1}`,
    leftTrackId: pair[0],
    rightTrackId: pair[1],
    result,
    createdAt: new Date().toISOString()
  });
  runtime.state.lastPair = pair;
  runtime.state.currentPair = null;
  runtime.heardLeft = false;
  runtime.heardRight = false;
  ensurePair(runtime);
  saveStoredState(runtime.state);
  render(runtime);
}

function ensurePair(runtime: Runtime): void {
  if (runtime.state.currentPair) return;
  runtime.state.currentPair = selectNextPair({
    tracks: runtime.tracks,
    ratings: runtime.state.ratings,
    unavailableTrackIds: new Set(runtime.state.unavailableTrackIds),
    lastPair: runtime.state.lastPair
  });
}

function findTrack(tracks: Track[], id: string): Track | null {
  return tracks.find((track) => track.id === id) ?? null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return escapes[character];
  });
}
```

- [ ] **Step 4: Expand the OSRS Wiki-inspired CSS**

Append to `src/styles.css`:

```css
.site-header {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #a8916c;
  background: #d6c39f;
}

.site-header h1,
.rankings h2,
.track-panel h2 {
  margin: 0;
  font-family: Georgia, 'Times New Roman', serif;
  color: #1f160f;
}

.site-header p {
  margin: 0.25rem 0 0;
}

.matchup,
.rankings {
  margin: 1rem;
  padding: 1rem;
  border: 1px solid #a8916c;
  background: #eee5d3;
}

.track-panel {
  border: 1px solid #b69d75;
  background: #e2d2b4;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}

.track-panel audio {
  width: 100%;
}

.matchup-controls,
.choice-row,
.secondary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.75rem 0;
}

.choice-row button {
  background: #7a2527;
  border-color: #4a1516;
  color: #fff4df;
  font-weight: 700;
}

.secondary-actions button {
  background: #cdb893;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: #f4ecdf;
}

th,
td {
  border: 1px solid #b69d75;
  padding: 0.35rem 0.5rem;
  text-align: left;
}

th {
  background: #c4aa7f;
}
```

- [ ] **Step 5: Run DOM tests**

Run: `npm test tests/app.test.ts`

Expected: PASS.

- [ ] **Step 6: Run all unit tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit UI flow**

```bash
git add src/app.ts src/main.ts src/styles.css tests/app.test.ts
git commit -m "feat: build comparison ranker UI"
```

---

### Task 8: Add Playback Error Handling And E2E Smoke Test

**Files:**
- Modify: `src/app.ts`
- Modify: `src/styles.css`
- Create: `tests/e2e/ranker.spec.ts`

- [ ] **Step 1: Add Playwright smoke test**

Create `tests/e2e/ranker.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('shows the ranker as the first screen', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'OSRS Music Ranker' })).toBeVisible();
  await expect(page.getByLabel('Current matchup')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prefer A' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Too close / Tie' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Prefer B' })).toBeDisabled();
  await expect(page.getByRole('table')).toBeVisible();
});
```

- [ ] **Step 2: Run E2E test to verify current baseline**

Run: `npm run test:e2e`

Expected: PASS after Playwright downloads or uses an installed browser. If Playwright asks to install browsers, run `npx playwright install chromium`, then rerun `npm run test:e2e`.

- [ ] **Step 3: Add unavailable-track behavior to app tests**

Append to `tests/app.test.ts`:

```ts
it('marks a track unavailable and saves that marker', () => {
  const root = document.createElement('main');
  renderApp(root);

  root.querySelector<HTMLButtonElement>('[data-testid="mark-left-unavailable"]')?.click();

  const stored = JSON.parse(localStorage.getItem('osrs-music-ranker-state') ?? '{}');
  expect(stored.unavailableTrackIds).toContain('7th-realm');
});
```

- [ ] **Step 4: Run the app test to verify it fails**

Run: `npm test tests/app.test.ts`

Expected: FAIL because the unavailable button does not exist.

- [ ] **Step 5: Add unavailable controls**

In `src/app.ts`, update each `renderTrackPanel` call to pass an unavailable button label:

```ts
${renderTrackPanel('left', left, runtime.heardLeft)}
```

and:

```ts
${renderTrackPanel('right', right, runtime.heardRight)}
```

Keep those call sites unchanged, then replace the button section inside `renderTrackPanel` with this full function:

```ts
function renderTrackPanel(side: 'left' | 'right', track: Track, heard: boolean): string {
  const label = side === 'left' ? 'Track A' : 'Track B';
  return `
    <article class="track-panel" data-testid="${side}-track">
      <h2>${label}: ${escapeHtml(track.title)}</h2>
      <p>${escapeHtml(track.unlockHint ?? 'No unlock hint available')}</p>
      ${
        track.audioUrl
          ? `<audio controls preload="none" src="${track.audioUrl}"></audio>`
          : '<p>Audio unavailable.</p>'
      }
      <p>${heard ? 'Heard' : 'Not heard yet'}</p>
      <button data-testid="mark-${side}-unavailable" type="button">Mark unavailable</button>
    </article>
  `;
}
```

Add these listeners inside `render(runtime)` after the heard listeners:

```ts
runtime.root.querySelector('[data-testid="mark-left-unavailable"]')?.addEventListener('click', () => {
  markUnavailable(runtime, 'left');
});
runtime.root.querySelector('[data-testid="mark-right-unavailable"]')?.addEventListener('click', () => {
  markUnavailable(runtime, 'right');
});
```

Add this helper near `choose`:

```ts
function markUnavailable(runtime: Runtime, side: 'left' | 'right'): void {
  const pair = runtime.state.currentPair;
  if (!pair) return;

  const trackId = side === 'left' ? pair[0] : pair[1];
  if (!runtime.state.unavailableTrackIds.includes(trackId)) {
    runtime.state.unavailableTrackIds.push(trackId);
  }
  runtime.state.lastPair = pair;
  runtime.state.currentPair = null;
  runtime.heardLeft = false;
  runtime.heardRight = false;
  ensurePair(runtime);
  saveStoredState(runtime.state);
  render(runtime);
}
```

- [ ] **Step 6: Run verification**

Run: `npm test`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `npm run test:e2e`

Expected: PASS.

- [ ] **Step 7: Start local dev server**

Run: `npm run dev`

Expected: Vite prints a local URL such as `http://localhost:5173/`. Keep the server running for the final handoff.

- [ ] **Step 8: Commit final UI and verification**

```bash
git add src/app.ts src/styles.css tests/app.test.ts tests/e2e/ranker.spec.ts
git commit -m "feat: handle unavailable tracks and verify UI"
```

---

## Final Verification

After all tasks are complete, run:

```bash
npm test
npm run build
npm run test:e2e
git status --short
```

Expected:

- `npm test` exits 0.
- `npm run build` exits 0.
- `npm run test:e2e` exits 0.
- `git status --short` shows no unstaged implementation changes except intentionally ignored local files.

Then start the app:

```bash
npm run dev
```

Report the Vite URL to the user.

## Self-Review Notes

- Spec coverage: The plan covers static app scaffolding, all-track snapshot support, TrueSkill-style ratings, tie handling, local persistence, OSRS Wiki-inspired square-corner styling, data import, error handling for unavailable tracks, and automated verification.
- Scope check: The plan avoids accounts, backend storage, share links, public rankings, and custom visual polish beyond the approved wiki-inspired theme.
- Type consistency: `Track`, `StoredRating`, `StoredComparison`, and `StoredState` are defined once in `src/domain/types.ts` and reused by rating, pairing, storage, data, and UI modules.
