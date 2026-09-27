// Feature encoding + multi-class (one-vs-rest) inference layer over the gradient
// boosted trees in gbdt.ts. This is what actually classifies a thermal detection once
// OSM land-use and persistence history are known - a strictly richer signal set than
// the plain distance/FRP threshold rules in gisCalculations.ts, which remain the
// fast first-pass classifier for the live 15s FIRMS poll (see supabaseService.ts).
import { BoostedModel, predictBoosted } from './gbdt';

export const FIRE_TYPES = ['WILDFIRE', 'URBAN_FIRE', 'GAS_FLARE', 'MINING_THERMAL', 'UNCLASSIFIED'] as const;
export type MLFireType = typeof FIRE_TYPES[number];

export type FacilityKind = 'flare' | 'mining' | 'urban' | 'other' | 'none';
export type OsmCategory = 'industrial' | 'mining' | 'forest' | 'farmland' | 'residential' | 'unknown';

export interface ThermalFeatureInput {
  distanceKm: number;
  frpMW: number;
  isNight: boolean;
  facilityKind: FacilityKind;
  osmCategory: OsmCategory;
  /** Distinct days this grid cell has been observed hot in the persistence window (0 if unknown). */
  persistenceDays?: number;
  /** (latestFrp - historicalMean) / historicalStd for this source; 0 if no baseline yet. */
  frpZScore?: number;
}

// Keep this order in lockstep with scripts/trainThermalClassifier.ts.
export function toFeatureVector(input: ThermalFeatureInput): number[] {
  return [
    Math.min(input.distanceKm, 60),
    Math.min(input.frpMW, 500),
    input.isNight ? 1 : 0,
    input.facilityKind !== 'none' ? 1 : 0,
    input.facilityKind === 'flare' ? 1 : 0,
    input.facilityKind === 'mining' ? 1 : 0,
    input.facilityKind === 'urban' ? 1 : 0,
    input.osmCategory === 'industrial' ? 1 : 0,
    input.osmCategory === 'mining' ? 1 : 0,
    input.osmCategory === 'forest' ? 1 : 0,
    input.osmCategory === 'farmland' ? 1 : 0,
    input.osmCategory === 'residential' ? 1 : 0,
    Math.min(input.persistenceDays ?? 0, 30),
    Math.max(-3, Math.min(input.frpZScore ?? 0, 6)),
  ];
}

export interface MultiClassModel {
  classes: readonly MLFireType[];
  binaryModels: BoostedModel[]; // one-vs-rest, same order as `classes`
}

export function predictProbabilities(model: MultiClassModel, features: number[]): Record<MLFireType, number> {
  const raw = model.binaryModels.map((m) => predictBoosted(m, features));
  const sum = raw.reduce((s, v) => s + v, 0) || 1;
  const probs = {} as Record<MLFireType, number>;
  model.classes.forEach((c, i) => { probs[c] = raw[i] / sum; });
  return probs;
}

export interface MLPrediction {
  type: MLFireType;
  confidence: number;
  probabilities: Record<MLFireType, number>;
}

export function predictFireTypeML(model: MultiClassModel, input: ThermalFeatureInput): MLPrediction {
  const features = toFeatureVector(input);
  const probabilities = predictProbabilities(model, features);
  let bestType: MLFireType = model.classes[0];
  let bestProb = -1;
  for (const c of model.classes) {
    if (probabilities[c] > bestProb) { bestProb = probabilities[c]; bestType = c; }
  }
  return { type: bestType, confidence: Number(bestProb.toFixed(3)), probabilities };
}
