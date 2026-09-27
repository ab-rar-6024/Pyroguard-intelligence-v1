// Real computer-vision burn-scar detection over actual Sentinel-2 L2A surface reflectance
// bands (not the true-colour JPEG shown for visual confirmation elsewhere). Computes the
// Normalized Burn Ratio (NBR) - the standard remote-sensing index for burned vegetation,
// (NIR - SWIR) / (NIR + SWIR) - by pulling a small pixel window directly out of the actual
// Cloud-Optimized GeoTIFF band files (B08 near-infrared, B12 shortwave-infrared) via HTTP
// range requests, so this reads real satellite reflectance data, not a heuristic on the
// thumbnail image.
//
// Caveat, stated plainly: this is a *single-date* NBR snapshot, not the pre-fire/post-fire
// dNBR change-detection burn severity maps used operationally (USGS/MTBS), which need a
// clear pre-fire reference scene. Absolute-NBR thresholds below are a reasonable proxy for
// "does this pixel currently look like burned ground vs. live vegetation", not a calibrated
// severity index.
import { fromUrl, GeoTIFFImage } from 'geotiff';
import proj4 from 'proj4';

const STAC_SEARCH_URL = 'https://earth-search.aws.element84.com/v1/search';
const STAC_ITEM_URL = (id: string) => `https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${id}`;

// Sentinel-2 tiles are always published in WGS84 UTM (EPSG 326xx = north, 327xx = south),
// so the projection can be derived from the EPSG code itself with no external CRS database.
function utmProj4FromEpsg(epsg: number): string {
  const prefix = Math.floor(epsg / 100);
  const zone = epsg % 100;
  if (prefix !== 326 && prefix !== 327) {
    throw new Error(`Unsupported CRS EPSG:${epsg} (expected a WGS84 UTM zone)`);
  }
  return `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs${prefix === 327 ? ' +south' : ''}`;
}

// GeoTIFF image handles are reused across requests for the same band file - opening one
// costs a handful of range requests to parse the COG header/IFD, so caching avoids paying
// that cost again for every detection that happens to fall in the same Sentinel-2 tile.
const imageCache = new Map<string, Promise<GeoTIFFImage>>();
function openCachedImage(href: string): Promise<GeoTIFFImage> {
  let cached = imageCache.get(href);
  if (!cached) {
    cached = fromUrl(href).then((tiff) => tiff.getImage());
    imageCache.set(href, cached);
    cached.catch(() => imageCache.delete(href)); // don't cache failures
  }
  return cached;
}

async function readWindowMeanGrid(
  href: string,
  lat: number,
  lon: number,
  epsg: number,
  groundWindowMeters: number
): Promise<{ grid: Float64Array; pixelSizeM: number }> {
  const image = await openCachedImage(href);
  const [minX, minY, maxX, maxY] = image.getBoundingBox();
  const width = image.getWidth();
  const height = image.getHeight();
  const pixelSizeM = (maxX - minX) / width;

  const [easting, northing] = proj4('EPSG:4326', utmProj4FromEpsg(epsg), [lon, lat]);
  const col = Math.round(((easting - minX) / (maxX - minX)) * width);
  const row = Math.round(((maxY - northing) / (maxY - minY)) * height);

  const halfPixels = Math.max(1, Math.round(groundWindowMeters / 2 / pixelSizeM));
  const window: [number, number, number, number] = [
    Math.max(0, col - halfPixels),
    Math.max(0, row - halfPixels),
    Math.min(width, col + halfPixels),
    Math.min(height, row + halfPixels),
  ];
  if (window[2] <= window[0] || window[3] <= window[1]) {
    throw new Error('Requested location falls outside this scene tile.');
  }

  const raster = await image.readRasters({ window });
  const band = raster[0] as unknown as ArrayLike<number>;
  return { grid: Float64Array.from(band), pixelSizeM };
}

export interface BurnScarResult {
  sceneId: string;
  datetime: string | null;
  cloudCover: number | null;
  meanNBR: number;
  burnedPixelPercent: number;
  validPixelCount: number;
  severity: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';
  method: 'sentinel2-nbr-single-date';
}

async function fetchStacItem(lat: number, lon: number, sceneId?: string): Promise<any> {
  if (sceneId) {
    const res = await fetch(STAC_ITEM_URL(sceneId), { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`STAC item lookup failed (${res.status})`);
    return res.json();
  }
  const res = await fetch(STAC_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      intersects: { type: 'Point', coordinates: [lon, lat] },
      limit: 1,
      sortby: [{ field: 'properties.datetime', direction: 'desc' }],
      query: { 'eo:cloud_cover': { lt: 40 } },
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`STAC search failed (${res.status})`);
  const json = await res.json();
  const feature = json.features?.[0];
  if (!feature) throw new Error('No recent low-cloud Sentinel-2 scene covers this location.');
  return feature;
}

export async function analyzeBurnScar(
  lat: number,
  lon: number,
  sceneId?: string,
  groundWindowMeters: number = 200
): Promise<BurnScarResult> {
  const item = await fetchStacItem(lat, lon, sceneId);
  const epsg: number | undefined = item.properties?.['proj:epsg'];
  const nirHref: string | undefined = item.assets?.nir?.href;
  const swirHref: string | undefined = item.assets?.swir22?.href;
  if (!epsg || !nirHref || !swirHref) {
    throw new Error('Scene is missing required NIR/SWIR bands or projection metadata.');
  }

  const [nirWin, swirWin] = await Promise.all([
    readWindowMeanGrid(nirHref, lat, lon, epsg, groundWindowMeters), // B08, 10m
    readWindowMeanGrid(swirHref, lat, lon, epsg, groundWindowMeters), // B12, 20m
  ]);

  // NIR is 10m/px, SWIR is 20m/px covering the same ground extent - downsample NIR onto
  // the coarser SWIR grid (2x2 block-average) so each pair of samples represents the same
  // patch of ground before computing the ratio.
  const nirSide = Math.round(Math.sqrt(nirWin.grid.length));
  const swirSide = Math.round(Math.sqrt(swirWin.grid.length));
  const scale = nirSide / swirSide;

  let sumNBR = 0;
  let validCount = 0;
  let burnedCount = 0;

  for (let r = 0; r < swirSide; r++) {
    for (let c = 0; c < swirSide; c++) {
      let nirSum = 0, nirN = 0;
      const r0 = Math.floor(r * scale), r1 = Math.floor((r + 1) * scale);
      const c0 = Math.floor(c * scale), c1 = Math.floor((c + 1) * scale);
      for (let nr = r0; nr < r1 && nr < nirSide; nr++) {
        for (let nc = c0; nc < c1 && nc < nirSide; nc++) {
          nirSum += nirWin.grid[nr * nirSide + nc];
          nirN++;
        }
      }
      if (nirN === 0) continue;
      const nir = nirSum / nirN;
      const swir = swirWin.grid[r * swirSide + c];
      if (nir + swir <= 0) continue; // no-data / edge pixel

      const nbr = (nir - swir) / (nir + swir);
      sumNBR += nbr;
      validCount++;
      if (nbr < 0.1) burnedCount++; // charred vegetation / bare-ground signature
    }
  }

  if (validCount === 0) {
    throw new Error('No valid (non-zero) pixels in this window - likely cloud, cloud shadow, or scene edge.');
  }

  const meanNBR = sumNBR / validCount;
  const burnedPixelPercent = (burnedCount / validCount) * 100;
  const severity: BurnScarResult['severity'] =
    burnedPixelPercent >= 60 ? 'HIGH' : burnedPixelPercent >= 30 ? 'MODERATE' : burnedPixelPercent >= 10 ? 'LOW' : 'NONE';

  return {
    sceneId: item.id,
    datetime: item.properties?.datetime ?? null,
    cloudCover: item.properties?.['eo:cloud_cover'] ?? null,
    meanNBR: Number(meanNBR.toFixed(3)),
    burnedPixelPercent: Number(burnedPixelPercent.toFixed(1)),
    validPixelCount: validCount,
    severity,
    method: 'sentinel2-nbr-single-date',
  };
}
