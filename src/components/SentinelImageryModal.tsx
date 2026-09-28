import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Satellite, X, Loader2, Cloud, Calendar, Layers, MapPin, Flame, ScanSearch, TriangleAlert } from 'lucide-react';
import { ThermalAnomaly } from '../types';
import { classifyFireType } from '../utils/gisCalculations';

interface Scene {
  id: string;
  datetime: string;
  cloudCover: number | null;
  platform: string | null;
  thumbnail: string | null;
}

interface BurnScarResult {
  sceneId: string;
  datetime: string | null;
  cloudCover: number | null;
  meanNBR: number;
  burnedPixelPercent: number;
  validPixelCount: number;
  severity: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';
  method: string;
}

const SEVERITY_STYLE: Record<BurnScarResult['severity'], string> = {
  NONE: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  LOW: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  MODERATE: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  HIGH: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
};

interface SentinelImageryModalProps {
  anomalies: ThermalAnomaly[];
  onClose: () => void;
}

type BaseLayer = 's2' | 'landcover' | 'none';

const FIRE_TYPE_LABEL: Record<string, string> = {
  WILDFIRE: 'Wildfire / vegetation burn',
  URBAN_FIRE: 'Urban / industrial-zone fire',
  GAS_FLARE: 'Gas flare (persistent process heat)',
  MINING_THERMAL: 'Mining / coal-seam thermal',
  UNCLASSIFIED: 'Unclassified thermal anomaly',
};

export const SentinelImageryModal: React.FC<SentinelImageryModalProps> = ({ anomalies, onClose }) => {
  const candidates = useMemo(
    () =>
      anomalies
        .filter((a) => a.nearestFacility)
        .sort((a, b) => (b.nearestFacility!.threatScore - a.nearestFacility!.threatScore) || (b.frp - a.frp))
        .slice(0, 12),
    [anomalies]
  );

  const [selected, setSelected] = useState<ThermalAnomaly | null>(candidates[0] || null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('s2');
  const [burnScar, setBurnScar] = useState<BurnScarResult | null>(null);
  const [burnScarLoading, setBurnScarLoading] = useState(false);
  const [burnScarError, setBurnScarError] = useState<string | null>(null);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.Layer | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: false }).setView([20, 10], 2);
    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Base layer: Sentinel-2 cloudless true-colour mosaic (10m) or ESA WorldCover land cover
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) map.removeLayer(layerRef.current);
    layerRef.current = null;
    if (baseLayer === 's2') {
      layerRef.current = L.tileLayer(
        'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg',
        { maxZoom: 17 }
      ).addTo(map);
    } else if (baseLayer === 'landcover') {
      layerRef.current = L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16 }),
        L.tileLayer.wms('https://services.terrascope.be/wms/v2', {
          layers: 'WORLDCOVER_2021_MAP',
          format: 'image/png',
          transparent: true,
          opacity: 0.75,
        } as L.WMSOptions),
      ]).addTo(map);
    }
  }, [baseLayer]);

  // Marker + blast/plume rings + fly to selected detection
  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay || !selected) return;
    overlay.clearLayers();
    const fac = selected.nearestFacility?.facility;
    L.circleMarker([selected.latitude, selected.longitude], { radius: 8, color: '#fff', weight: 2, fillColor: '#f97316', fillOpacity: 1 }).addTo(overlay);
    if (fac) {
      L.circle([fac.latitude, fac.longitude], { radius: fac.blastRadiusKm * 1000, color: '#ef4444', weight: 1.5, fillOpacity: 0.1 }).addTo(overlay);
      L.circle([fac.latitude, fac.longitude], { radius: fac.toxicPlumeRadiusKm * 1000, color: '#a855f7', weight: 1, dashArray: '4 4', fillOpacity: 0.04 }).addTo(overlay);
      L.circleMarker([fac.latitude, fac.longitude], { radius: 5, color: '#fff', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(overlay);
    }
    const close = (selected.nearestFacility?.distanceKm ?? 999) < 30;
    map.setView([selected.latitude, selected.longitude], close ? 13 : 10);
  }, [selected]);

  // Latest Sentinel-2 scenes for the selected detection
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setScenes([]);
    setBurnScar(null);
    setBurnScarError(null);
    fetch(`/api/sentinel/scenes?lat=${selected.latitude}&lon=${selected.longitude}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success) setScenes(d.data);
        else setError(d.error || 'Could not load Sentinel-2 scenes.');
      })
      .catch(() => !cancelled && setError('Could not reach the Sentinel-2 catalog.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const nf = selected?.nearestFacility;
  const fireType = selected ? classifyFireType(nf?.distanceKm ?? 999, selected.frp, nf?.facility) : null;

  const runBurnScarAnalysis = () => {
    if (!selected) return;
    setBurnScarLoading(true);
    setBurnScarError(null);
    const sceneParam = scenes[0]?.id ? `&sceneId=${encodeURIComponent(scenes[0].id)}` : '';
    fetch(`/api/sentinel/burn-scar?lat=${selected.latitude}&lon=${selected.longitude}${sceneParam}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setBurnScar(d.data);
        else setBurnScarError(d.error || 'Burn-scar analysis failed.');
      })
      .catch(() => setBurnScarError('Could not reach the burn-scar analysis service.'))
      .finally(() => setBurnScarLoading(false));
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 font-mono text-slate-100">
      <div className="w-full max-w-6xl max-h-[92vh] bg-slate-950 border border-orange-500/25 rounded-2xl shadow-[0_12px_60px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-orange-500/20">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-black/70 border border-sky-500/40 flex items-center justify-center text-sky-400 flex-shrink-0">
              <Satellite className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white">Sentinel-2 Visual Confirmation</h2>
              <p className="text-[11px] text-slate-400">
                Copernicus Sentinel-2 imagery + ESA WorldCover land cover to verify what a FIRMS thermal hotspot really is
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer flex-shrink-0" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-glass p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
          {/* Detection picker */}
          <div className="lg:col-span-3 space-y-1.5 max-h-44 lg:max-h-none overflow-y-auto lg:overflow-visible">
            <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Highest-threat detections</div>
            {candidates.length === 0 && <div className="text-slate-500">No detections near facilities yet.</div>}
            {candidates.map((a) => {
              const active = selected?.id === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={`w-full text-left p-2 rounded-lg border transition-colors cursor-pointer ${
                    active ? 'border-orange-500/60 bg-orange-500/10' : 'border-white/5 bg-black/20 hover:border-orange-500/30'
                  }`}
                >
                  <div className="font-bold text-slate-200 truncate">{a.nearestFacility?.facility.name}</div>
                  <div className="text-[10px] text-slate-500">
                    {a.frp.toFixed(0)} MW · {a.nearestFacility?.distanceKm.toFixed(1)} km · {a.nearestFacility?.threatLevel}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Map + evidence */}
          <div className="lg:col-span-5 space-y-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              {([
                ['s2', 'Sentinel-2 true colour'],
                ['landcover', 'ESA WorldCover'],
                ['none', 'Blank'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setBaseLayer(key)}
                  className={`px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                    baseLayer === key ? 'border-sky-500/60 bg-sky-500/10 text-sky-400' : 'border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div ref={mapEl} className="w-full h-72 rounded-xl overflow-hidden border border-white/10 bg-slate-900" />
            <div className="text-[10px] text-slate-500 flex items-center gap-3 flex-wrap">
              <span><span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" />Hotspot</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />Facility</span>
              <span><span className="inline-block w-2 h-2 rounded-full border border-red-500 mr-1" />Blast radius</span>
              <span><span className="inline-block w-2 h-2 rounded-full border border-purple-500 mr-1" />Toxic plume</span>
            </div>

            {selected && nf && (
              <div className="p-3 rounded-xl border border-white/10 bg-black/20 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-200">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  Classification evidence
                </div>
                <div className="text-slate-300">
                  Verdict: <strong className="text-orange-400">{FIRE_TYPE_LABEL[fireType!]}</strong>
                </div>
                <div className="text-[11px] text-slate-400">
                  {selected.frp.toFixed(0)} MW FRP · {selected.brightness.toFixed(0)} K · {nf.distanceKm.toFixed(1)} km from {nf.facility.name} ({nf.facility.type.replace('_', ' ')}) ·
                  threat {nf.threatLevel} ({nf.threatScore}/100)
                </div>
                <div className="text-[10px] text-slate-500">
                  Switch to <em>ESA WorldCover</em> to check whether the hotspot sits on forest/cropland (natural) or built-up/bare land (industrial).
                </div>
              </div>
            )}

            {selected && (
              <div className="p-3 rounded-xl border border-white/10 bg-black/20 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 font-bold text-slate-200">
                    <ScanSearch className="w-3.5 h-3.5 text-sky-400" />
                    Burn-scar detection (NBR)
                  </div>
                  <button
                    onClick={runBurnScarAnalysis}
                    disabled={burnScarLoading}
                    className="px-2.5 py-1 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-400 text-[11px] font-bold hover:bg-sky-500/20 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {burnScarLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanSearch className="w-3 h-3" />}
                    {burnScarLoading ? 'Reading NIR/SWIR bands…' : 'Analyze real Sentinel-2 bands'}
                  </button>
                </div>

                {burnScarError && (
                  <div className="flex items-start gap-1.5 text-rose-400 text-[11px]">
                    <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {burnScarError}
                  </div>
                )}

                {burnScar && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${SEVERITY_STYLE[burnScar.severity]}`}>
                        {burnScar.severity} burn signature
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {burnScar.burnedPixelPercent.toFixed(0)}% of sampled pixels · mean NBR {burnScar.meanNBR.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Computed from real B08 (NIR) / B12 (SWIR) reflectance, scene {burnScar.sceneId}
                      {burnScar.datetime ? ` (${new Date(burnScar.datetime).toLocaleDateString()})` : ''} · {burnScar.validPixelCount} valid pixels sampled.
                      Single-date NBR proxy, not a calibrated pre/post-fire dNBR severity map.
                    </div>
                  </div>
                )}

                {!burnScar && !burnScarError && !burnScarLoading && (
                  <div className="text-[10px] text-slate-500">
                    Pulls the actual near-infrared and shortwave-infrared band files for this scene (not the thumbnail) and computes the Normalized Burn Ratio - the standard remote-sensing index for charred/burned ground.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scenes */}
          <div className="lg:col-span-4 space-y-2">
            <div className="text-[10px] uppercase text-slate-400 font-bold">Latest Sentinel-2 L2A scenes</div>
            {loading && (
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Querying Copernicus catalog…
              </div>
            )}
            {error && <div className="text-rose-400">{error}</div>}
            {!loading && !error && scenes.length === 0 && <div className="text-slate-500">No recent low-cloud scenes found here.</div>}
            <div className="grid grid-cols-2 gap-2">
              {scenes.map((s) => (
                <div key={s.id} className="rounded-lg overflow-hidden border border-white/10 bg-black/30">
                  {s.thumbnail ? (
                    <img src={s.thumbnail} alt={s.id} loading="lazy" className="w-full h-24 object-cover" />
                  ) : (
                    <div className="w-full h-24 flex items-center justify-center text-slate-600"><MapPin className="w-5 h-5" /></div>
                  )}
                  <div className="p-1.5 text-[10px] text-slate-400 space-y-0.5">
                    <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(s.datetime).toLocaleDateString()}</div>
                    <div className="flex items-center gap-1"><Cloud className="w-3 h-3" />{s.cloudCover != null ? `${s.cloudCover.toFixed(0)}% cloud` : 'n/a'} · {s.platform}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
