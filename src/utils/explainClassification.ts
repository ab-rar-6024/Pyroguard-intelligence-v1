// Turns the evidence behind a fire classification into short, human-readable reasons.
// Pure and dependency-light so both the server (case studies) and the UI can use it.
// Every sentence is derived from the inputs - nothing here is static text about a result.
import type { FireType } from './gisCalculations';

export type OsmCategoryLabel = 'industrial' | 'mining' | 'forest' | 'farmland' | 'residential' | 'unknown';

export interface ClassificationEvidence {
  fireType: FireType;
  frpMW: number;
  /** Distance in km to the nearest known industrial facility (null if none known). */
  distanceKm: number | null;
  facilityName?: string | null;
  facilityType?: string | null;
  osmCategory?: OsmCategoryLabel;
  /** Distinct days this location was seen hot. */
  persistenceDays?: number;
  /** Model confidence 0-1, when the ML classifier made the call. */
  confidence?: number;
}

export const FIRE_TYPE_LABELS: Record<FireType, string> = {
  WILDFIRE: 'Wildfire / natural vegetation fire',
  URBAN_FIRE: 'Industrial / urban-zone fire',
  GAS_FLARE: 'Gas flare (routine process heat)',
  MINING_THERMAL: 'Mining / coal-seam thermal source',
  UNCLASSIFIED: 'Unclassified thermal anomaly',
};

const OSM_SENTENCES: Record<Exclude<OsmCategoryLabel, 'unknown'>, string> = {
  industrial: 'OpenStreetMap land use at this spot is industrial',
  mining: 'OpenStreetMap land use at this spot is mining / quarry',
  forest: 'OpenStreetMap land use at this spot is forest (natural vegetation)',
  farmland: 'OpenStreetMap land use at this spot is farmland (crop / agricultural burning is possible)',
  residential: 'OpenStreetMap land use at this spot is residential / built-up',
};

export const INDUSTRIAL_FIRE_TYPES: FireType[] = ['URBAN_FIRE', 'GAS_FLARE', 'MINING_THERMAL'];

export function explainClassification(e: ClassificationEvidence): string[] {
  const reasons: string[] = [];

  // 1. Proximity to a known facility
  if (e.distanceKm != null && e.facilityName) {
    const kind = e.facilityType ? e.facilityType.replace(/_/g, ' ') : 'facility';
    if (e.distanceKm <= 5) {
      reasons.push(`${e.distanceKm.toFixed(1)} km from ${e.facilityName} (${kind}) - inside the 5 km industrial zone`);
    } else if (e.distanceKm <= 25) {
      reasons.push(`${e.distanceKm.toFixed(1)} km from the nearest known facility, ${e.facilityName} - outside the 5 km industrial zone`);
    } else {
      reasons.push(`No known industrial facility within 25 km (nearest: ${e.facilityName}, ${e.distanceKm.toFixed(0)} km away)`);
    }
  } else {
    reasons.push('No known industrial facility nearby');
  }

  // 2. Land use from OpenStreetMap
  if (e.osmCategory && e.osmCategory !== 'unknown') {
    reasons.push(OSM_SENTENCES[e.osmCategory]);
  }

  // 3. Persistence over time
  // Only a SMALL, STEADY signal over several days looks like routine industrial heat (e.g. a
  // flare). A large fire that burns for several days is just a long fire - not a persistent source.
  if (e.persistenceDays != null && e.persistenceDays > 0) {
    if (e.persistenceDays >= 3 && e.frpMW < 15) {
      reasons.push(`Small, steady heat seen on ${e.persistenceDays} different days - the pattern of a continuous industrial source such as a flare`);
    } else if (e.persistenceDays >= 2) {
      reasons.push(`Burning across ${e.persistenceDays} different days`);
    } else {
      reasons.push('Seen on 1 day so far - not enough history to call it persistent');
    }
  }

  // 4. Fire radiative power
  const frp = Math.round(e.frpMW);
  if (e.frpMW >= 100) {
    reasons.push(`Very high radiative power (${frp} MW) - an intense, large fire`);
  } else if (e.frpMW >= 30) {
    reasons.push(`Strong radiative power (${frp} MW) - an active fire`);
  } else {
    reasons.push(`Low radiative power (${frp} MW) - a small thermal source`);
  }

  // 5. Verdict
  const conf = e.confidence != null ? ` (model confidence ${Math.round(e.confidence * 100)}%)` : '';
  reasons.push(`Verdict: ${FIRE_TYPE_LABELS[e.fireType]}${conf}`);

  return reasons;
}
