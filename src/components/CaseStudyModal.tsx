import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { FlaskConical, X, Loader2, Flame, Info, Factory, TreePine, TriangleAlert } from 'lucide-react';

interface CaseDef {
  id: string;
  title: string;
  location: string;
  kind: 'industrial-fire' | 'wildfire' | 'persistent-source';
  summary: string;
  center: [number, number];
  bbox: [number, number, number, number];
  sources: string[];
  startDate: string;
  days: number;
  expectedClass: 'industrial' | 'natural';
}

interface CaseDetection {
  lat: number;
  lon: number;
  frp: number;
  date: string;
  time: string;
  satellite: string;
}

interface CaseResult {
  def: CaseDef;
  stats: {
    totalDetections: number;
    distinctDays: number;
    firstSeen: string;
    lastSeen: string;
    peakFrpMW: number;
    meanFrpMW: number;
    perDay: Record<string, number>;
  };
  focus: { latitude: number; longitude: number };
  nearestFacility: { name: string; type: string; distanceKm: number } | null;
  osmLanduse: string;
  landuseSource: 'live' | 'recorded';
  landuseRecordedAt?: string;
  fireType: string;
  isIndustrial: boolean;
  confidence: number | null;
  reasons: string[];
  agreesWithRecord: boolean;
  detections: CaseDetection[];
  sampled: boolean;
}

interface CaseStudyModalProps {
  onClose: () => void;
}

const KIND_LABEL: Record<CaseDef['kind'], string> = {
  'industrial-fire': 'Industrial fire',
  wildfire: 'Forest wildfire',
  'persistent-source': 'Steady industrial source',
};

function frpColor(frp: number): string {
  if (frp >= 50) return '#ef4444';
  if (frp >= 10) return '#f97316';
  return '#f59e0b';
}

export const CaseStudyModal: React.FC<CaseStudyModalProps> = ({ onClose }) => {
  const [cases, setCases] = useState<CaseDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<CaseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Case list
  useEffect(() => {
    fetch('/api/case-studies')
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data.length > 0) {
          setCases(d.data);
          setSelectedId(d.data[0].id);
        } else {
          setError('Could not load the case-study list.');
        }
      })
      .catch(() => setError('Could not reach the server.'));
  }, []);

  // Map
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: false }).setView([30, -95], 4);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      maxNativeZoom: 16,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Load the selected case (computed live from NASA's archive on the server)
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    fetch(`/api/case-studies/${selectedId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success) setResult(d.data);
        else setError(d.error || 'The case study could not be computed.');
      })
      .catch(() => !cancelled && setError('Could not reach the server.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId, retryKey]);

  // Draw the archived detections
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!result) return;

    for (const d of result.detections) {
      L.circleMarker([d.lat, d.lon], {
        radius: Math.min(11, 3 + Math.sqrt(d.frp) / 2.2),
        color: frpColor(d.frp),
        weight: 1,
        fillColor: frpColor(d.frp),
        fillOpacity: 0.55,
      })
        .bindTooltip(`${d.frp.toFixed(1)} MW · ${d.date} ${d.time} · ${d.satellite}`)
        .addTo(layer);
    }
    L.circleMarker([result.focus.latitude, result.focus.longitude], {
      radius: 9,
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0,
    })
      .bindTooltip('Hottest detection - where the verdict is judged')
      .addTo(layer);

    const [w, s, e, n] = result.def.bbox;
    map.fitBounds([[s, w], [n, e]], { padding: [16, 16], maxZoom: 13 });
    setTimeout(() => map.invalidateSize(), 50);
  }, [result]);

  const dayEntries: [string, number][] = result ? (Object.entries(result.stats.perDay) as [string, number][]).sort() : [];
  const maxDay = dayEntries.reduce((m, [, v]) => Math.max(m, v), 1);

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-3 font-mono text-slate-100">
      <div className="w-full max-w-6xl max-h-[94vh] bg-slate-950 border border-orange-500/25 rounded-2xl shadow-[0_12px_60px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-3 sm:p-4 border-b border-orange-500/20">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-black/70 border border-emerald-500/40 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white">Real-Incident Case Studies</h2>
              <p className="text-[11px] text-slate-400">
                Documented events replayed from NASA's archive through the same classifier the live dashboard uses
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer flex-shrink-0" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-glass p-3 sm:p-4 space-y-3 text-xs">
          {/* Case picker */}
          <div className="flex flex-wrap gap-2">
            {cases.map((c) => {
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`text-left px-3 py-2 rounded-xl border transition-colors cursor-pointer max-w-full ${
                    active ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-white/10 bg-black/20 hover:border-emerald-500/30'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-slate-100">
                    {c.kind === 'wildfire' ? <TreePine className="w-3.5 h-3.5 text-emerald-400" /> : <Factory className="w-3.5 h-3.5 text-orange-400" />}
                    <span className="truncate">{c.title}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">{KIND_LABEL[c.kind]} · {c.startDate.slice(0, 4)}</div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 min-w-0">
            <div className="lg:col-span-7 space-y-2 min-w-0">
              <div ref={mapEl} className="w-full h-64 sm:h-80 lg:h-[26rem] rounded-xl overflow-hidden border border-white/10 bg-slate-900" />
              <div className="text-[10px] text-slate-500 flex items-center gap-3 flex-wrap">
                <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#f59e0b' }} />&lt; 10 MW</span>
                <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#f97316' }} />10-50 MW</span>
                <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#ef4444' }} />&gt; 50 MW</span>
                <span><span className="inline-block w-2 h-2 rounded-full border border-white mr-1" />Verdict point</span>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3 min-w-0">
              {loading && (
                <div className="flex items-center gap-2 text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Fetching NASA archive and running the classifier...
                </div>
              )}
              {error && (
                <div className="flex items-start gap-1.5 text-rose-400">
                  <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {result && (
                <>
                  <div className="p-3 rounded-xl border border-white/10 bg-black/20 space-y-1.5">
                    <div className="font-bold text-slate-100">{result.def.title}</div>
                    <div className="text-[11px] text-slate-500">{result.def.location}</div>
                    <div className="text-[11px] text-slate-300">{result.def.summary}</div>
                  </div>

                  <div className={`p-3 rounded-xl border space-y-1.5 ${result.agreesWithRecord ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
                    <div className="flex items-center gap-1.5 font-bold">
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                      {result.isIndustrial ? 'Classified as INDUSTRIAL' : result.fireType === 'WILDFIRE' ? 'Classified as NATURAL (wildfire)' : 'Not determined'}
                    </div>
                    <div className={`text-[11px] ${result.agreesWithRecord ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {result.agreesWithRecord
                        ? '✓ Agrees with what actually happened'
                        : result.osmLanduse === 'unknown'
                          ? 'The OpenStreetMap land-use service did not answer, so this case could not be fully classified.'
                          : '✗ Does not match what actually happened'}
                    </div>
                    {!result.agreesWithRecord && result.osmLanduse === 'unknown' && (
                      <button
                        onClick={() => setRetryKey((k) => k + 1)}
                        className="px-2.5 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[11px] font-bold hover:bg-amber-500/20 cursor-pointer"
                      >
                        Try again
                      </button>
                    )}
                  </div>

                  <div className="p-3 rounded-xl border border-white/10 bg-black/20 space-y-1.5">
                    <div className="font-bold text-slate-200">Why the system decided this</div>
                    <ul className="space-y-1 text-[11px] text-slate-300 list-disc pl-4">
                      {result.reasons.map((r, i) => (
                        <li key={i} className={r.startsWith('Verdict:') ? 'font-bold text-orange-400 list-none -ml-4' : ''}>{r}</li>
                      ))}
                    </ul>
                    {result.landuseSource === 'recorded' && (
                      <div className="text-[10px] text-amber-400">
                        The OpenStreetMap land-use service was unreachable just now, so the land-use line above is a real answer recorded earlier
                        {result.landuseRecordedAt ? ` (${result.landuseRecordedAt.slice(0, 10)})` : ''}. The NASA detections and the classification are live.
                      </div>
                    )}
                  </div>

                  <div className="p-3 rounded-xl border border-white/10 bg-black/20 space-y-2">
                    <div className="font-bold text-slate-200">Real NASA detections</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-400">
                      <span>Detections</span><span className="text-slate-200 font-bold">{result.stats.totalDetections.toLocaleString()}</span>
                      <span>Days observed</span><span className="text-slate-200 font-bold">{result.stats.distinctDays}</span>
                      <span>Peak power</span><span className="text-slate-200 font-bold">{result.stats.peakFrpMW} MW</span>
                      <span>Window</span><span className="text-slate-200 font-bold">{result.stats.firstSeen} to {result.stats.lastSeen}</span>
                    </div>
                    <div className="space-y-1">
                      {dayEntries.map(([day, n]) => (
                        <div key={day} className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span className="w-16 flex-shrink-0">{day.slice(5)}</span>
                          <div className="flex-1 h-1.5 bg-white/5 rounded">
                            <div className="h-1.5 rounded bg-orange-500/70" style={{ width: `${(n / maxDay) * 100}%` }} />
                          </div>
                          <span className="w-10 text-right">{n}</span>
                        </div>
                      ))}
                    </div>
                    {result.sampled && (
                      <div className="text-[10px] text-slate-500">The map shows a 600-point sample (all strong detections plus an even spread); the numbers above use every detection.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-500/5 text-[11px] text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-sky-400">
              <Info className="w-3.5 h-3.5" />
              How much to trust this
            </div>
            <p>
              Detections are real archived NASA VIIRS data, and the verdict is computed live: nothing is pre-written. The classifier
              combines distance to known facilities, OpenStreetMap land use, persistence and radiative power with a gradient-boosted model.
              That model was trained on rule-simulated examples, because no public labelled dataset of fire types exists, so it reproduces expert
              rules rather than being validated on verified incidents. Three cases are a sanity check, not an accuracy score.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
