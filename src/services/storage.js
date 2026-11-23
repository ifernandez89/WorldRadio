const KEYS = {
  FAVORITES: 'worldradio_favorites_v1',
  RECENT: 'worldradio_recent_v1',
  PREFS: 'worldradio_prefs_v1',
};

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors on private browsing
  }
}

export function sanitizeStation(station) {
  return {
    stationuuid: station.stationuuid,
    name: (station.name || 'Emisora sin nombre').trim(),
    url_resolved: station.url_resolved || station.url || '',
    url: station.url || '',
    homepage: station.homepage || '',
    favicon: station.favicon || '',
    tags: station.tags || '',
    country: station.country || '',
    countrycode: (station.countrycode || '').toUpperCase(),
    state: station.state || '',
    language: station.language || '',
    codec: (station.codec || '').toUpperCase(),
    bitrate: Number(station.bitrate) || 0,
    votes: Number(station.votes) || 0,
    hls: Number(station.hls) || 0,
    isHttps: (station.url_resolved || station.url || '').startsWith('https://'),
  };
}

export function getFavorites() {
  const list = safeRead(KEYS.FAVORITES, []);
  return Array.isArray(list) ? list : [];
}

export function isFavorite(stationuuid) {
  if (!stationuuid) return false;
  return getFavorites().some((s) => s.stationuuid === stationuuid);
}

export function toggleFavorite(station) {
  const clean = sanitizeStation(station);
  const list = getFavorites();
  const idx = list.findIndex((s) => s.stationuuid === clean.stationuuid);
  let added = false;
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift({ ...clean, savedAt: Date.now() });
    added = true;
  }
  safeWrite(KEYS.FAVORITES, list);
  return { added, favorites: list };
}

export function replaceFavorites(stations) {
  const valid = (Array.isArray(stations) ? stations : [])
    .filter((s) => s && s.stationuuid && (s.url_resolved || s.url))
    .map(sanitizeStation);
  safeWrite(KEYS.FAVORITES, valid);
  return valid;
}

export function getRecent() {
  const list = safeRead(KEYS.RECENT, []);
  return Array.isArray(list) ? list : [];
}

export function pushRecent(station) {
  const clean = sanitizeStation(station);
  const list = getRecent().filter((s) => s.stationuuid !== clean.stationuuid);
  list.unshift({ ...clean, playedAt: Date.now() });
  const trimmed = list.slice(0, 24);
  safeWrite(KEYS.RECENT, trimmed);
  return trimmed;
}

export function clearRecent() {
  safeWrite(KEYS.RECENT, []);
}

export function getPrefs() {
  const isPageHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  return {
    volume: 0.85,
    httpsOnly: isPageHttps,
    ...safeRead(KEYS.PREFS, {}),
  };
}

export function savePrefs(partial) {
  const next = { ...getPrefs(), ...partial };
  safeWrite(KEYS.PREFS, next);
  return next;
}
