import { ThermalAnomaly, IndustrialFacility, IndustryType, AnomalySeverity, EmergencyAlert, AIAuditReport } from '../types';
import jsPDF from 'jspdf';

export type FireType = 'WILDFIRE' | 'URBAN_FIRE' | 'GAS_FLARE' | 'MINING_THERMAL' | 'UNCLASSIFIED';

const FLARE_FACILITY_TYPES: IndustryType[] = ['oil_refinery', 'lng_terminal', 'chemical_plant', 'fertilizer_plant'];
const URBAN_FACILITY_TYPES: IndustryType[] = [
  'manufacturing_hub', 'petrol_bunk_hub', 'timber_mill', 'power_plant',
  'nuclear_plant', 'strategic_defense', 'ammunition_depot',
];

// Classifies a detection into a human-facing incident category based on the
// nearest facility's industry type and proximity - used for the Incident
// History breakdown (Wildfire / Urban Fire / Gas Flare / Mining Thermal / Unclassified).
export function classifyFireType(
  distanceKm: number,
  frpMW: number,
  facility?: IndustrialFacility
): FireType {
  if (!facility || distanceKm > 25) {
    return 'WILDFIRE';
  }
  if (facility.type === 'mining_complex' && distanceKm <= 10) {
    return 'MINING_THERMAL';
  }
  if (FLARE_FACILITY_TYPES.includes(facility.type) && distanceKm <= 2.5 && frpMW < 40) {
    return 'GAS_FLARE';
  }
  if (URBAN_FACILITY_TYPES.includes(facility.type) && distanceKm <= 15) {
    return 'URBAN_FIRE';
  }
  return 'UNCLASSIFIED';
}

// Refines the facility-distance heuristic above with ground-truth OSM land-use data.
// The facility database wins when it already confidently ties a detection to a known
// industrial site (GAS_FLARE / URBAN_FIRE / MINING_THERMAL); OSM only steps in for the
// ambiguous WILDFIRE/UNCLASSIFIED cases, where it can confirm real forest/farmland or
// reveal industrial/mining land our facility registry doesn't cover.
export function refineFireTypeWithOsm(
  heuristicType: FireType,
  osmCategory: 'industrial' | 'mining' | 'forest' | 'farmland' | 'residential' | 'unknown'
): FireType {
  if (heuristicType !== 'WILDFIRE' && heuristicType !== 'UNCLASSIFIED') {
    return heuristicType;
  }
  switch (osmCategory) {
    case 'industrial':
      return 'URBAN_FIRE';
    case 'mining':
      return 'MINING_THERMAL';
    case 'residential':
      return 'URBAN_FIRE';
    case 'forest':
    case 'farmland':
      return 'WILDFIRE';
    default:
      return heuristicType;
  }
}

// Haversine formula to compute great circle distance in km
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

// Calculate bearing angle in degrees from point 1 to point 2
export function calculateBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return (theta * 180 / Math.PI + 360) % 360;
}

// Check if wind is blowing towards the facility
export function evaluateWindRisk(
  fireLat: number,
  fireLon: number,
  facilityLat: number,
  facilityLon: number,
  windDirectionDeg: number,
  windSpeedKmh: number
): { riskType: 'DIRECT' | 'CROSSWIND' | 'AWAY' | 'STAGNANT'; angleDelta: number } {
  if (windSpeedKmh < 5) {
    return { riskType: 'STAGNANT', angleDelta: 0 };
  }
  const bearingToFacility = calculateBearingDeg(fireLat, fireLon, facilityLat, facilityLon);
  // windDirectionDeg is the direction wind is coming FROM in meteorology.
  // Wind blowing towards is (windDirectionDeg + 180) % 360
  const windBlowingTowards = (windDirectionDeg + 180) % 360;
  let angleDelta = Math.abs(windBlowingTowards - bearingToFacility);
  if (angleDelta > 180) angleDelta = 360 - angleDelta;

  if (angleDelta <= 35) {
    return { riskType: 'DIRECT', angleDelta };
  } else if (angleDelta <= 90) {
    return { riskType: 'CROSSWIND', angleDelta };
  } else {
    return { riskType: 'AWAY', angleDelta };
  }
}

// Calculate composite Threat Score (0-100) and Severity
export function calculateThreatScore(
  distanceKm: number,
  frpMW: number,
  facility: IndustrialFacility,
  windRisk: 'DIRECT' | 'CROSSWIND' | 'AWAY' | 'STAGNANT',
  windSpeedKmh: number
): { score: number; severity: AnomalySeverity; timeToImpactHours: number } {
  // Proximity factor (0 - 50 pts)
  let proximityScore = 0;
  if (distanceKm <= 1.0) proximityScore = 50;
  else if (distanceKm <= 3.0) proximityScore = 40 + (3.0 - distanceKm) * 5;
  else if (distanceKm <= 8.0) proximityScore = 20 + ((8.0 - distanceKm) / 5.0) * 20;
  else if (distanceKm <= 20.0) proximityScore = Math.max(0, 20 - (distanceKm - 8.0));

  // FRP Fire Radiative Power factor (0 - 30 pts)
  const frpScore = Math.min(30, (frpMW / 250) * 30);

  // Facility Hazard multiplier (0 - 10 pts)
  let hazardScore = 5;
  if (facility.hazardLevel === 'EXTREME') hazardScore = 10;
  else if (facility.hazardLevel === 'HIGH') hazardScore = 7.5;

  // Wind spread factor (0 - 10 pts)
  let windScore = 2;
  if (windRisk === 'DIRECT') {
    windScore = Math.min(10, 5 + (windSpeedKmh / 50) * 5);
  } else if (windRisk === 'CROSSWIND') {
    windScore = 4;
  }

  const totalScore = Math.min(100, Math.round(proximityScore + frpScore + hazardScore + windScore));

  // Estimate fire front rate of spread in km/h: base 0.5 km/h + wind component
  const windBoost = windRisk === 'DIRECT' ? (windSpeedKmh * 0.08) : windRisk === 'CROSSWIND' ? (windSpeedKmh * 0.02) : 0;
  const spreadRateKmh = Math.max(0.4, 0.6 + windBoost + (frpMW / 500));
  const timeToImpactHours = Number((distanceKm / spreadRateKmh).toFixed(1));

  // Proximity + hazard + wind alone can reach a totalScore of ~70 even with
  // near-zero FRP (a 1km-away EXTREME facility in direct wind scores 50+10+10
  // before FRP is even factored in), so CRITICAL/HIGH require the fire itself
  // to be intense enough to be a real threat - not just close - on BOTH the
  // composite-score path and the proximity-override path. Otherwise sub-3MW
  // sensor noise or flare-level signatures near a facility get flagged
  // CRITICAL/HIGH purely by distance, which reads as arbitrary/"random" severity.
  const isSignificantFire = frpMW >= 8;
  const isModerateFire = frpMW >= 3;

  let severity: AnomalySeverity = 'WATCH';
  if (isSignificantFire && (totalScore >= 75 || distanceKm <= facility.blastRadiusKm)) {
    severity = 'CRITICAL';
  } else if (isModerateFire && (totalScore >= 55 || distanceKm <= facility.toxicPlumeRadiusKm)) {
    severity = 'HIGH';
  } else if (totalScore >= 35 || distanceKm <= 15.0) {
    severity = 'ELEVATED';
  }

  return { score: totalScore, severity, timeToImpactHours };
}

// Generate standard GeoJSON representation of thermal anomalies and industrial hazard buffers
export function exportToGeoJSON(anomalies: ThermalAnomaly[], facilities: IndustrialFacility[]): object {
  const features: any[] = [];

  // 1. Hotspots Points
  anomalies.forEach((a) => {
    features.push({
      type: 'Feature',
      id: `thermal-${a.id}`,
      geometry: {
        type: 'Point',
        coordinates: [a.longitude, a.latitude],
      },
      properties: {
        featureType: 'THERMAL_ANOMALY',
        id: a.id,
        satellite: a.satellite,
        frp_mw: a.frp,
        brightness_kelvin: a.brightness,
        confidence: a.confidence,
        acq_date: a.acq_date,
        acq_time: a.acq_time,
        daynight: a.daynight,
        wind_speed_kmh: a.windSpeedKmh,
        wind_direction_deg: a.windDirectionDeg,
        threat_level: a.nearestFacility?.threatLevel || 'WATCH',
        threat_score: a.nearestFacility?.threatScore || 0,
        nearest_facility_name: a.nearestFacility?.facility.name || 'None',
        distance_to_facility_km: a.nearestFacility?.distanceKm || null,
      },
    });
  });

  // 2. Industrial Facilities & Hazard Perimeters
  facilities.forEach((f) => {
    features.push({
      type: 'Feature',
      id: `facility-${f.id}`,
      geometry: {
        type: 'Point',
        coordinates: [f.longitude, f.latitude],
      },
      properties: {
        featureType: 'INDUSTRIAL_HAZARD_SITE',
        id: f.id,
        name: f.name,
        type: f.type,
        hazardLevel: f.hazardLevel,
        primaryChemicals: f.primaryChemicals.join(', '),
        fuelCapacityTons: f.fuelStorageCapacityTons,
        blastRadiusKm: f.blastRadiusKm,
        toxicPlumeRadiusKm: f.toxicPlumeRadiusKm,
        emergencyResponder: f.emergencyContact.responderUnit,
        radioChannel: f.emergencyContact.radioChannel,
        status: f.status,
      },
    });
  });

  return {
    type: 'FeatureCollection',
    metadata: {
      generatedBy: 'PyroGuard Industrial Thermal Early-Warning GIS Engine',
      timestamp: new Date().toISOString(),
      standards: 'OGC GeoJSON RFC 7946 / NASA FIRMS Proximity Compliance',
      totalHotspots: anomalies.length,
      totalFacilities: facilities.length,
    },
    features,
  };
}

// Generate CSV Audit Log for OSHA / NFPA / Environmental Compliance
export function exportToCSV(anomalies: ThermalAnomaly[]): string {
  const headers = [
    'Hotspot_ID',
    'Acquisition_Date',
    'Acquisition_Time_UTC',
    'Satellite_Sensor',
    'Latitude',
    'Longitude',
    'Brightness_Kelvin',
    'Fire_Radiative_Power_MW',
    'Confidence',
    'Wind_Speed_kmh',
    'Wind_Direction_deg',
    'Nearest_Facility_ID',
    'Nearest_Facility_Name',
    'Facility_Type',
    'Hazard_Level',
    'Distance_to_Facility_km',
    'Blast_Radius_km',
    'Calculated_Threat_Score',
    'Severity_Level',
    'Estimated_Time_to_Impact_Hrs',
    'Wind_Spread_Risk'
  ];

  const rows = anomalies.map((a) => {
    const fac = a.nearestFacility?.facility;
    return [
      `"${a.id}"`,
      `"${a.acq_date}"`,
      `"${a.acq_time}"`,
      `"${a.satellite}"`,
      a.latitude.toFixed(5),
      a.longitude.toFixed(5),
      a.brightness.toFixed(1),
      a.frp.toFixed(1),
      `"${a.confidence}"`,
      a.windSpeedKmh,
      a.windDirectionDeg,
      `"${fac?.id || 'N/A'}"`,
      `"${(fac?.name || 'None').replace(/"/g, '""')}"`,
      `"${fac?.type || 'N/A'}"`,
      `"${fac?.hazardLevel || 'N/A'}"`,
      a.nearestFacility ? a.nearestFacility.distanceKm.toFixed(2) : 'N/A',
      fac ? fac.blastRadiusKm.toFixed(1) : 'N/A',
      a.nearestFacility?.threatScore ?? 0,
      `"${a.nearestFacility?.threatLevel || 'WATCH'}"`,
      a.nearestFacility?.timeToImpactHours ?? 'N/A',
      `"${a.nearestFacility?.windSpreadRisk || 'N/A'}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// Generate PDF Audit Compliance & Evacuation Strategy Report using jsPDF
export function generatePDFIncidentReport(
  alerts: EmergencyAlert[],
  anomalies: ThermalAnomaly[],
  facilities: IndustrialFacility[],
  aiSummary?: string
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 18;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(249, 115, 22); // orange-500
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PYROGUARD INDUSTRIAL EARLY-WARNING SYSTEM', 14, 12);

  doc.setTextColor(226, 232, 240);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`AUDIT COMPLIANCE & EVACUATION PERIMETER REPORT | ${new Date().toUTCString()}`, 14, 20);

  y = 38;

  // Executive Summary Card
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, y, pageWidth - 28, 26, 2, 2, 'F');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('EXECUTIVE THREAT SUMMARY', 18, y + 7);

  const criticalCount = anomalies.filter(a => a.nearestFacility?.threatLevel === 'CRITICAL').length;
  const highCount = anomalies.filter(a => a.nearestFacility?.threatLevel === 'HIGH').length;
  const totalFRP = Math.round(anomalies.reduce((sum, a) => sum + a.frp, 0));

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Active Thermal Hotspots Tracked: ${anomalies.length} | Cumulative Fire Radiative Power: ${totalFRP} MW\n` +
    `Critical Zone Breaches: ${criticalCount} Facilities | Elevated/High Warnings: ${highCount} Facilities | Dispatched Alerts: ${alerts.length}`,
    18,
    y + 14
  );

  y += 34;

  // AI & Tactical Evacuation Briefing
  if (aiSummary) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('TACTICAL INCIDENT & EVACUATION STRATEGY (AI GENERATED)', 14, y);
    y += 6;

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const splitAiText = doc.splitTextToSize(aiSummary, pageWidth - 28);
    doc.text(splitAiText, 14, y);
    y += (splitAiText.length * 4.2) + 6;
  }

  // Active Critical Incidents Table
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('HIGH RISK ZONES NEAR HAZARDOUS INDUSTRIAL ASSETS', 14, y);
  y += 6;

  // Table header
  doc.setFillColor(203, 213, 225);
  doc.rect(14, y, pageWidth - 28, 7, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Facility Name / Sector', 16, y + 5);
  doc.text('Proximity', 85, y + 5);
  doc.text('FRP (MW)', 110, y + 5);
  doc.text('Threat Level', 135, y + 5);
  doc.text('Blast Perimeter', 165, y + 5);
  y += 7;

  // Table rows (Top critical/high threats)
  const sortedThreats = [...anomalies]
    .filter(a => a.nearestFacility)
    .sort((a, b) => (b.nearestFacility?.threatScore || 0) - (a.nearestFacility?.threatScore || 0))
    .slice(0, 10);

  sortedThreats.forEach((item, idx) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, pageWidth - 28, 7, 'F');
    }

    const fac = item.nearestFacility?.facility;
    const level = item.nearestFacility?.threatLevel || 'WATCH';

    if (level === 'CRITICAL') doc.setTextColor(220, 38, 38);
    else if (level === 'HIGH') doc.setTextColor(234, 88, 12);
    else doc.setTextColor(30, 41, 59);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const facName = fac?.name ? (fac.name.length > 38 ? fac.name.substring(0, 36) + '..' : fac.name) : 'N/A';
    doc.text(facName, 16, y + 4.8);
    doc.text(`${item.nearestFacility?.distanceKm.toFixed(1)} km`, 85, y + 4.8);
    doc.text(`${item.frp.toFixed(0)} MW`, 110, y + 4.8);
    doc.setFont('helvetica', 'bold');
    doc.text(level, 135, y + 4.8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${fac?.blastRadiusKm || 2.0} km`, 165, y + 4.8);

    y += 7;
  });

  y += 6;

  // Compliance & Responder Actions Box
  if (y < 250) {
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(14, y, pageWidth - 28, 22, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 58, 138);
    doc.text('EMERGENCY MITIGATION DIRECTIVE & OSHA / NFPA 30 COMPLIANCE', 18, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(
      '1. Mandatory 3km safety cordon around petroleum storage units upon thermal anomaly breach.\n' +
      '2. Activate fixed deluge foam systems and cool pressurized storage tanks in direct downwind vector.\n' +
      '3. Notify Regional Fire Brigades & Coast Guard Marine assets over designated tactical channels.',
      18,
      y + 12
    );
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `PyroGuard Emergency Dispatch System - Generated ${new Date().toISOString()} - Page ${i} of ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  doc.save(`PyroGuard_Industrial_Fire_Audit_${new Date().toISOString().slice(0, 10)}.pdf`);
}
