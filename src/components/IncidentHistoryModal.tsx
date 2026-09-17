import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  History,
  Database,
  RefreshCw,
  X,
  Flame,
  TriangleAlert,
  Camera,
  TreePine,
  Building2,
  CircleHelp,
  Pickaxe,
  Wind,
  Repeat,
  MapPin,
} from 'lucide-react';

interface StoredFireDetection {
  id: number;
  detection_id: string;
  fire_type: string;
  satellite: string;
  confidence: string;
  latitude: number;
  longitude: number;
  brightness_k: number;
  frp_mw: number;
  wind_speed_kmh: number;
  wind_direction_deg: number;
  facility_name: string | null;
  facility_region: string | null;
  facility_country: string | null;
  hazard_level: string | null;
  distance_km: number | null;
  threat_score: number | null;
  threat_level: string | null;
  time_to_impact_hours: number | null;
  recorded_at: string;
}

interface PersistentSource {
  gridCell: string;
  latitude: number;
  longitude: number;
  facilityName: string | null;
  fireType: string;
  distinctDaysObserved: number;
  detectionCount: number;
  maxFrpMw: number;
  worstThreatLevel: string | null;
  firstSeen: string;
  lastSeen: string;
}

interface CitizenReport {
  id: number;
  reporter_name: string | null;
  description: string;
  landmark: string | null;
  photo_url: string | null;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string;
}

interface IncidentHistoryModalProps {
  onClose: () => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-rose-400 border-rose-500/40 bg-rose-500/10',
  HIGH: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  ELEVATED: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  WATCH: 'text-slate-400 border-slate-500/40 bg-slate-500/10',
};

const FIRE_TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  WILDFIRE: { label: 'Wildfire', icon: TreePine, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  URBAN_FIRE: { label: 'Urban Fire', icon: Building2, color: 'text-rose-400 border-rose-500/30 bg-rose-500/10' },
  UNCLASSIFIED: { label: 'Unclassified', icon: CircleHelp, color: 'text-slate-400 border-slate-500/30 bg-slate-500/10' },
  GAS_FLARE: { label: 'Gas Flare', icon: Flame, color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  MINING_THERMAL: { label: 'Mining Thermal', icon: Pickaxe, color: 'text-amber-500 border-amber-600/30 bg-amber-600/10' },
};

type TabKey = 'all' | 'critical' | 'persistent' | 'citizen';

export const IncidentHistoryModal: React.FC<IncidentHistoryModalProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [rows, setRows] = useState<StoredFireDetection[]>([]);
  const [persistentSources, setPersistentSources] = useState<PersistentSource[]>([]);
  const [citizenReports, setCitizenReports] = useState<CitizenReport[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [historyRes, persistentRes, citizenRes] = await Promise.all([
        fetch('/api/thermal/history?limit=1000'),
        fetch('/api/thermal/persistent'),
        fetch('/api/citizen-reports'),
      ]);
      const [historyData, persistentData, citizenData] = await Promise.all([
        historyRes.json(),
        persistentRes.json(),
        citizenRes.json(),
      ]);

      setConfigured(historyData.configured !== false);
      if (historyData.success) {
        setRows(historyData.data);
        setError(null);
      } else {
        setError(historyData.error || 'Failed to load stored fire detections.');
      }
      if (persistentData.success) {
        setPersistentSources(persistentData.data);
      }
      if (citizenData.success) {
        setCitizenReports(citizenData.data);
      }
    } catch (err) {
      setError('Failed to reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const criticalRows = useMemo(() => rows.filter((r) => r.threat_level === 'CRITICAL'), [rows]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      WILDFIRE: 0,
      URBAN_FIRE: 0,
      UNCLASSIFIED: 0,
      GAS_FLARE: 0,
      MINING_THERMAL: 0,
    };
    rows.forEach((r) => {
      const key = r.fire_type && counts[r.fire_type] !== undefined ? r.fire_type : 'UNCLASSIFIED';
      counts[key] += 1;
    });
    return counts;
  }, [rows]);

  const visibleRows = activeTab === 'critical' ? criticalRows : rows;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 font-mono text-slate-100">
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-slate-950 border border-orange-500/25 rounded-2xl shadow-[0_12px_60px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-orange-500/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-black/70 border border-orange-500/40 flex items-center justify-center text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.3)] flex-shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-white">Incident History</h2>
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase">
                  <Database className="w-2.5 h-2.5" />
                  Supabase
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Durable record of fire data & simulated dispatches - survives server restarts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={fetchAll}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center flex-wrap gap-1 px-4 pt-3 pb-3 bg-black/30 border-b border-white/10">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'all' ? 'border-orange-500 text-orange-400' : 'border-transparent text-slate-300 hover:text-slate-100'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            All Fire Data ({rows.length})
          </button>
          <button
            onClick={() => setActiveTab('critical')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'critical' ? 'border-rose-500 text-rose-400' : 'border-transparent text-slate-300 hover:text-slate-100'
            }`}
          >
            <TriangleAlert className="w-3.5 h-3.5" />
            Critical Alerts ({criticalRows.length})
          </button>
          <button
            onClick={() => setActiveTab('persistent')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'persistent' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-300 hover:text-slate-100'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            Persistent Sources ({persistentSources.length})
          </button>
          <button
            onClick={() => setActiveTab('citizen')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'citizen' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-300 hover:text-slate-100'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Citizen Reports ({citizenReports.length})
          </button>
        </div>

        {/* Category chips */}
        {(activeTab === 'all' || activeTab === 'critical') && (
          <div className="flex items-center flex-wrap gap-1.5 px-4 py-3 border-b border-white/5">
            {Object.entries(FIRE_TYPE_META).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <span
                  key={key}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold whitespace-nowrap ${meta.color}`}
                >
                  <Icon className="w-3 h-3" />
                  {meta.label}: {categoryCounts[key]}
                </span>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-glass p-2">
          {!configured ? (
            <div className="py-10 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <Database className="w-6 h-6 text-slate-600" />
              <span>Supabase is not configured on the server.</span>
              <span className="text-slate-600">Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to enable storage.</span>
            </div>
          ) : error ? (
            <div className="py-10 text-center text-rose-400 text-xs">{error}</div>
          ) : activeTab === 'persistent' ? (
            persistentSources.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                <Repeat className="w-6 h-6 text-slate-600" />
                <span>{loading ? 'Loading persistent sources…' : 'No recurring thermal sources detected yet.'}</span>
                <span className="text-slate-600">A location needs 3+ distinct satellite acquisition dates to qualify.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {persistentSources.map((src) => {
                  const typeMeta = FIRE_TYPE_META[src.fireType] || FIRE_TYPE_META.UNCLASSIFIED;
                  const TypeIcon = typeMeta.icon;
                  const severityClass = src.worstThreatLevel ? SEVERITY_COLOR[src.worstThreatLevel] || SEVERITY_COLOR.WATCH : SEVERITY_COLOR.WATCH;
                  return (
                    <div key={src.gridCell} className="p-3 rounded-xl bg-black/20 border border-white/5 hover:border-amber-500/20 transition-colors flex flex-col sm:flex-row sm:items-start gap-3 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase">
                            <Repeat className="w-2.5 h-2.5" />
                            {src.distinctDaysObserved} days observed
                          </span>
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${severityClass}`}>
                            {src.worstThreatLevel || 'WATCH'}
                          </span>
                          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold ${typeMeta.color}`}>
                            <TypeIcon className="w-2.5 h-2.5" />
                            {typeMeta.label}
                          </span>
                          <span className="text-slate-200 font-bold truncate">
                            {src.facilityName || 'Unassigned Region'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" />
                          {src.latitude.toFixed(2)}, {src.longitude.toFixed(2)}
                          {' · First seen '}{new Date(src.firstSeen).toLocaleDateString()}
                          {' · Last seen '}{new Date(src.lastSeen).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1 justify-end">
                            <Flame className="w-2.5 h-2.5" />Peak FRP
                          </div>
                          <div className="text-orange-400 font-bold">{src.maxFrpMw.toFixed(0)} MW</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500 uppercase">Detections</div>
                          <div className="text-slate-200 font-bold">{src.detectionCount}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : activeTab === 'citizen' ? (
            citizenReports.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                <Camera className="w-6 h-6 text-slate-600" />
                <span>No citizen reports yet.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {citizenReports.map((r) => (
                  <div key={r.id} className="p-3 rounded-xl bg-black/20 border border-white/5 hover:border-sky-500/20 transition-colors flex items-start gap-3 text-xs">
                    {r.photo_url && (
                      <img
                        src={r.photo_url}
                        alt="Citizen-submitted fire sighting"
                        className="w-16 h-16 rounded-lg object-cover border border-white/10 flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-400 text-[9px] font-bold uppercase">
                          {r.status}
                        </span>
                        <span className="text-slate-200 font-bold">{r.reporter_name || 'Anonymous'}</span>
                        {r.landmark && <span className="text-slate-500">· near {r.landmark}</span>}
                      </div>
                      {r.description && <div className="text-slate-400 mt-0.5">{r.description}</div>}
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)} · {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : visibleRows.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-xs">
              {loading ? 'Loading stored detections…' : 'No detections stored yet.'}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleRows.map((row) => {
                const severityClass = row.threat_level ? SEVERITY_COLOR[row.threat_level] || SEVERITY_COLOR.WATCH : SEVERITY_COLOR.WATCH;
                const typeMeta = FIRE_TYPE_META[row.fire_type] || FIRE_TYPE_META.UNCLASSIFIED;
                const TypeIcon = typeMeta.icon;
                return (
                  <div key={row.id} className="p-3 rounded-xl bg-black/20 border border-white/5 hover:border-orange-500/20 transition-colors flex flex-col sm:flex-row sm:items-start gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase ${severityClass}`}>
                          {row.threat_level || 'WATCH'}
                        </span>
                        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold ${typeMeta.color}`}>
                          <TypeIcon className="w-2.5 h-2.5" />
                          {typeMeta.label}
                        </span>
                        <span className="text-slate-200 font-bold truncate">
                          {row.facility_name || 'Unassigned Region'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {row.facility_region ? `${row.facility_region}, ${row.facility_country}` : `${row.latitude.toFixed(3)}, ${row.longitude.toFixed(3)}`}
                        {' · '}{row.satellite} ({row.confidence})
                        {' · '}{new Date(row.recorded_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1 justify-end">
                          <Flame className="w-2.5 h-2.5" />FRP
                        </div>
                        <div className="text-orange-400 font-bold">{row.frp_mw.toFixed(0)} MW</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-slate-500 uppercase">Brightness</div>
                        <div className="text-slate-200 font-bold">{row.brightness_k.toFixed(1)} K</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1 justify-end">
                          <Wind className="w-2.5 h-2.5" />Wind
                        </div>
                        <div className="text-slate-200 font-bold">{row.wind_speed_kmh} km/h</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-slate-500 uppercase">Perimeter</div>
                        <div className="text-slate-200 font-bold">{row.distance_km != null ? `${row.distance_km.toFixed(1)} km` : 'N/A'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] text-slate-500 uppercase">ETA</div>
                        <div className="text-slate-200 font-bold">{row.time_to_impact_hours != null ? `${row.time_to_impact_hours}h` : 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
