// Records REAL OpenStreetMap land-use answers for the case-study focus points into
// src/data/caseStudyLanduseSnapshots.ts. Run with: npm run record:cases
// Needs the public Overpass servers to be reachable; it only records genuine live answers
// (never "unknown"), and keeps any snapshot recorded earlier.
import { writeFileSync } from 'node:fs';
import { CASE_STUDIES, getCaseStudy } from '../src/utils/caseStudyService';
import { CASE_STUDY_LANDUSE_SNAPSHOTS } from '../src/data/caseStudyLanduseSnapshots';

async function main() {
  const merged = { ...CASE_STUDY_LANDUSE_SNAPSHOTS };
  let recorded = 0;

  for (const def of CASE_STUDIES) {
    try {
      const r = await getCaseStudy(def.id);
      if (r.landuseSource === 'live' && r.osmLanduse !== 'unknown') {
        merged[def.id] = { osmLanduse: r.osmLanduse, recordedAt: new Date().toISOString() };
        recorded++;
        console.log(`recorded  ${def.id}: ${r.osmLanduse}`);
      } else {
        console.log(`skipped   ${def.id}: no live land-use answer (${r.osmLanduse}, ${r.landuseSource})`);
      }
    } catch (e: any) {
      console.log(`failed    ${def.id}: ${e.message}`);
    }
  }

  const body = [
    '// Real OpenStreetMap land-use answers recorded for the case-study focus points.',
    '// Used ONLY when the public Overpass servers are unreachable at request time, and always shown',
    '// in the UI as "recorded" - never passed off as a live lookup.',
    '// Regenerate with: npm run record:cases  (needs Overpass to be reachable).',
    "import type { OsmLanduseCategory } from '../utils/osmLanduseService';",
    '',
    `export const CASE_STUDY_LANDUSE_SNAPSHOTS: Record<string, { osmLanduse: OsmLanduseCategory; recordedAt: string }> = ${JSON.stringify(merged, null, 2)};`,
    '',
  ].join('\n');

  writeFileSync('src/data/caseStudyLanduseSnapshots.ts', body);
  console.log(`\nWrote src/data/caseStudyLanduseSnapshots.ts (${Object.keys(merged).length} snapshot(s), ${recorded} new this run).`);
}

main();
