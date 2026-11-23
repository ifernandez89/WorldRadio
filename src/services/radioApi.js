import { sanitizeStation } from './storage.js';

const DEFAULT_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
];

let activeMirrors = [...DEFAULT_MIRRORS];
let preferredMirrorIdx = 0;

const responseCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

function getCache(key) {
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key, data) {
  if (responseCache.size > 80) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
  responseCache.set(key, { ts: Date.now(), data });
}

async function fetchJsonWithFailover(path, externalSignal = null) {
  const count = activeMirrors.length;
  let lastError = null;

  for (let attempt = 0; attempt < count; attempt++) {
    const idx = (preferredMirrorIdx + attempt) % count;
    const base = activeMirrors[idx];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9500);

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId);
        throw new DOMException('Aborted', 'AbortError');
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const res = await fetch(`${base}${path}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });
      clearTimeout(timeoutId);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      preferredMirrorIdx = idx;
      return await res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
      if (externalSignal?.aborted) throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('No se pudo conectar con Radio Browser');
}

export async function discoverMirrors() {
  try {
    const servers = await fetchJsonWithFailover('/json/servers');
    if (Array.isArray(servers) && servers.length > 0) {
      const unique = [...new Set(servers.map((s) => `https://${s.name}`))];
      // Keep verified de1/de2 prioritized first
      const merged = [...new Set([...DEFAULT_MIRRORS, ...unique])];
      activeMirrors = merged.slice(0, 6);
    }
  } catch {
    // Keep default mirrors
  }
}

export async function fetchGlobalStats() {
  const key = 'stats';
  const cached = getCache(key);
  if (cached) return cached;
  const data = await fetchJsonWithFailover('/json/stats');
  setCache(key, data);
  return data;
}

export async function fetchCountries() {
  const key = 'countries';
  const cached = getCache(key);
  if (cached) return cached;

  const raw = await fetchJsonWithFailover(
    '/json/countries?hidebroken=true&order=stationcount&reverse=true'
  );
  // Aggregate duplicates by ISO 3166-1 code
  const byCode = new Map();
  for (const c of Array.isArray(raw) ? raw : []) {
    const code = (c.iso_3166_1 || '').toUpperCase().trim();
    if (!code || code.length !== 2 || !c.stationcount) continue;
    const prev = byCode.get(code);
    if (prev) {
      prev.stationcount += Number(c.stationcount) || 0;
    } else {
      byCode.set(code, {
        code,
        name: c.name || code,
        stationcount: Number(c.stationcount) || 0,
      });
    }
  }
  const result = [...byCode.values()].sort((a, b) => b.stationcount - a.stationcount);
  setCache(key, result);
  return result;
}

function isPlayableStreamUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  // Filter out non-playable playlist descriptor files (keep .m3u8 because hls.js plays it!)
  if (lower.endsWith('.pls') || lower.endsWith('.m3u') || lower.endsWith('.asx') || lower.endsWith('.xspf')) {
    return false;
  }
  return true;
}

export async function searchStations({
  countrycode = '',
  tag = '',
  name = '',
  order = 'votes',
  offset = 0,
  limit = 36,
  httpsOnly = true,
  signal = null,
} = {}) {
  // Fetch slightly more raw entries so HTTPS filtering & deduplication still yield a full page
  const fetchLimit = httpsOnly ? Math.min(limit * 3, 120) : Math.min(limit * 2, 100);

  const params = new URLSearchParams({
    hidebroken: 'true',
    order: order || 'votes',
    reverse: 'true',
    offset: String(offset),
    limit: String(fetchLimit),
  });

  if (countrycode) params.set('countrycode', countrycode.toUpperCase());
  if (tag) params.set('tag', tag.toLowerCase().trim());
  if (name) params.set('name', name.trim());

  const cacheKey = `search:${params.toString()}:https=${httpsOnly}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const raw = await fetchJsonWithFailover(`/json/stations/search?${params.toString()}`, signal);
  const seenUrls = new Set();
  const seenNames = new Set();
  const cleaned = [];

  for (const item of Array.isArray(raw) ? raw : []) {
    const s = sanitizeStation(item);
    if (!isPlayableStreamUrl(s.url_resolved)) continue;
    if (httpsOnly && !s.isHttps) continue;

    const normUrl = s.url_resolved.replace(/\/+$/, '').toLowerCase();
    const normNameKey = `${s.countrycode}:${s.name.toLowerCase()}`;
    if (seenUrls.has(normUrl) || seenNames.has(normNameKey)) continue;

    seenUrls.add(normUrl);
    seenNames.add(normNameKey);
    cleaned.push(s);
    if (cleaned.length >= limit) break;
  }

  const result = {
    stations: cleaned,
    rawCount: Array.isArray(raw) ? raw.length : 0,
    hasMore: Array.isArray(raw) && raw.length >= fetchLimit,
    nextOffset: offset + fetchLimit,
  };

  setCache(cacheKey, result);
  return result;
}

export async function fetchRandomStation({ countrycode = '', tag = '', httpsOnly = true } = {}) {
  const randomOffset = Math.floor(Math.random() * 80);
  let res = await searchStations({
    countrycode,
    tag,
    order: 'clickcount',
    offset: randomOffset,
    limit: 20,
    httpsOnly,
  });

  if (res.stations.length === 0) {
    res = await searchStations({
      countrycode,
      tag,
      order: 'votes',
      offset: 0,
      limit: 25,
      httpsOnly,
    });
  }

  if (res.stations.length === 0) return null;
  const pick = res.stations[Math.floor(Math.random() * res.stations.length)];
  return pick;
}

export function reportStationClick(stationuuid) {
  if (!stationuuid) return;
  const base = activeMirrors[preferredMirrorIdx] || DEFAULT_MIRRORS[0];
  try {
    fetch(`${base}/json/url/${encodeURIComponent(stationuuid)}`, {
      method: 'GET',
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Non-critical telemetry
  }
}
