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

  it('parses the current wiki table columns by header name', () => {
    const html = `
      <h2 id="Track_list">Track list</h2>
      <table class="wikitable">
        <tbody>
          <tr>
            <th>Name</th>
            <th>Unlock details</th>
            <th>Length</th>
            <th>P2P</th>
            <th>Release</th>
            <th>Music track</th>
          </tr>
          <tr>
            <td><a href="/w/7th_Realm">7th Realm</a></td>
            <td>Unlocked in the Brimhaven Dungeon</td>
            <td>04:11</td>
            <td><span style="display:none;">1</span></td>
            <td>17 January 2005</td>
            <td><a href="/w/File:7th_Realm.ogg">Play track</a></td>
          </tr>
        </tbody>
      </table>
    `;

    const tracks = parseMusicPage(html, '67890');

    expect(tracks[0]).toMatchObject({
      audioUrl: 'https://oldschool.runescape.wiki/images/7th_Realm.ogg',
      duration: '04:11',
      members: true
    });
  });
});
