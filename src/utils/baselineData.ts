import { GLOBAL_INDUSTRIAL_FACILITIES } from '../data/industrialDatabase';
import { calculateDistanceKm, evaluateWindRisk, calculateThreatScore } from './gisCalculations';
import { ThermalAnomaly, EmergencyAlert } from '../types';

export const DEFAULT_ACTIVE_ALERTS: EmergencyAlert[] = [
  {
    id: 'alt-init-01',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    facilityId: 'fac-na-01',
    facilityName: 'Baytown Petrochemical Complex (ExxonMobil)',
    anomalyId: 'th-na-live-01',
    severity: 'CRITICAL',
    title: 'CRITICAL HAZARD BREACH: Thermal Anomaly 1.4km from Crude Storage',
    message: 'VIIRS satellite detected 182 MW thermal signature in immediate blast radius (3.5km). Downwind vector poses direct ignition threat to cryogenic storage tanks.',
    distanceKm: 1.4,
    frpMW: 182.4,
    dispatchedTo: ['Harris County Hazmat Unit 4', 'ExxonMobil Foam Brigade', 'Port Authority Marine Patrol'],
    status: 'DISPATCHED',
    evacuationPerimeterKm: 4.5,
    apparatusAssigned: ['2x Industrial Foam Tenders', 'Hazmat Command Unit', 'Aerial Thermal Drone']
  },
  {
    id: 'alt-init-02',
    timestamp: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    facilityId: 'fac-ap-02',
    facilityName: 'Jamnagar Refinery & Petrochemical Complex (Reliance)',
    anomalyId: 'th-ap-live-02',
    severity: 'HIGH',
    title: 'HIGH PROXIMITY ALERT: Agricultural Fire within 4.1km of Tank Farm',
    message: 'MODIS-Aqua detected 88 MW thermal front advancing east at 18 km/h wind speed. 5km buffer precautionary cooling line activated.',
    distanceKm: 4.1,
    frpMW: 88.0,
    dispatchedTo: ['Gujarat SDRF Jamnagar Wing', 'On-Site Deluge Response'],
    status: 'ACKNOWLEDGED',
    evacuationPerimeterKm: 5.0,
    apparatusAssigned: ['Perimeter Deluge Monitors', 'Type 1 Water Cannon']
  }
];

export function generateClientBaselineHotspots(): ThermalAnomaly[] {
  const hotspots: ThermalAnomaly[] = [];
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5).replace(':', '') + 'Z';

  GLOBAL_INDUSTRIAL_FACILITIES.forEach((facility, idx) => {
    const distOffsets = [
      { offsetLat: (Math.sin(idx + 1) * 0.03), offsetLon: (Math.cos(idx + 1) * 0.03), baseFrp: 120 + ((idx * 17) % 180), conf: 'critical' as const },
      { offsetLat: (Math.cos(idx * 2) * 0.09), offsetLon: (Math.sin(idx * 2) * 0.09), baseFrp: 35 + ((idx * 23) % 90), conf: 'high' as const },
    ];

    distOffsets.forEach((off, subIdx) => {
      const lat = Number((facility.latitude + off.offsetLat).toFixed(5));
      const lon = Number((facility.longitude + off.offsetLon).toFixed(5));
      const distance = calculateDistanceKm(lat, lon, facility.latitude, facility.longitude);
      const windSpeed = Math.round(10 + ((idx * 7) % 28));
      const windDir = Math.round((idx * 45) % 360);

      const windEval = evaluateWindRisk(lat, lon, facility.latitude, facility.longitude, windDir, windSpeed);
      const threat = calculateThreatScore(distance, off.baseFrp, facility, windEval.riskType, windSpeed);

      const satellites: ('VIIRS-SNPP' | 'VIIRS-NOAA20' | 'VIIRS-NOAA21' | 'MODIS-Terra' | 'MODIS-Aqua')[] = [
        'VIIRS-SNPP', 'VIIRS-NOAA20', 'VIIRS-NOAA21', 'MODIS-Terra', 'MODIS-Aqua'
      ];

      hotspots.push({
        id: `FIRMS-${facility.id}-${subIdx + 1}-${1000 + idx * 10 + subIdx}`,
        latitude: lat,
        longitude: lon,
        brightness: Number((315 + ((idx * 13) % 100)).toFixed(1)),
        bright_t31: Number((295 + ((idx * 5) % 25)).toFixed(1)),
        frp: Number(off.baseFrp.toFixed(1)),
        scan: 1.1,
        track: 1.0,
        acq_date: dateStr,
        acq_time: timeStr,
        satellite: satellites[(idx + subIdx) % satellites.length],
        confidence: off.conf,
        daynight: idx % 2 === 0 ? 'D' : 'N',
        windSpeedKmh: windSpeed,
        windDirectionDeg: windDir,
        nearestFacility: {
          facility,
          distanceKm: distance,
          threatScore: threat.score,
          threatLevel: threat.severity,
          timeToImpactHours: threat.timeToImpactHours,
          windSpreadRisk: windEval.riskType
        }
      });
    });
  });

  return hotspots;
}
