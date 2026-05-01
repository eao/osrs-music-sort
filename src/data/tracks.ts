import snapshot from './tracks.json';
import type { TrackSnapshot } from '../domain/types';

export function getTrackSnapshot(): TrackSnapshot {
  return snapshot as TrackSnapshot;
}
