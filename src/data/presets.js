export const FEATURED_COUNTRIES = [
  { code: '', name: 'Todo el mundo', flag: '🌐', region: 'GLOBAL' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', region: 'LATAM' },
  { code: 'DE', name: 'Alemania', flag: '🇩🇪', region: 'EU' },
  { code: 'GB', name: 'Reino Unido', flag: '🇬🇧', region: 'EU' },
  { code: 'JP', name: 'Japón', flag: '🇯🇵', region: 'ASIA' },
  { code: 'JM', name: 'Jamaica', flag: '🇯🇲', region: 'CARIBE' },
  { code: 'US', name: 'EE. UU.', flag: '🇺🇸', region: 'NA' },
  { code: 'FR', name: 'Francia', flag: '🇫🇷', region: 'EU' },
  { code: 'ES', name: 'España', flag: '🇪🇸', region: 'EU' },
  { code: 'NL', name: 'Países Bajos', flag: '🇳🇱', region: 'EU' },
  { code: 'BR', name: 'Brasil', flag: '🇧🇷', region: 'LATAM' },
  { code: 'IT', name: 'Italia', flag: '🇮🇹', region: 'EU' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', region: 'LATAM' },
  { code: 'MX', name: 'México', flag: '🇲🇽', region: 'LATAM' },
];

export const GENRE_PRESETS = [
  { id: '', label: 'Destacadas', tag: '', accent: 'amber' },
  { id: 'techno', label: 'Techno', tag: 'techno', accent: 'amber' },
  { id: 'house', label: 'House', tag: 'house', accent: 'amber' },
  { id: 'reggae', label: 'Reggae', tag: 'reggae', accent: 'mint' },
  { id: 'rock80s', label: 'Rock 80s', tag: '80s', accent: 'amber' },
  { id: 'jazz', label: 'Jazz', tag: 'jazz', accent: 'mint' },
  { id: 'lofi', label: 'Lo-Fi', tag: 'lofi', accent: 'mint' },
  { id: 'news', label: 'Noticias', tag: 'news', accent: 'amber' },
  { id: 'electronic', label: 'Electrónica', tag: 'electronic', accent: 'amber' },
  { id: 'rock', label: 'Rock', tag: 'rock', accent: 'amber' },
  { id: 'dnb', label: 'Drum & Bass', tag: 'drum and bass', accent: 'amber' },
  { id: 'ambient', label: 'Ambient', tag: 'ambient', accent: 'mint' },
  { id: 'classical', label: 'Clásica', tag: 'classical', accent: 'mint' },
  { id: 'metal', label: 'Metal', tag: 'metal', accent: 'amber' },
];

export const COUNTRY_NAMES_ES = {
  AR: 'Argentina',
  DE: 'Alemania',
  GB: 'Reino Unido',
  UK: 'Reino Unido',
  JP: 'Japón',
  JM: 'Jamaica',
  US: 'Estados Unidos',
  FR: 'Francia',
  ES: 'España',
  NL: 'Países Bajos',
  BR: 'Brasil',
  IT: 'Italia',
  CO: 'Colombia',
  MX: 'México',
  CL: 'Chile',
  UY: 'Uruguay',
  PE: 'Perú',
  CA: 'Canadá',
  AU: 'Australia',
  CH: 'Suiza',
  BE: 'Bélgica',
  SE: 'Suecia',
  NO: 'Noruega',
  PL: 'Polonia',
  PT: 'Portugal',
  AT: 'Austria',
  IE: 'Irlanda',
  GR: 'Grecia',
  KR: 'Corea del Sur',
  RU: 'Rusia',
  UA: 'Ucrania',
  IN: 'India',
  ZA: 'Sudáfrica',
};

export function countryCodeToFlag(code) {
  if (!code || code.length !== 2) return '📡';
  const upper = code.toUpperCase();
  const points = [...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  try {
    return String.fromCodePoint(...points);
  } catch {
    return '📡';
  }
}

export function getCountryLabel(code, fallbackName = '') {
  if (!code) return fallbackName || 'Internacional';
  const upper = code.toUpperCase();
  return COUNTRY_NAMES_ES[upper] || fallbackName || upper;
}

/**
 * Deterministic shortwave frequency display (e.g., "14.285 MHz" or "99.9 FM")
 * derived from station UUID so every station has a memorable position on the analog dial.
 */
export function stationDialMetrics(station) {
  const seedStr = station?.stationuuid || station?.name || 'worldradio';
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const norm = (hash >>> 0) / 4294967295; // 0..1
  // FM band 87.5 - 108.0 MHz or SW 3.20 - 26.10 MHz
  const freq = (87.5 + norm * 20.5).toFixed(1);
  const percent = 8 + norm * 84; // keep needle comfortably inside 8%..92%
  return { freq, unit: 'MHz', percent };
}
