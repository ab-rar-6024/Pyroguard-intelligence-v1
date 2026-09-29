// Real wind from Open-Meteo (https://open-meteo.com), used for the downwind-risk and threat
// calculations. Free for non-commercial use (CC BY 4.0 - the credit is shown in the app).
//
// Deliberately small and self-contained: nothing else in the app talks to the weather API.
// Wind is looked up per ~28 km grid cell (0.25 degrees) and cached for an hour, so a normal 15 s
// refresh cycle makes zero weather calls, and a cold start makes only a handful of batched ones -
// far below the free tier's 10,000 calls/day.

export interface WindReading {
  speedKmh: number;
  /** Meteorological convention: the direction the wind is blowing FROM, in degrees. */
  directionDeg: number;
  gustKmh: number | null;
  fetchedAt: number;
}

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CELL_DEG = 0.25;
const FRESH_MS = 60 * 60 * 1000; // re-fetch a cell after 1 hour
const STALE_OK_MS = 6 * 60 * 60 * 1000; // if a refresh fails, keep using a reading up to 6 hours old
const LOCATIONS_PER_CALL = 40;

// Free-tier guard: Open-Meteo allows 10,000 calls/day and counts every location in a batch as a
// call. Stay well below it, so the free quota can never be exceeded whatever the feed does.
const DAILY_LOCATION_BUDGET = 6000;
const DAY_MS = 24 * 60 * 60 * 1000;
const callLog: number[] = []; // one timestamp per location requested

function remainingBudget(now: number): number {
  while (callLog.length > 0 && now - callLog[0] > DAY_MS) callLog.shift();
  return DAILY_LOCATION_BUDGET - callLog.length;
}

const cache = new Map<string, WindReading>();
let lastFetchAt: number | null = null;
let lastFetchedCells = 0;
let lastError: string | null = null;

function snap(value: number): number {
  return Math.round(value / CELL_DEG) * CELL_DEG;
}

function keyFor(lat: number, lon: number): string {
  return `${snap(lat).toFixed(2)},${snap(lon).toFixed(2)}`;
}

async function fetchCells(keys: string[]): Promise<void> {
  const lats = keys.map((k) => k.split(',')[0]).join(',');
  const lons = keys.map((k) => k.split(',')[1]).join(',');
  const url =
    `${ENDPOINT}?latitude=${lats}&longitude=${lons}` +
    '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kmh';

  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Open-Meteo responded with status ${res.status}`);

  const json = await res.json();
  // One location returns an object, several return an array (same order as requested).
  const items: any[] = Array.isArray(json) ? json : [json];
  items.forEach((item, i) => {
    const c = item?.current;
    if (!c || typeof c.wind_speed_10m !== 'number' || typeof c.wind_direction_10m !== 'number') return;
    cache.set(keys[i], {
      speedKmh: c.wind_speed_10m,
      directionDeg: c.wind_direction_10m,
      gustKmh: typeof c.wind_gusts_10m === 'number' ? c.wind_gusts_10m : null,
      fetchedAt: Date.now(),
    });
  });
}

/** Makes sure real wind is cached for every point (only cells that are missing or older than 1 h are fetched). */
export async function prefetchWind(points: { lat: number; lon: number }[]): Promise<void> {
  const now = Date.now();
  const missing = new Set<string>();
  for (const p of points) {
    const key = keyFor(p.lat, p.lon);
    const hit = cache.get(key);
    if (!hit || now - hit.fetchedAt > FRESH_MS) missing.add(key);
  }
  if (missing.size === 0) return;

  const room = remainingBudget(now);
  if (room <= 0) {
    lastError = 'Daily weather-call budget reached; using cached wind only';
    console.warn('[Wind] ' + lastError);
    return;
  }
  const keys = Array.from(missing).slice(0, room);
  for (let i = 0; i < keys.length; i++) callLog.push(now);
  const batches: string[][] = [];
  for (let i = 0; i < keys.length; i += LOCATIONS_PER_CALL) batches.push(keys.slice(i, i + LOCATIONS_PER_CALL));

  const results = await Promise.allSettled(batches.map(fetchCells));
  const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');

  lastFetchAt = Date.now();
  lastFetchedCells = keys.length;
  lastError = failure ? String(failure.reason?.message || failure.reason) : null;
  if (failure) console.warn('[Wind] Open-Meteo lookup failed:', lastError);
}

/** Real wind for a point from the cache, or null if none is available (never an invented value). */
export function getWind(lat: number, lon: number): WindReading | null {
  const hit = cache.get(keyFor(lat, lon));
  return hit && Date.now() - hit.fetchedAt <= STALE_OK_MS ? hit : null;
}

export function getWindStatus() {
  return {
    provider: 'Open-Meteo',
    cachedCells: cache.size,
    callsLast24h: (remainingBudget(Date.now()), callLog.length),
    dailyBudget: DAILY_LOCATION_BUDGET,
    lastFetchAt: lastFetchAt ? new Date(lastFetchAt).toISOString() : null,
    lastFetchedCells,
    lastError,
  };
}
