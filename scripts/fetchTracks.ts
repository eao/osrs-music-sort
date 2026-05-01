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
    revid?: number;
    text: {
      '*': string;
    };
  };
};

type QueryApiResponse = {
  query: {
    pages: Record<
      string,
      {
        revisions?: Array<{
          revid?: number;
        }>;
      }
    >;
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

  const rows = table.querySelectorAll('tr');
  const columns = getTrackListColumns(rows[0]);

  return rows.slice(1).flatMap((row) => {
    const cells = row.querySelectorAll('td');
    const nameCell = cells[columns.name];
    const unlockCell = cells[columns.unlock];
    const durationCell = cells[columns.duration];
    const membersCell = cells[columns.members];
    const audioCell = cells[columns.audio];

    if (!nameCell || !unlockCell || !durationCell || !membersCell || !audioCell) return [];

    const titleLink = nameCell.querySelector('a');
    const title = titleLink?.text.trim();
    const titleHref = titleLink?.getAttribute('href') ?? null;

    if (!title || !titleHref) return [];

    const fileHref = audioCell.querySelector('a[href*="File:"]')?.getAttribute('href');

    return [
      {
        id: slugifyTrackId(title),
        title,
        wikiUrl: toWikiUrl(titleHref),
        audioUrl: wikiFileToAudioUrl(fileHref),
        duration: textOrNull(durationCell),
        members: parseMembers(textOrNull(membersCell)),
        unlockHint: textOrNull(unlockCell),
        isHoliday: Boolean(nameCell.querySelector('i')),
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

  const data = await fetchWikiJson<ParseApiResponse>(url);
  const sourceRevision =
    data.parse.revid == null ? await fetchMusicPageRevision() : String(data.parse.revid);
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

async function fetchMusicPageRevision(): Promise<string | null> {
  const url = new URL(`${WIKI_ORIGIN}/api.php`);
  url.search = new URLSearchParams({
    action: 'query',
    titles: 'Music',
    prop: 'revisions',
    rvprop: 'ids',
    format: 'json',
    origin: '*'
  }).toString();

  const data = await fetchWikiJson<QueryApiResponse>(url);
  const page = Object.values(data.query.pages)[0];
  const revision = page?.revisions?.[0]?.revid;

  return revision == null ? null : String(revision);
}

async function fetchWikiJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'osrs-music-ranker/0.1.0 (local build script)'
    }
  });

  if (!response.ok) {
    throw new Error(`OSRS Wiki request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
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

function getTrackListColumns(headerRow: HTMLElement | undefined): {
  name: number;
  unlock: number;
  duration: number;
  members: number;
  audio: number;
} {
  const headers = headerRow?.querySelectorAll('th').map((header) => textOrNull(header)?.toLowerCase() ?? '') ?? [];

  return {
    name: findColumn(headers, ['name'], 0),
    unlock: findColumn(headers, ['unlock details'], 1),
    duration: findColumn(headers, ['duration', 'length'], 3),
    members: findColumn(headers, ['members', 'p2p'], 2),
    audio: findColumn(headers, ['music track'], 4)
  };
}

function findColumn(headers: string[], names: string[], fallback: number): number {
  const index = headers.findIndex((header) => names.includes(header));
  return index >= 0 ? index : fallback;
}

function textOrNull(element: HTMLElement): string | null {
  const text = element.text.trim().replace(/\s+/g, ' ');
  return text.length > 0 ? text : null;
}

function parseMembers(value: string | null): boolean | null {
  if (!value) return null;
  if (value === '1') return true;
  if (value === '0') return false;
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
