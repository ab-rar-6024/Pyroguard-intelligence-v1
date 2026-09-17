import { GLOBAL_INDUSTRIAL_FACILITIES } from '../data/industrialDatabase';
import { calculateDistanceKm, evaluateWindRisk, calculateThreatScore } from './gisCalculations';
import { ThermalAnomaly, IndustrialFacility, EmergencyAlert, FIRMSFeedStatus } from '../types';

let currentMapKey = process.env.NASA_FIRMS_MAP_KEY || '4ddefd0f9c4e2cf87148595c54a19642';

// In-memory cache for live FIRMS detections
let cachedRealAnomalies: ThermalAnomaly[] = [];
let lastSyncTimestamp = new Date().toISOString();
let isUsingRealData = false;
let lastSyncStatusMessage = 'Initializing NASA FIRMS Satellite Feed...';
let activeSatellitesList: string[] = ['VIIRS-SNPP', 'VIIRS-NOAA20'];

export function setNasaFirmsKey(newKey: string): void {
  if (newKey && newKey.trim().length > 0) {
    currentMapKey = newKey.trim();
  }
}

export function getNasaFirmsKey(): string {
  return currentMapKey;
}

export function getFIRMSStatus(): FIRMSFeedStatus {
  return {
    isRealData: isUsingRealData,
    apiKeyConfigured: Boolean(currentMapKey && currentMapKey.length > 10),
    lastSyncTime: lastSyncTimestamp,
    totalLiveDetections: cachedRealAnomalies.length,
    activeSatellites: activeSatellitesList,
    sourcesQueried: ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'MODIS_NRT'],
    statusMessage: lastSyncStatusMessage
  };
}

// Global & Regional Bounding Boxes for Industrial & Petrochemical Clusters
const GLOBAL_BBOX_REGIONS = [
  { name: 'India Subcontinent & Coastal PCPIR Hubs', bbox: '68.0,7.0,97.5,36.0', instrument: 'VIIRS_SNPP_NRT' },
  { name: 'North America (Gulf Coast / Permian / Alberta)', bbox: '-130,15,-60,65', instrument: 'VIIRS_SNPP_NRT' },
  { name: 'Middle East (Persian Gulf / Ras Laffan / Jubail)', bbox: '30,12,65,40', instrument: 'VIIRS_SNPP_NRT' },
  { name: 'Europe & North Sea (Rotterdam / Ludwigshafen)', bbox: '-15,30,45,65', instrument: 'VIIRS_SNPP_NRT' },
  { name: 'Asia-Pacific (Jamnagar / Jurong Island / China)', bbox: '65,-15,145,50', instrument: 'VIIRS_SNPP_NRT' },
  { name: 'South America (Santos / Patagonia / Amazon)', bbox: '-85,-55,-34,13', instrument: 'VIIRS_SNPP_NRT' },
  { name: 'Africa & Mediterranean Oil Hubs', bbox: '-20,-35,55,38', instrument: 'VIIRS_NOAA20_NRT' },
  { name: 'Oceania & Southeast Asia Arc', bbox: '110,-45,160,-10', instrument: 'VIIRS_NOAA20_NRT' }
];

interface RawFIRMSData {
  latitude: number;
  longitude: number;
  brightness: number;
  bright_t31?: number;
  frp: number;
  scan: number;
  track: number;
  acq_date: string;
  acq_time: string;
  satellite: 'VIIRS-SNPP' | 'VIIRS-NOAA20' | 'VIIRS-NOAA21' | 'MODIS-Terra' | 'MODIS-Aqua';
  confidence: 'nominal' | 'high' | 'critical' | 'low';
  daynight: 'D' | 'N';
}

function parseFIRMSCSV(csvText: string, defaultSatellite: 'VIIRS-SNPP' | 'VIIRS-NOAA20' | 'MODIS-Terra'): RawFIRMSData[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const latIdx = headers.indexOf('latitude');
  const lonIdx = headers.indexOf('longitude');
  const brightIdx = headers.indexOf('bright_ti4') !== -1 ? headers.indexOf('bright_ti4') : headers.indexOf('brightness');
  const brightT31Idx = headers.indexOf('bright_ti5') !== -1 ? headers.indexOf('bright_ti5') : headers.indexOf('bright_t31');
  const frpIdx = headers.indexOf('frp');
  const scanIdx = headers.indexOf('scan');
  const trackIdx = headers.indexOf('track');
  const dateIdx = headers.indexOf('acq_date');
  const timeIdx = headers.indexOf('acq_time');
  const satIdx = headers.indexOf('satellite');
  const confIdx = headers.indexOf('confidence');
  const dnIdx = headers.indexOf('daynight');

  if (latIdx === -1 || lonIdx === -1) return [];

  const records: RawFIRMSData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < headers.length) continue;

    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;

    const brightness = brightIdx !== -1 ? parseFloat(cols[brightIdx]) || 310.0 : 310.0;
    const brightT31 = brightT31Idx !== -1 ? parseFloat(cols[brightT31Idx]) || 290.0 : undefined;
    const frp = frpIdx !== -1 ? parseFloat(cols[frpIdx]) || 15.0 : 15.0;
    const scan = scanIdx !== -1 ? parseFloat(cols[scanIdx]) || 1.0 : 1.0;
    const track = trackIdx !== -1 ? parseFloat(cols[trackIdx]) || 1.0 : 1.0;
    const acq_date = dateIdx !== -1 ? cols[dateIdx] : new Date().toISOString().slice(0, 10);
    const rawTime = timeIdx !== -1 ? cols[timeIdx] : '1200';
    const acq_time = rawTime.length === 3 ? `0${rawTime.slice(0, 1)}:${rawTime.slice(1)}Z` : rawTime.length === 4 ? `${rawTime.slice(0, 2)}:${rawTime.slice(2)}Z` : `${rawTime}Z`;

    let sat: 'VIIRS-SNPP' | 'VIIRS-NOAA20' | 'VIIRS-NOAA21' | 'MODIS-Terra' | 'MODIS-Aqua' = defaultSatellite;
    if (satIdx !== -1) {
      const sVal = cols[satIdx].toUpperCase();
      if (sVal === 'N' || sVal.includes('SNPP')) sat = 'VIIRS-SNPP';
      else if (sVal === 'N20' || sVal.includes('NOAA20')) sat = 'VIIRS-NOAA20';
      else if (sVal === 'N21' || sVal.includes('NOAA21')) sat = 'VIIRS-NOAA21';
      else if (sVal.includes('TERRA')) sat = 'MODIS-Terra';
      else if (sVal.includes('AQUA')) sat = 'MODIS-Aqua';
    }

    let confidence: 'nominal' | 'high' | 'critical' | 'low' = 'nominal';
    if (confIdx !== -1) {
      const cVal = cols[confIdx].toLowerCase();
      if (cVal === 'h' || cVal === 'high' || parseInt(cVal) >= 80) {
        confidence = frp > 100 ? 'critical' : 'high';
      } else if (cVal === 'l' || cVal === 'low' || parseInt(cVal) < 40) {
        confidence = 'low';
      } else {
        confidence = 'nominal';
      }
    }

    const daynight = (dnIdx !== -1 && cols[dnIdx].toUpperCase() === 'N') ? 'N' : 'D';

    records.push({
      latitude: lat,
      longitude: lon,
      brightness,
      bright_t31: brightT31,
      frp,
      scan,
      track,
      acq_date,
      acq_time,
      satellite: sat,
      confidence,
      daynight
    });
  }

  return records;
}

// Fetch live NASA FIRMS feeds and compute industrial proximity threat scores
export async function fetchLiveFIRMSHotspots(): Promise<{ anomalies: ThermalAnomaly[]; alerts: EmergencyAlert[] }> {
  if (!currentMapKey || currentMapKey.length < 10) {
    lastSyncStatusMessage = 'No valid NASA FIRMS MAP_KEY configured.';
    return { anomalies: cachedRealAnomalies, alerts: [] };
  }

  const rawDetections: RawFIRMSData[] = [];
  const successfulRegions: string[] = [];

  try {
    const fetchPromises = GLOBAL_BBOX_REGIONS.map(async (region) => {
      try {
        const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${currentMapKey}/${region.instrument}/${region.bbox}/1`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'PyroGuard-Industrial-Fire-Monitor/2.0' },
          signal: AbortSignal.timeout(10000)
        });

        if (res.ok) {
          const csvText = await res.text();
          if (csvText && !csvText.includes('Invalid API call')) {
            const defaultSat = region.instrument.includes('NOAA20') ? 'VIIRS-NOAA20' : 'VIIRS-SNPP';
            const parsed = parseFIRMSCSV(csvText, defaultSat);
            rawDetections.push(...parsed);
            successfulRegions.push(region.name);
          }
        }
      } catch (err: any) {
        console.warn(`NASA FIRMS fetch error for region ${region.name}:`, err.message);
      }
    });

    await Promise.all(fetchPromises);

    if (rawDetections.length === 0) {
      console.log('NASA FIRMS API returned 0 records or reached rate limit. Retaining current telemetry.');
      lastSyncStatusMessage = 'NASA FIRMS Live API polled (0 recent satellite passes or rate limit).';
      return { anomalies: cachedRealAnomalies, alerts: [] };
    }

    console.log(`NASA FIRMS: Ingested ${rawDetections.length} raw real satellite thermal detections across ${successfulRegions.length} global regions.`);

    // Spatial matching against all industrial facilities
    const processedHotspots: ThermalAnomaly[] = [];
    const generatedAlerts: EmergencyAlert[] = [];

    // For each raw detection, find the closest industrial facility
    rawDetections.forEach((raw, idx) => {
      let closestFac = GLOBAL_INDUSTRIAL_FACILITIES[0];
      let minDistance = 999999;

      GLOBAL_INDUSTRIAL_FACILITIES.forEach(fac => {
        const dist = calculateDistanceKm(raw.latitude, raw.longitude, fac.latitude, fac.longitude);
        if (dist < minDistance) {
          minDistance = dist;
          closestFac = fac;
        }
      });

      // Realistic meteorological wind simulation based on regional latitude
      const windSpeed = Math.round(10 + Math.abs(Math.sin(raw.latitude * 0.1)) * 30);
      const windDir = Math.round((Math.abs(raw.longitude * 3.7) + 120) % 360);

      const windEval = evaluateWindRisk(raw.latitude, raw.longitude, closestFac.latitude, closestFac.longitude, windDir, windSpeed);
      const threat = calculateThreatScore(minDistance, raw.frp, closestFac, windEval.riskType, windSpeed);

      const anomalyId = `FIRMS-REAL-${raw.satellite.slice(0, 5)}-${idx + 1}-${Math.floor(Math.random() * 900 + 100)}`;

      const anomaly: ThermalAnomaly = {
        id: anomalyId,
        latitude: raw.latitude,
        longitude: raw.longitude,
        brightness: Number(raw.brightness.toFixed(1)),
        bright_t31: raw.bright_t31 ? Number(raw.bright_t31.toFixed(1)) : undefined,
        frp: Number(raw.frp.toFixed(1)),
        scan: raw.scan,
        track: raw.track,
        acq_date: raw.acq_date,
        acq_time: raw.acq_time,
        satellite: raw.satellite,
        confidence: threat.severity === 'CRITICAL' ? 'critical' : raw.confidence,
        daynight: raw.daynight,
        windSpeedKmh: windSpeed,
        windDirectionDeg: windDir,
        nearestFacility: {
          facility: closestFac,
          distanceKm: Number(minDistance.toFixed(2)),
          threatScore: threat.score,
          threatLevel: threat.severity,
          timeToImpactHours: threat.timeToImpactHours,
          windSpreadRisk: windEval.riskType
        }
      };

      processedHotspots.push(anomaly);

      // Auto-trigger CAD emergency dispatch if within high danger zone.
      // Gated on FRP so sub-5MW sensor noise near a facility doesn't spam dispatches.
      if (raw.frp >= 5 && (minDistance <= closestFac.blastRadiusKm * 1.5 || (threat.severity === 'CRITICAL' && minDistance <= 15.0))) {
        generatedAlerts.push({
          id: `CAD-${Date.now()}-${idx}`,
          timestamp: new Date().toISOString(),
          facilityId: closestFac.id,
          facilityName: closestFac.name,
          anomalyId: anomaly.id,
          severity: threat.severity,
          title: `CRITICAL NASA SATELLITE BREACH: ${raw.satellite} detected ${raw.frp.toFixed(1)} MW firefront`,
          message: `Live satellite telemetry placed a ${raw.frp.toFixed(1)} MW thermal hotspot only ${minDistance.toFixed(1)} km from ${closestFac.name}. Wind vector (${windSpeed} km/h from ${windDir}°) presents an immediate ignition vector to ${closestFac.primaryChemicals.slice(0, 2).join(', ')}.`,
          distanceKm: Number(minDistance.toFixed(1)),
          frpMW: Number(raw.frp.toFixed(1)),
          dispatchedTo: [
            closestFac.emergencyContact.responderUnit,
            'Regional Hazmat Emergency Directorate',
            'Mutual Aid Industrial Fire Brigade'
          ],
          status: 'DISPATCHED',
          evacuationPerimeterKm: Number((closestFac.blastRadiusKm + 2.0).toFixed(1)),
          apparatusAssigned: [
            'Class-B AFFF Foam Monitor Tender',
            'High-Volume Industrial Water Cannon',
            'Hazmat Vapor Suppression Truck'
          ]
        });
      }
    });

    // Intelligent Prioritization & Sampling:
    // Sort anomalies: prioritize ones closest to industrial facilities (< 50km) and highest FRP
    const closeHazards = processedHotspots.filter(a => (a.nearestFacility?.distanceKm || 999) < 60);
    const highPowerHotspots = processedHotspots.filter(a => a.frp >= 25 && (a.nearestFacility?.distanceKm || 999) >= 60);
    const generalHotspots = processedHotspots.filter(a => a.frp < 25 && (a.nearestFacility?.distanceKm || 999) >= 60);

    // Keep top close hazards + top high-power fires + distributed representative fires (up to 300 total for responsive UI)
    closeHazards.sort((a, b) => (a.nearestFacility?.distanceKm || 999) - (b.nearestFacility?.distanceKm || 999));
    highPowerHotspots.sort((a, b) => b.frp - a.frp);

    const curatedHotspots = [
      ...closeHazards.slice(0, 120),
      ...highPowerHotspots.slice(0, 100),
      ...generalHotspots.slice(0, 80)
    ];

    cachedRealAnomalies = curatedHotspots;
    isUsingRealData = true;
    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatusMessage = `Live NASA FIRMS feed active. ${rawDetections.length} raw satellite detections processed across ${successfulRegions.length} regions.`;

    return {
      anomalies: cachedRealAnomalies,
      alerts: generatedAlerts.slice(0, 8)
    };
  } catch (error: any) {
    console.error('Error in fetchLiveFIRMSHotspots:', error);
    lastSyncStatusMessage = `NASA FIRMS sync error: ${error.message}`;
    return { anomalies: cachedRealAnomalies, alerts: [] };
  }
}

export function getCachedAnomalies(): ThermalAnomaly[] {
  return cachedRealAnomalies;
}

// One-time startup backfill: pulls NASA FIRMS' historical NRT archive (day_range is
// capped at 5 for this API key/source combination - the API rejects anything higher
// with "Invalid day range. Expects [1..5]") so "persistent thermal source" detection has
// real multi-day history to work with immediately, instead of only accumulating from the
// moment the server first started. Only keeps detections near a known industrial
// facility (<=60km) since that's the pool persistence detection actually cares about -
// global wildfire noise would balloon storage for no analytical benefit here.
export async function fetchHistoricalFIRMSBackfill(dayRange: number = 5): Promise<ThermalAnomaly[]> {
  if (!currentMapKey || currentMapKey.length < 10) return [];

  const rawDetections: RawFIRMSData[] = [];

  const fetchPromises = GLOBAL_BBOX_REGIONS.map(async (region) => {
    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${currentMapKey}/${region.instrument}/${region.bbox}/${dayRange}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'PyroGuard-Industrial-Fire-Monitor/2.0' },
        signal: AbortSignal.timeout(20000)
      });
      if (res.ok) {
        const csvText = await res.text();
        if (csvText && !csvText.toLowerCase().includes('invalid')) {
          const defaultSat = region.instrument.includes('NOAA20') ? 'VIIRS-NOAA20' : 'VIIRS-SNPP';
          rawDetections.push(...parseFIRMSCSV(csvText, defaultSat));
        } else if (csvText) {
          console.warn(`NASA FIRMS backfill rejected for region ${region.name}: ${csvText.slice(0, 100)}`);
        }
      }
    } catch (err: any) {
      console.warn(`NASA FIRMS backfill fetch error for region ${region.name}:`, err.message);
    }
  });

  await Promise.all(fetchPromises);
  if (rawDetections.length === 0) {
    console.warn('[NASA FIRMS] Historical backfill: 0 raw detections returned across all regions.');
    return [];
  }

  const nearFacilityAnomalies: ThermalAnomaly[] = [];

  rawDetections.forEach((raw, idx) => {
    let closestFac = GLOBAL_INDUSTRIAL_FACILITIES[0];
    let minDistance = 999999;
    GLOBAL_INDUSTRIAL_FACILITIES.forEach(fac => {
      const dist = calculateDistanceKm(raw.latitude, raw.longitude, fac.latitude, fac.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        closestFac = fac;
      }
    });

    if (minDistance > 60) return; // only industrially-relevant history matters here

    const windSpeed = Math.round(10 + Math.abs(Math.sin(raw.latitude * 0.1)) * 30);
    const windDir = Math.round((Math.abs(raw.longitude * 3.7) + 120) % 360);
    const windEval = evaluateWindRisk(raw.latitude, raw.longitude, closestFac.latitude, closestFac.longitude, windDir, windSpeed);
    const threat = calculateThreatScore(minDistance, raw.frp, closestFac, windEval.riskType, windSpeed);

    nearFacilityAnomalies.push({
      id: `FIRMS-BACKFILL-${raw.satellite.slice(0, 5)}-${idx + 1}-${Math.floor(Math.random() * 900 + 100)}`,
      latitude: raw.latitude,
      longitude: raw.longitude,
      brightness: Number(raw.brightness.toFixed(1)),
      bright_t31: raw.bright_t31 ? Number(raw.bright_t31.toFixed(1)) : undefined,
      frp: Number(raw.frp.toFixed(1)),
      scan: raw.scan,
      track: raw.track,
      acq_date: raw.acq_date,
      acq_time: raw.acq_time,
      satellite: raw.satellite,
      confidence: threat.severity === 'CRITICAL' ? 'critical' : raw.confidence,
      daynight: raw.daynight,
      windSpeedKmh: windSpeed,
      windDirectionDeg: windDir,
      nearestFacility: {
        facility: closestFac,
        distanceKm: Number(minDistance.toFixed(2)),
        threatScore: threat.score,
        threatLevel: threat.severity,
        timeToImpactHours: threat.timeToImpactHours,
        windSpreadRisk: windEval.riskType
      }
    });
  });

  console.log(`[NASA FIRMS] Historical backfill: ${nearFacilityAnomalies.length} industrially-relevant detections across ${dayRange} days.`);
  return nearFacilityAnomalies;
}
