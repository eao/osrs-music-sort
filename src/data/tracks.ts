import snapshot from './tracks.json';
import type { TrackSnapshot } from '../domain/types';

const trackSnapshot: TrackSnapshot = snapshot;

export function getTrackSnapshot(): TrackSnapshot {
  return trackSnapshot;
}
