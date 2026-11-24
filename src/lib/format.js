export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return 'not set';
  }
  return bbox.map((value) => Number(value).toFixed(3)).join(', ') + '  (W,S,E,N)';
}

export function areaKm2(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return 0;
  }
  const [west, south, east, north] = bbox.map(Number);
  const middleLatitude = (south + north) / 2;
  const height = (north - south) * 111.32;
  const width = (east - west) * 111.32 * Math.cos((middleLatitude * Math.PI) / 180);
  return Math.max(0, height * width);
}

export function formatKm2(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  if (value >= 1000) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' km2';
  }
  return value.toFixed(1) + ' km2';
}

export function daysBetween(a, b) {
  const start = Date.parse(a);
  const end = Date.parse(b);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return Math.round((end - start) / 86400000);
}

export function signed(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  const rounded = Number(value.toFixed(digits));
  return (rounded > 0 ? '+' : '') + rounded.toFixed(digits);
}

export function shortDate(value) {
  if (!value) {
    return '-';
  }
  const date = String(value).slice(0, 10);
  return date;
}

export function hasNonLatin(value) {
  return /[^\x09\x0A\x0D\x20-\x7E]/.test(String(value === null || value === undefined ? '' : value));
}

export function englishText(value, fallback = '') {
  const stripped = String(value === null || value === undefined ? '' : value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\([^A-Za-z0-9)]*\)/g, ' ')
    .replace(/\s+/g, ' ');
  const parts = stripped.split(',').map((part) => part.trim()).filter(Boolean);
  const text = parts.join(', ');
  return text || fallback;
}
