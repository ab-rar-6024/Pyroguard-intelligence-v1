// Real OpenStreetMap land-use answers recorded for the case-study focus points.
// Used ONLY when the public Overpass servers are unreachable at request time, and always shown
// in the UI as "recorded" - never passed off as a live lookup.
// Regenerate with: npm run record:cases  (needs Overpass to be reachable).
import type { OsmLanduseCategory } from '../utils/osmLanduseService';

export const CASE_STUDY_LANDUSE_SNAPSHOTS: Record<string, { osmLanduse: OsmLanduseCategory; recordedAt: string }> = {};
