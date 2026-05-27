import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const WIKI_URL = 'https://en.wikipedia.org/w/api.php?action=parse&page=List_of_cities_in_Maharashtra&prop=wikitext&format=json&origin=*';
const API_BASE = 'https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&origin=*';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.resolve(__dirname, '..', 'data', 'maharashtra-cities.csv');

const fetchWiki = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, {
    headers: {
      'User-Agent': 'trackbus-cities-seed/1.0 (local)'
    }
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => resolve(data));
  });
  req.on('error', reject);
});

const extractCitiesFromWikitext = (wikitext) => {
  const lines = wikitext.split('\n');
  const cities = new Set();
  let inSection = false;

  for (const line of lines) {
    if (line.startsWith('==')) {
      const isCitiesSection = /cities/i.test(line);
      if (inSection && !isCitiesSection) {
        break;
      }
      inSection = isCitiesSection;
      continue;
    }

    if (!inSection) continue;

    if (line.startsWith('|')) {
      const match = line.match(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/);
      if (match) {
        const rawName = match[1].trim();
        const name = rawName
          .replace(/,\s*Maharashtra$/i, '')
          .replace(/\s*\(city\)$/i, '')
          .trim();
        if (!name || /list of/i.test(name)) continue;
        if (/File:/i.test(name)) continue;
        if (/district/i.test(name)) continue;
        cities.add(name);
      }
    }
  }

  return Array.from(cities).sort((a, b) => a.localeCompare(b));
};

const parseRedirect = (wikitext) => {
  const match = wikitext.match(/#REDIRECT\s+\[\[([^\]]+)\]\]/i);
  return match ? match[1].trim() : null;
};

const main = async () => {
  let raw = await fetchWiki(WIKI_URL);
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    const preview = raw.slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new Error(`Wikipedia API response is not JSON. Preview: ${preview}`);
  }
  let wikitext = json?.parse?.wikitext?.['*'];
  const redirectTarget = wikitext ? parseRedirect(wikitext) : null;

  if (redirectTarget) {
    const redirectUrl = `${API_BASE}&page=${encodeURIComponent(redirectTarget)}`;
    raw = await fetchWiki(redirectUrl);
    json = JSON.parse(raw);
    wikitext = json?.parse?.wikitext?.['*'];
  }

  if (!wikitext) {
    throw new Error('Failed to load wikitext from Wikipedia.');
  }

  const cityNames = extractCitiesFromWikitext(wikitext);
  if (!cityNames.length) {
    throw new Error('No city names found in Wikipedia wikitext.');
  }

  const csv = ['name', ...cityNames].join('\n');
  fs.writeFileSync(outPath, csv, 'utf8');
  console.log(`Saved ${cityNames.length} cities to ${outPath}`);
};

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
