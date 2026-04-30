# OSRS Music Ranker Design

## Overview

Build a static website where users listen to Old School RuneScape music tracks and build a personal ranking through pairwise comparisons. The first release uses all listed OSRS music tracks by default, infers numerical ratings from choices, and stores progress locally in the browser. It does not include accounts, a backend, cross-device sync, sharing, or a highly polished custom visual system.

The app should feel like a small tool that belongs near the OSRS Wiki: compact, readable, tan and cream surfaces, brown borders, maroon accents, square corners, and no modern rounded-card aesthetic.

## Goals

- Let users rank all listed Old School RuneScape music tracks by listening to two tracks at a time.
- Base rankings on comparisons, not direct user-entered scores.
- Maintain numerical ratings internally so the ranking can improve incrementally over many sessions.
- Support `Prefer A`, `Too close / Tie`, and `Prefer B` choices.
- Persist sessions in `localStorage` so users can stop and resume.
- Source track metadata and audio links from the OSRS Wiki through a repeatable build-time snapshot.
- Keep the first implementation static, testable, and deliberately not overbuilt.

## Non-Goals

- User accounts, login, cloud sync, or server-stored rankings.
- Social sharing or public leaderboards.
- Manual 0-100 style scoring.
- A deterministic full merge-sort result requiring the user to complete every comparison.
- Live per-user browser queries to the OSRS Wiki.
- A pixel-perfect clone of the OSRS Wiki or use of OSRS Wiki branding assets.
- Advanced playback features such as waveform displays, playlists, trimming, or equalization.

## Source References

- OSRS Wiki music page: https://oldschool.runescape.wiki/w/Music
- OSRS Wiki unlisted music page: https://oldschool.runescape.wiki/w/Unlisted_music_tracks
- OSRS Wiki jingles page: https://oldschool.runescape.wiki/w/Jingles
- charasort: https://github.com/execfera/charasort/
- tohorank: https://github.com/randomtwdude/tohorank
- image-ranker: https://github.com/QuentinWach/image-ranker
- TrueSkill paper: https://www.microsoft.com/en-us/research/publication/trueskilltm-a-bayesian-skill-rating-system/
- Glicko-2 description: https://www.glicko.net/glicko/glicko2.html

## Approach Comparison

### charasort-Style Manual Sort

`charasort` is a client-side manual merge-sort sorter. Its strengths are simplicity, determinism, no backend, filterable JSON data, shareable results, and versioned datasets. It is a good fit when the desired output is a completed total order and the user is willing to finish the sort.

For this app, the main weakness is session length. OSRS has hundreds of listed tracks, and a deterministic sort can still demand many comparisons. It also does not naturally provide useful partial rankings early unless extra heuristics are added.

### tohorank-Style Glicko-2 Ratings

`tohorank` keeps the pairwise comparison interaction but assigns numerical ratings using Glicko-2. Glicko-2 tracks uncertainty through rating deviation and supports incremental ranking over multiple sessions. This fits the revised goal better than charasort because scores are inferred from comparisons.

The drawback is that Glicko-2 is designed around head-to-head competition and rating periods. It can be adapted for immediate updates after each comparison, but that is less natural than a system built around continuous Bayesian updates and uncertainty-guided matchmaking.

### image-ranker-Style TrueSkill Ratings

`image-ranker` is the closest fit for this project. TrueSkill tracks a mean rating and uncertainty, explicitly supports draws, and works well when rankings should improve incrementally after each comparison. The app can select informative pairs by combining rating closeness and uncertainty, then display a conservative rank score such as `mu - 3 * sigma`.

This approach supports all listed tracks from the start while still giving the user meaningful partial rankings after short sessions. It also keeps future options open: confidence indicators, tie handling, tuned pair selection, and import/export can be added without changing the basic model.

## Decision

Use an image-ranker-style, TrueSkill-like client-side ranking engine for the first implementation.

Each track has:

- `mu`: the inferred preference rating mean.
- `sigma`: rating uncertainty.
- `comparisons`: number of completed comparisons involving the track.
- `wins`, `losses`, and `ties`: simple user-facing stats.

The displayed ordering uses a conservative score derived from the rating and uncertainty, initially `mu - 3 * sigma`. Exact constants can be adjusted during implementation if the selected TrueSkill library exposes different defaults.

## Data Model

Track records should be generated into a bundled JSON file with stable IDs:

```ts
type Track = {
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
```

The first snapshot includes all listed OSRS music tracks. The snapshot excludes pages and tables that are explicitly unlisted, unused, removed, or jingles. Holiday tracks may be included if they appear in the listed Music Player track list; they should be marked with `isHoliday` when the wiki data exposes that distinction.

Tracks with missing or failed audio URLs remain in the dataset but are marked unavailable during app use. This avoids silently removing tracks from a user's ranking.

## Data Fetching

Use a build-time script to fetch and normalize data from the OSRS Wiki into `src/data/tracks.json`. The app should not scrape the wiki directly from the user's browser.

The script should prefer structured wiki data where practical, such as tables, MediaWiki APIs, or Cargo/Semantic MediaWiki data if available. If the first implementation must parse the rendered Music page, parsing should be isolated in a script with tests and clear fixture data so it can be replaced later.

The generated snapshot should include:

- Dataset version date.
- Source page URLs.
- Fetch timestamp.
- Track count.
- Per-track source URL and audio URL when available.

## Ranking Engine

The ranking engine is a pure TypeScript module that does not depend on the DOM. It exposes functions for:

- Creating initial ratings for a track list.
- Applying a comparison result: `left`, `right`, or `tie`.
- Computing the conservative display score.
- Sorting tracks for the rankings view.
- Selecting the next pair.

Pair selection should:

- Prefer tracks with high uncertainty or low comparison count.
- Prefer pairs with close conservative scores once both tracks have some history.
- Avoid immediately repeating the same track or the same pair.
- Avoid unavailable tracks unless no available pair remains.
- Remain deterministic enough to test by accepting an injectable random source or seed.

The first implementation does not need a mathematically perfect scheduler. It only needs predictable behavior that improves over random pairing and can be tuned later.

## Listening Flow

The first version uses one audio element and a clear sequential flow:

1. Show the current left and right tracks.
2. Play Track A.
3. Play Track B.
4. Enable choices only after both tracks have played or the user manually advances through both.
5. Let the user choose `Prefer A`, `Too close / Tie`, or `Prefer B`.
6. Persist the result immediately.
7. Update ratings and select the next pair.

Users should also be able to:

- Replay either track.
- Skip the matchup without changing ratings.
- Mark a track unavailable if playback fails.
- View the current ranking at any time.
- Reset local progress after confirmation.

## Persistence

Use `localStorage` for all user state in the first release:

```ts
type StoredState = {
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

When the dataset version changes, migrate existing ratings by stable track ID. New tracks receive default ratings. Removed tracks stay in comparison history but do not appear in active pair selection.

## UI Design

The app should use a restrained OSRS Wiki-inspired theme:

- Cream content background.
- Tan page background and side surfaces.
- Brown borders and heading rules.
- Dark brown primary text.
- Maroon accent color for important strips and primary actions.
- Square corners or nearly square corners.
- Dense but readable layout.
- No decorative gradients, glossy panels, large rounded cards, or oversized marketing hero.

The first viewport should be the working ranker, not a landing page. A compact header can show the app name, progress, and links to rankings/reset/source information.

Main views:

- **Ranker view:** current matchup, playback status, audio controls, and choice buttons.
- **Rankings view:** ordered table with title, rank, conservative score, uncertainty, comparison count, wins/losses/ties, and audio availability.
- **Data/source panel:** dataset version, source links, and attribution.

The UI should borrow the OSRS Wiki's visual language without copying its logo, navigation, or exact layout.

## Error Handling

- If a track audio URL fails, show a clear unavailable state and let the user mark the track unavailable.
- If both tracks in a matchup are unavailable, skip to the next available pair.
- If no available pairs remain, show the current ranking and a message that more comparisons require resetting unavailable markers or refreshing the dataset.
- If `localStorage` is unavailable or full, keep the current session in memory and show a warning that progress will not persist.
- If the bundled dataset fails to load, show a simple fatal error with no broken controls.

## Testing Strategy

Tests should focus on behavior rather than styling:

- Data normalization excludes unlisted, unused, removed, and jingle categories.
- Data normalization preserves listed holiday tracks when they appear in the main Music Player list.
- Rating updates handle win, loss, and tie outcomes.
- Conservative scores sort uncertain tracks below similarly rated confident tracks.
- Pair selection avoids immediate repeat pairs and prefers uncertain or low-comparison tracks.
- Pair selection skips unavailable tracks.
- Persistence round-trips ratings, comparison history, unavailable IDs, and playback settings.
- Dataset migration preserves ratings for stable IDs and initializes new tracks.
- UI choices are disabled until both tracks have been heard or advanced through.

## Open Decisions Deferred

- Exact TrueSkill library choice.
- Exact wiki extraction method after implementation research.
- Whether to show numeric ratings by default or behind a details toggle.
- Whether to add import/export for local rankings.
- Whether to add optional filters after the all-tracks default is working.
