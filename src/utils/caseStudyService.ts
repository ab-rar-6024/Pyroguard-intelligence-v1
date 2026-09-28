// Real-incident case studies: pulls ARCHIVED NASA FIRMS detections for a documented event and
// runs them through the same classification pipeline the live dashboard uses (nearest facility,
// OpenStreetMap land use, trained classifier). Nothing about the outcome is hard-coded - the
// verdict is whatever the pipeline decides, and we report honestly whether it agrees with the
// documented type of event.
import { GLOBAL_INDUSTRIAL_FACILITIES } from '../data/industrialDatabase';
import { calculateDistanceKm, classifyFireType, refineFireTypeWithOsm, facilityKindFromType, FireType } from './gisCalculations';
import { getOsmLanduse, isOsmTemporarilyDown, OsmLanduseCategory } from './osmLanduseService';
import { CASE_STUDY_LANDUSE_SNAPSHOTS } from '../data/caseStudyLanduseSnapshots';
import { classifyWithML } from '../ml/predict';
import { getNasaFirmsKey } from './nasaFirmsService';
import { explainClassification, INDUSTRIAL_FIRE_TYPES } from './explainClassification';

export interface CaseStudyDef {
  id: string;
  title: string;
  location: string;
  kind: 'industrial-fire' | 'wildfire' | 'persistent-source';
  /** Plain, neutral description of the documented event. */
  summary: string;
  center: [number, number]; // lat, lon
  bbox: [number, number, number, number]; // west, south, east, north
  sources: string[]; // FIRMS data sets
  startDate: string; // YYYY-MM-DD
  days: number; // FIRMS allows at most 5 per request
  /** The documented type of event, used only to report agreement/disagreement. */
  expectedClass: 'industrial' | 'natural';
}

export const CASE_STUDIES: CaseStudyDef[] = [
  {
    id: 'itc-deer-park-2019',
    title: 'ITC Deer Park tank fire',
    location: 'Deer Park, Houston Ship Channel, Texas, USA',
    kind: 'industrial-fire',
    summary: 'A fire at a petrochemical storage-tank terminal that burned for several days in March 2019.',
    center: [29.7147, -95.116],
    bbox: [-95.17, 29.66, -95.06, 29.77],
    sources: ['VIIRS_SNPP_SP'],
    startDate: '2019-03-17',
    days: 5,
    expectedClass: 'industrial',
  },
  {
    id: 'bootleg-fire-2021',
    title: 'Bootleg Fire',
    location: 'Fremont-Winema National Forest, Oregon, USA',
    kind: 'wildfire',
    summary: 'A very large forest wildfire in remote southern Oregon in July 2021.',
    center: [42.6, -121.3],
    bbox: [-121.7, 42.3, -120.9, 42.9],
    sources: ['VIIRS_SNPP_SP'],
    startDate: '2021-07-12',
    days: 5,
    expectedClass: 'natural',
  },
  {
    id: 'sabine-pass-lng',
    title: 'Sabine Pass LNG terminal (routine operations)',
    location: 'Cameron Parish, Louisiana, USA',
    kind: 'persistent-source',
    summary: 'An operating LNG export terminal. Continuous operations give small, repeated thermal signatures - the normal always-on industrial pattern, not an emergency.',
    center: [29.7579, -93.8713],
    bbox: [-93.9, 29.73, -93.84, 29.79],
    sources: ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT'],
    startDate: '2026-09-20',
    days: 5,
    expectedClass: 'industrial',
  },
];

export interface CaseDetection {
  lat: number;
  lon: number;
  frp: number;
  date: string;
  time: string;
  satellite: string;
}

export interface CaseStudyResult {
  def: CaseStudyDef;
  stats: {
    totalDetections: number;
    distinctDays: number;
    firstSeen: string;
    lastSeen: string;
    peakFrpMW: number;
    meanFrpMW: number;
    perDay: Record<string, number>;
  };
  focus: { latitude: number; longitude: number };
  nearestFacility: { name: string; type: string; distanceKm: number } | null;
  osmLanduse: OsmLanduseCategory;
  /** 'recorded' = the OpenStreetMap service was unreachable, so an earlier real answer was used. */
  landuseSource: 'live' | 'recorded';
  landuseRecordedAt?: string;
  fireType: FireType;
  isIndustrial: boolean;
  confidence: number | null;
  reasons: string[];
  agreesWithRecord: boolean;
  detections: CaseDetection[];
  sampled: boolean;
}

async function fetchArchive(def: CaseStudyDef): Promise<CaseDetection[]> {
  const key = getNasaFirmsKey();
  if (!key || key.length < 10) throw new Error('NASA FIRMS key is not configured.');
  const area = def.bbox.join(',');
  // The data sets are independent, so they are fetched in parallel.
  const fetchOne = async (source: string): Promise<CaseDetection[]> => {
    const all: CaseDetection[] = [];
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${source}/${area}/${def.days}/${def.startDate}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error(`NASA FIRMS returned status ${res.status} for ${source}`);
    const text = await res.text();
    const lines = text.trim().split('\n');
    const header = lines[0].split(',');
    const idx = (name: string) => header.indexOf(name);
    if (idx('latitude') === -1 || idx('acq_date') === -1) {
      throw new Error(`Unexpected NASA FIRMS response for ${source}: ${text.slice(0, 80)}`);
    }
    for (const line of lines.slice(1)) {
      if (!line) continue;
      const c = line.split(',');
      const t = String(c[idx('acq_time')]).padStart(4, '0');
      all.push({
        lat: Number(c[idx('latitude')]),
        lon: Number(c[idx('longitude')]),
        frp: Number(c[idx('frp')]) || 0,
        date: c[idx('acq_date')],
        time: `${t.slice(0, 2)}:${t.slice(2, 4)}Z`,
        satellite: idx('satellite') !== -1 ? c[idx('satellite')] : source,
      });
    }
    return all;
  };

  const perSource = await Promise.all(def.sources.map(fetchOne));
  return perSource.flat();
}

// Keeps the strongest detections plus an even spread of the rest, so a 5,000-point fire still
// draws quickly on a phone while its real peak is never dropped.
function sampleForMap(detections: CaseDetection[], max: number): CaseDetection[] {
  if (detections.length <= max) return detections;
  const sorted = [...detections].sort((a, b) => b.frp - a.frp);
  const keep = sorted.slice(0, 150);
  const rest = sorted.slice(150);
  const step = Math.ceil(rest.length / (max - keep.length));
  for (let i = 0; i < rest.length; i += step) keep.push(rest[i]);
  return keep;
}

// The land-use service already tries several Overpass mirrors and remembers a total outage, so
// one call is enough. 'unknown' means either "no land-use tag here" or "service unreachable".
async function lookupLanduseWithRetry(lat: number, lon: number): Promise<OsmLanduseCategory> {
  return getOsmLanduse(lat, lon);
}

async function computeCaseStudy(def: CaseStudyDef): Promise<CaseStudyResult> {
  const detections = await fetchArchive(def);
  if (detections.length === 0) {
    throw new Error('NASA returned no archived detections for this case.');
  }

  const perDay: Record<string, number> = {};
  let peak = detections[0];
  let frpSum = 0;
  for (const d of detections) {
    perDay[d.date] = (perDay[d.date] || 0) + 1;
    frpSum += d.frp;
    if (d.frp > peak.frp) peak = d;
  }
  const dates = Object.keys(perDay).sort();

  // Judge the event at its hottest point - the fire core - not a diluted average.
  const focus = { latitude: peak.lat, longitude: peak.lon };

  let nearest: { name: string; type: string; distanceKm: number } | null = null;
  let nearestFacility = GLOBAL_INDUSTRIAL_FACILITIES[0];
  let minKm = Infinity;
  for (const f of GLOBAL_INDUSTRIAL_FACILITIES) {
    const km = calculateDistanceKm(focus.latitude, focus.longitude, f.latitude, f.longitude);
    if (km < minKm) {
      minKm = km;
      nearestFacility = f;
    }
  }
  if (Number.isFinite(minKm)) {
    nearest = { name: nearestFacility.name, type: nearestFacility.type, distanceKm: Number(minKm.toFixed(2)) };
  }

  let osmLanduse = await lookupLanduseWithRetry(focus.latitude, focus.longitude);
  let landuseSource: 'live' | 'recorded' = 'live';
  let landuseRecordedAt: string | undefined;
  if (osmLanduse === 'unknown' && isOsmTemporarilyDown()) {
    // The land-use service is unreachable right now: fall back to a real earlier answer for
    // this exact spot, if one was recorded (and say so in the result).
    const snap = CASE_STUDY_LANDUSE_SNAPSHOTS[def.id];
    if (snap && snap.osmLanduse !== 'unknown') {
      osmLanduse = snap.osmLanduse;
      landuseSource = 'recorded';
      landuseRecordedAt = snap.recordedAt;
    }
  }

  const ruleType = refineFireTypeWithOsm(classifyFireType(minKm, peak.frp, nearestFacility), osmLanduse);
  const ml = classifyWithML({
    distanceKm: minKm,
    frpMW: peak.frp,
    isNight: false,
    facilityKind: facilityKindFromType(nearestFacility.type),
    osmCategory: osmLanduse,
    persistenceDays: dates.length,
    frpZScore: 0,
  });
  const usedMl = ml.confidence >= 0.5;
  const fireType: FireType = usedMl ? ml.type : ruleType;
  const isIndustrial = INDUSTRIAL_FIRE_TYPES.includes(fireType);

  const reasons = explainClassification({
    fireType,
    frpMW: peak.frp,
    distanceKm: nearest ? nearest.distanceKm : null,
    facilityName: nearest?.name,
    facilityType: nearest?.type,
    osmCategory: osmLanduse,
    persistenceDays: dates.length,
    confidence: usedMl ? ml.confidence : undefined,
  });

  const agreesWithRecord = def.expectedClass === 'industrial' ? isIndustrial : fireType === 'WILDFIRE';
  const sampled = detections.length > 600;

  return {
    def,
    stats: {
      totalDetections: detections.length,
      distinctDays: dates.length,
      firstSeen: dates[0],
      lastSeen: dates[dates.length - 1],
      peakFrpMW: Number(peak.frp.toFixed(1)),
      meanFrpMW: Number((frpSum / detections.length).toFixed(1)),
      perDay,
    },
    focus,
    nearestFacility: nearest,
    osmLanduse,
    landuseSource,
    landuseRecordedAt,
    fireType,
    isIndustrial,
    confidence: usedMl ? ml.confidence : null,
    reasons,
    agreesWithRecord,
    detections: sampleForMap(detections, 600),
    sampled,
  };
}

// Archived data never changes, so each case is computed once per server process.
const cache = new Map<string, Promise<CaseStudyResult>>();

export function getCaseStudy(id: string): Promise<CaseStudyResult> {
  const def = CASE_STUDIES.find((c) => c.id === id);
  if (!def) return Promise.reject(new Error('Unknown case study'));
  let cached = cache.get(id);
  if (!cached) {
    cached = computeCaseStudy(def);
    cache.set(id, cached);
    cached.catch(() => cache.delete(id)); // never cache a failure
    // A result that disagrees with the record only because the land-use service was down is
    // transient - don't keep it, so the next request tries again.
    cached.then((r) => {
      if (!r.agreesWithRecord && r.osmLanduse === 'unknown') cache.delete(id);
    }).catch(() => undefined);
  }
  return cached;
}
