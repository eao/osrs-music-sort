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
