# Ranking Backup and Jukebox Design

## Goal

Add local ranking backup/restore, a jukebox listening mode, and a visible data snapshot note without introducing accounts or backend storage.

## Scope

This feature extends the existing static client-side app. User ranking data remains local to the browser through `localStorage`. Export/import is a manual JSON backup path for moving or preserving that state.

In scope:

- Export the user's current ranking state as a JSON file.
- Import a previously exported JSON file through a settings menu.
- Validate imported backup shape before replacing local state.
- Reuse the existing dataset migration behavior when importing an older dataset version.
- Add a `Sort` / `Jukebox` mode switch.
- In jukebox mode, play a shuffled playlist with no repeats until the playlist is exhausted.
- Filter the jukebox playlist to the user's top N ranked tracks, with `0` meaning all eligible tracks.
- Add a footer note showing when the OSRS Wiki music data snapshot was fetched.

Out of scope:

- Accounts, login, cloud sync, or server-side storage.
- Sharing public ranking pages.
- Editing backup JSON in the UI.
- Saving jukebox queue position across browser sessions.
- A custom audio player beyond native browser controls and simple playlist controls.

## Export and Import

The top bar gains a small `Settings` control. It opens a plain menu containing:

- `Export ranking data`
- `Import ranking data`

The export action downloads a JSON file named with the app and current date, such as `osrs-music-ranker-backup-2026-05-01.json`.

The exported object has a wrapper around the existing stored state:

```ts
type RankingBackup = {
  app: 'osrs-music-ranker';
  backupVersion: 1;
  exportedAt: string;
  state: StoredState;
};
```

Import accepts only that wrapper format. The importer rejects files when:

- JSON parsing fails.
- `app` is not `osrs-music-ranker`.
- `backupVersion` is unsupported.
- `state.schemaVersion` is unsupported.
- The imported state is missing required arrays or rating data.

When the imported dataset version differs from the current bundled snapshot, the app migrates by stable track ID using the same rules as normal storage loading: keep ratings and comparisons for tracks still present, initialize new tracks, and exclude removed tracks from active pair selection.

Successful import replaces the current local state, saves it to `localStorage`, clears the one-step undo buffer, and rerenders. Failed import leaves current state untouched and shows a short status message in the settings area.

## Jukebox Mode

The main app has two modes:

- `Sort`: the current comparison flow and rankings table.
- `Jukebox`: a playlist listener based on the current ranking data.

The mode switch lives near the top of the app, below or inside the header area. It stays visually simple and consistent with the current OSRS Wiki-inspired theme.

Jukebox mode contains:

- A numeric input labeled `Top tracks`, defaulting to `0`.
- A note that `0` means all eligible tracks.
- The current track title linked to its wiki page.
- Native audio controls.
- `Previous`, `Next`, and `Reshuffle` buttons.
- A small playlist position indicator, such as `12 / 100`.

Eligible jukebox tracks are tracks that:

- Exist in the current snapshot.
- Have an audio URL.
- Are not marked unavailable by the user.

The playlist source is sorted by the current conservative ranking score. If `Top tracks` is greater than `0`, only the top N eligible tracks are included. If it is `0`, all eligible tracks are included. If the limit is greater than the eligible track count, all eligible tracks are included.

After filtering, the app shuffles the playlist. The same shuffled playlist is used until the user reaches the end, changes the `Top tracks` value, or presses `Reshuffle`. A track does not repeat within one shuffled run.

When a jukebox track ends, the app advances to the next track and attempts to play it. If browser autoplay rules block playback, the UI shows a `Start playback` button and keeps the current track selected.

## Snapshot Footer

The bottom of the page includes a compact data note:

```text
Music data snapshot from the OSRS Wiki, fetched May 1, 2026. Source revision 15160007.
```

The date comes from `snapshot.fetchedAt` when possible. The source revision comes from track metadata when at least one track has `sourceRevision`; otherwise omit the revision sentence.

## Error Handling

Export tolerates browser restrictions by keeping failures contained to a visible settings status message.

Import does not partially apply invalid data. The app parses and validates first, then saves only after a valid migrated state is available.

Jukebox mode handles an empty eligible playlist by showing a message that no playable tracks are available. It does not render broken audio controls with no source.

## Testing

Add unit tests for:

- Export backup JSON shape.
- Import validation rejects malformed or wrong-app backups.
- Import migrates older dataset state by stable track IDs.
- Jukebox playlist limits to top N ranked playable tracks.
- Jukebox uses `0` as unlimited.
- Jukebox shuffle has no repeats within one playlist run.

Add app tests for:

- Settings menu exposes export/import controls.
- Import success updates local progress and rerenders.
- Failed import leaves current state intact and shows an error.
- Mode switch renders jukebox mode.
- Jukebox advances to the next track on audio `ended`.
- Footer renders the snapshot date and source revision.

Run the existing Playwright smoke test and add a lightweight jukebox smoke assertion if it stays stable under browser autoplay rules.
