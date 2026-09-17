// Queries OpenStreetMap's Overpass API for real land-use/land-cover context around a
// thermal detection - the actual "OSM" data source named in the problem statement,
// used to distinguish industrial/mining land from forest/farmland rather than relying
// on facility-distance heuristics alone.
//
// Overpass is a shared public service with a strict fair-use policy, so every call here
// is cached (in-memory, ~1.1km grid) and globally throttled to roughly one request per
// 1.5s. Callers must never fire lookups in a tight per-detection loop.

export type OsmLanduseCategory =
  | 'industrial'
  | 'mining'
  | 'forest'
  | 'farmland'
  | 'residential'
  | 'unknown';

interface CacheEntry {
  category: OsmLanduseCategory;
  expiresAt: number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // land use rarely changes; cache a week
const cache = new Map<string, CacheEntry>();

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const MIN_REQUEST_GAP_MS = 1500;
let lastRequestAt = 0;
let queueTail: Promise<void> = Promise.resolve();

function gridKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function classifyTags(tags: Record<string, string>): OsmLanduseCategory | null {
  const landuse = tags.landuse;
  const natural = tags.natural;
  const manMade = tags.man_made;

  if (manMade === 'works' || manMade === 'refinery' || manMade === 'mineshaft') return 'industrial';
  if (landuse === 'industrial' || landuse === 'garages' || landuse === 'port') return 'industrial';
  if (landuse === 'quarry' || tags.industrial === 'mine' || manMade === 'adit') return 'mining';
  if (landuse === 'forest' || natural === 'wood' || natural === 'scrub' || natural === 'grassland') return 'forest';
  if (landuse === 'farmland' || landuse === 'farmyard' || landuse === 'orchard' || landuse === 'meadow') return 'farmland';
  if (landuse === 'residential' || landuse === 'commercial' || landuse === 'retail') return 'residential';
  return null;
}

async function runThrottled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const wait = Math.max(0, MIN_REQUEST_GAP_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  queueTail = run.catch(() => {});
  await run;
  return fn();
}

// Looks up the OSM land-use category nearest a coordinate. Returns 'unknown' on any
// cache miss combined with a network/API failure - callers should treat 'unknown' as
// "no OSM signal, fall back to the facility-distance heuristic", never as an error.
export async function getOsmLanduse(lat: number, lon: number): Promise<OsmLanduseCategory> {
  const key = gridKey(lat, lon);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.category;
  }

  try {
    const category = await runThrottled(async () => {
      const query = `[out:json][timeout:10];(way(around:400,${lat},${lon})[landuse];way(around:400,${lat},${lon})[natural];way(around:400,${lat},${lon})[man_made];relation(around:400,${lat},${lon})[landuse];);out tags 5;`;

      const res = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'PyroGuard-Industrial-Fire-Monitor/2.0 (thermal source land-use classification)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) return 'unknown' as OsmLanduseCategory;

      const json = await res.json();
      const elements: Array<{ tags?: Record<string, string> }> = json.elements || [];

      for (const el of elements) {
        if (!el.tags) continue;
        const classified = classifyTags(el.tags);
        if (classified) return classified;
      }
      return 'unknown' as OsmLanduseCategory;
    });

    cache.set(key, { category, expiresAt: Date.now() + CACHE_TTL_MS });
    return category;
  } catch (err) {
    // Network hiccup or Overpass rate-limit - don't cache failures, just fall back.
    return 'unknown';
  }
}
