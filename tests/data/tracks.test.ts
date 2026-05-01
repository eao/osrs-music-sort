import { describe, expect, it } from 'vitest';
import { getTrackSnapshot } from '../../src/data/tracks';

describe('track snapshot', () => {
  it('loads a versioned dataset with stable track IDs', () => {
    const snapshot = getTrackSnapshot();

    expect(snapshot.datasetVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(snapshot.sourceUrls).toContain('https://oldschool.runescape.wiki/w/Music');
    expect(snapshot.tracks.length).toBeGreaterThanOrEqual(700);
    expect(snapshot.tracks.find((track) => track.id === '7th-realm')).toMatchObject({
      id: '7th-realm',
      title: '7th Realm',
      wikiUrl: 'https://oldschool.runescape.wiki/w/7th_Realm',
      audioUrl: 'https://oldschool.runescape.wiki/images/7th_Realm.ogg',
      members: true,
      isHoliday: false
    });
  });
});
