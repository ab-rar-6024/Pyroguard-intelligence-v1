// Runtime entry point: classify a thermal detection with the trained gradient-boosted
// model. Used by supabaseService.ts during OSM enrichment and persistent-source
// aggregation - not on the raw 15s FIRMS poll, which keeps using the fast rule-based
// heuristic in gisCalculations.ts.
import { THERMAL_CLASSIFIER_MODEL } from './model.generated';
import { predictFireTypeML, ThermalFeatureInput, MLPrediction } from './thermalClassifier';

export function classifyWithML(input: ThermalFeatureInput): MLPrediction {
  return predictFireTypeML(THERMAL_CLASSIFIER_MODEL, input);
}

export type { ThermalFeatureInput, MLPrediction, FacilityKind, OsmCategory } from './thermalClassifier';
