import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ThermalAnomaly } from '../types';
import { classifyFireType, refineFireTypeWithOsm, facilityKindFromType } from './gisCalculations';
import { getOsmLanduse } from './osmLanduseService';
import { classifyWithML } from '../ml/predict';
import type { OsmCategory } from '../ml/predict';

function toGridCell(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const isPlaceholder = (v: string) => !v || v.startsWith('MY_');

let client: SupabaseClient | null = null;

if (!isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_SERVICE_ROLE_KEY)) {
  client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
} else {
  console.warn('[Supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set - fire detections will not be persisted.');
}

export function isSupabaseConfigured(): boolean {
  return client !== null;
}

// Maps a live ThermalAnomaly (with resolved nearestFacility threat context) to a fire_detections row.
function toRow(anomaly: ThermalAnomaly) {
  const nf = anomaly.nearestFacility;
  const fac = nf?.facility;

  return {
    detection_id: anomaly.id,
    fire_type: classifyFireType(nf?.distanceKm ?? 999, anomaly.frp, fac),
    grid_cell: toGridCell(anomaly.latitude, anomaly.longitude),
    satellite: anomaly.satellite,
    confidence: anomaly.confidence,
    acq_date: anomaly.acq_date,
    acq_time: anomaly.acq_time,
    daynight: anomaly.daynight,

    latitude: anomaly.latitude,
    longitude: anomaly.longitude,
    brightness_k: anomaly.brightness,
    bright_t31_k: anomaly.bright_t31 ?? null,
    frp_mw: anomaly.frp,

    wind_speed_kmh: anomaly.windSpeedKmh,
    wind_direction_deg: anomaly.windDirectionDeg,
    wind_spread_risk: nf?.windSpreadRisk ?? null,

    facility_id: fac?.id ?? null,
    facility_name: fac?.name ?? null,
    facility_type: fac?.type ?? null,
    facility_country: fac?.country ?? null,
    facility_region: fac?.region ?? null,
    hazard_level: fac?.hazardLevel ?? null,
    primary_chemicals: fac?.primaryChemicals ?? null,
    blast_radius_km: fac?.blastRadiusKm ?? null,
    toxic_plume_radius_km: fac?.toxicPlumeRadiusKm ?? null,

    distance_km: nf?.distanceKm ?? null,
    threat_score: nf?.threatScore ?? null,
    threat_level: nf?.threatLevel ?? null,
    time_to_impact_hours: nf?.timeToImpactHours ?? null,
  };
}

// Upserts thermal anomalies into Supabase. De-duped on (lat, lon, acq_date, acq_time, satellite)
// so repeated 15s polls of the same underlying satellite pass don't create unbounded duplicate rows.
// Failures are logged only - this must never interrupt the live FIRMS refresh cycle.
export async function persistAnomaliesToSupabase(anomalies: ThermalAnomaly[]): Promise<void> {
  if (!client || anomalies.length === 0) return;

  try {
    // Overlapping NASA FIRMS bounding-box regions can yield the same underlying
    // detection twice in one batch; Postgres upsert can't touch the same
    // conflict target row twice in a single statement, so de-dupe first.
    const dedupedByKey = new Map<string, ReturnType<typeof toRow>>();
    for (const anomaly of anomalies) {
      const row = toRow(anomaly);
      const key = `${row.latitude}|${row.longitude}|${row.acq_date}|${row.acq_time}|${row.satellite}`;
      dedupedByKey.set(key, row);
    }
    const rows = Array.from(dedupedByKey.values());

    const { error } = await client
      .from('fire_detections')
      .upsert(rows, { onConflict: 'latitude,longitude,acq_date,acq_time,satellite' });

    if (error) {
      console.error('[Supabase] Failed to persist fire detections:', error.message);
    } else {
      console.log(`[Supabase] Synced ${rows.length} fire detections.`);
    }
  } catch (err: any) {
    console.error('[Supabase] Unexpected error persisting fire detections:', err.message);
  }
}

// Reads back the most recently recorded fire detections for the history panel.
export async function fetchStoredFireDetections(limit: number = 100): Promise<{ data: any[]; error: string | null }> {
  if (!client) return { data: [], error: 'Supabase is not configured.' };

  const { data, error } = await client
    .from('fire_detections')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], error: error.message };
  }
  return { data: data || [], error: null };
}

// Refines a small, throttled batch of ambiguous (WILDFIRE/UNCLASSIFIED) detections per
// cycle using real OSM land-use data. Deliberately bounded to respect Overpass API
// fair-use limits - this runs alongside the 15s FIRMS refresh, not once per detection.
export async function enrichPendingDetectionsWithOsmLanduse(batchSize: number = 6): Promise<void> {
  if (!client) return;

  try {
    const { data, error } = await client
      .from('fire_detections')
      .select('id, latitude, longitude, fire_type, facility_type, distance_km, frp_mw, daynight')
      .in('fire_type', ['WILDFIRE', 'UNCLASSIFIED'])
      .is('osm_landuse', null)
      .order('recorded_at', { ascending: false })
      .limit(batchSize);

    if (error || !data || data.length === 0) return;

    for (const row of data) {
      const osmCategory = await getOsmLanduse(row.latitude, row.longitude);

      // Re-classify with the gradient-boosted model now that OSM land-use is known -
      // a richer feature set than the plain switch-statement heuristic. Only trust it
      // above a confidence floor; below that, fall back to the original rule so a shaky
      // prediction never overrides a reasonable heuristic guess.
      const ml = classifyWithML({
        distanceKm: row.distance_km ?? 999,
        frpMW: row.frp_mw ?? 0,
        isNight: row.daynight === 'N',
        facilityKind: facilityKindFromType(row.facility_type),
        osmCategory: osmCategory as OsmCategory,
      });
      const refinedType = ml.confidence >= 0.5 ? ml.type : refineFireTypeWithOsm(row.fire_type, osmCategory);

      await client
        .from('fire_detections')
        .update({ osm_landuse: osmCategory, fire_type: refinedType })
        .eq('id', row.id);
    }

    console.log(`[ML] Refined ${data.length} thermal detections via OSM + gradient-boosted classifier.`);
  } catch (err: any) {
    console.error('[OSM] Unexpected error enriching detections:', err.message);
  }
}

// Aggregates stored detections by ~1.1km grid cell to surface locations that recur
// across multiple distinct satellite acquisition dates - "persistent thermal sources"
// (e.g. gas flares, coal seam fires, cement kilns) as distinct from one-off wildfires.
export async function fetchPersistentThermalSources(
  windowDays: number = 30,
  minDistinctDays: number = 3
): Promise<{ data: any[]; error: string | null }> {
  if (!client) return { data: [], error: 'Supabase is not configured.' };

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // Ascending order so the last row processed per cell is chronologically the latest -
  // needed to tell "this cell's baseline FRP" apart from "today's FRP" below.
  const { data, error } = await client
    .from('fire_detections')
    .select('grid_cell, acq_date, latitude, longitude, facility_name, facility_type, fire_type, osm_landuse, frp_mw, distance_km, threat_level, recorded_at')
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  const byCell = new Map<string, {
    gridCell: string; latitude: number; longitude: number; facilityName: string | null;
    facilityType: string | null; fireType: string; osmLanduse: string | null; distanceKm: number | null;
    distinctDates: Set<string>; frpHistory: number[]; worstThreatLevel: string | null;
    lastSeen: string; firstSeen: string; detectionCount: number;
  }>();

  const threatRank: Record<string, number> = { CRITICAL: 4, HIGH: 3, ELEVATED: 2, WATCH: 1 };

  for (const row of data || []) {
    let entry = byCell.get(row.grid_cell);
    if (!entry) {
      entry = {
        gridCell: row.grid_cell, latitude: row.latitude, longitude: row.longitude,
        facilityName: row.facility_name, facilityType: row.facility_type, fireType: row.fire_type,
        osmLanduse: row.osm_landuse, distanceKm: row.distance_km, distinctDates: new Set(),
        frpHistory: [], worstThreatLevel: null, lastSeen: row.recorded_at, firstSeen: row.recorded_at,
        detectionCount: 0,
      };
      byCell.set(row.grid_cell, entry);
    }
    entry.distinctDates.add(row.acq_date);
    entry.detectionCount += 1;
    entry.frpHistory.push(row.frp_mw || 0);
    // Rows arrive oldest-first, so the last write here reflects the most recent detection.
    entry.fireType = row.fire_type;
    entry.osmLanduse = row.osm_landuse ?? entry.osmLanduse;
    entry.distanceKm = row.distance_km ?? entry.distanceKm;
    if (row.recorded_at > entry.lastSeen) entry.lastSeen = row.recorded_at;
    if (row.recorded_at < entry.firstSeen) entry.firstSeen = row.recorded_at;
    if (row.threat_level && (!entry.worstThreatLevel || threatRank[row.threat_level] > threatRank[entry.worstThreatLevel])) {
      entry.worstThreatLevel = row.threat_level;
    }
  }

  const persistent = Array.from(byCell.values())
    .filter((e) => e.distinctDates.size >= minDistinctDays)
    .map((e) => {
      const anomaly = computeFrpAnomaly(e.frpHistory);
      const ml = classifyWithML({
        distanceKm: e.distanceKm ?? 999,
        frpMW: anomaly.latestFrpMw,
        isNight: false,
        facilityKind: facilityKindFromType(e.facilityType),
        osmCategory: (e.osmLanduse as OsmCategory) ?? 'unknown',
        persistenceDays: e.distinctDates.size,
        frpZScore: anomaly.zScore,
      });

      return {
        gridCell: e.gridCell,
        latitude: e.latitude,
        longitude: e.longitude,
        facilityName: e.facilityName,
        fireType: e.fireType,
        distinctDaysObserved: e.distinctDates.size,
        detectionCount: e.detectionCount,
        maxFrpMw: Number(Math.max(...e.frpHistory).toFixed(1)),
        worstThreatLevel: e.worstThreatLevel,
        firstSeen: e.firstSeen,
        lastSeen: e.lastSeen,
        // Flags a source whose latest FRP is a statistical spike vs. its own history -
        // the "radiative power surge" signature of an active fire/explosion breaking out
        // at a facility that otherwise runs a steady, routine thermal signature.
        frpAnomaly: anomaly.isAnomaly,
        frpZScore: anomaly.zScore,
        frpBaselineMw: anomaly.baselineMeanMw,
        mlFireType: ml.type,
        mlConfidence: ml.confidence,
      };
    })
    .sort((a, b) => (Number(b.frpAnomaly) - Number(a.frpAnomaly)) || (b.distinctDaysObserved - a.distinctDaysObserved));

  return { data: persistent, error: null };
}

// Compares a persistent source's latest FRP reading against the mean/std of its own prior
// history (Gaussian z-score). A source that has run at a steady FRP for weeks and then
// spikes hard is the "radiative power surge" signature the problem statement calls out -
// distinct from a routine, steady-state industrial heat source.
function computeFrpAnomaly(frpHistory: number[]): {
  zScore: number; isAnomaly: boolean; baselineMeanMw: number; latestFrpMw: number;
} {
  const latestFrpMw = frpHistory[frpHistory.length - 1] ?? 0;
  if (frpHistory.length < 6) {
    return { zScore: 0, isAnomaly: false, baselineMeanMw: latestFrpMw, latestFrpMw };
  }
  const baseline = frpHistory.slice(0, -1);
  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  const variance = baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length;
  const std = Math.sqrt(variance) || 1;
  const zScore = (latestFrpMw - mean) / std;
  return {
    zScore: Number(zScore.toFixed(2)),
    isAnomaly: zScore >= 2.5 && latestFrpMw > mean * 1.4,
    baselineMeanMw: Number(mean.toFixed(1)),
    latestFrpMw,
  };
}

// Reads back citizen-submitted fire sightings for the Incident History "Citizen Reports" tab.
export async function fetchCitizenReports(limit: number = 100): Promise<{ data: any[]; error: string | null }> {
  if (!client) return { data: [], error: 'Supabase is not configured.' };

  const { data, error } = await client
    .from('citizen_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], error: error.message };
  }
  return { data: data || [], error: null };
}

const CITIZEN_PHOTO_BUCKET = 'citizen-reports-photos';

interface CitizenReportSubmission {
  description: string;
  latitude: number;
  longitude: number;
  landmark?: string;
  reporterName?: string;
  photoDataUrl: string; // "data:image/jpeg;base64,...."
}

// Uploads a citizen's ground-truth fire sighting - description, pinned location, and a
// required verification photo - into Supabase. The photo goes to public Storage; the row
// (with its public photo URL) lands in citizen_reports for the Incident History tab.
export async function submitCitizenReport(
  submission: CitizenReportSubmission
): Promise<{ data: any | null; error: string | null }> {
  if (!client) return { data: null, error: 'Supabase is not configured.' };

  const match = submission.photoDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return { data: null, error: 'Invalid photo data - expected a base64 image data URL.' };
  }
  const [, contentType, base64Payload] = match;
  const extension = contentType.split('/')[1] || 'jpg';
  const photoBuffer = Buffer.from(base64Payload, 'base64');

  if (photoBuffer.length > 8 * 1024 * 1024) {
    return { data: null, error: 'Photo is too large (max 8MB).' };
  }

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  const { error: uploadError } = await client.storage
    .from(CITIZEN_PHOTO_BUCKET)
    .upload(fileName, photoBuffer, { contentType });

  if (uploadError) {
    return { data: null, error: `Photo upload failed: ${uploadError.message}` };
  }

  const { data: publicUrlData } = client.storage.from(CITIZEN_PHOTO_BUCKET).getPublicUrl(fileName);

  const { data, error } = await client
    .from('citizen_reports')
    .insert({
      description: submission.description,
      latitude: submission.latitude,
      longitude: submission.longitude,
      landmark: submission.landmark || null,
      reporter_name: submission.reporterName || null,
      photo_url: publicUrlData.publicUrl,
      status: 'PENDING',
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data, error: null };
}
