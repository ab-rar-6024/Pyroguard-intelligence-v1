import React, { useState } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Flame, 
  Wind, 
  ExternalLink, 
  Radio, 
  BrainCircuit, 
  ArrowUpDown,
  Filter,
  CheckCircle,
  Clock,
  Compass
} from 'lucide-react';
import { ThermalAnomaly, IndustrialFacility } from '../types';

interface ThreatMatrixWidgetProps {
  anomalies: ThermalAnomaly[];
  onSelectAnomaly: (anomaly: ThermalAnomaly) => void;
  onSelectFacility: (facility: IndustrialFacility) => void;
  onOpenEvacAdvisor: (anomaly: ThermalAnomaly, facility: IndustrialFacility) => void;
  onTriggerDispatch: (anomaly: ThermalAnomaly, facility: IndustrialFacility) => void;
  selectedSector: string;
  onSectorChange: (sector: string) => void;
  selectedSeverity: string;
  onSeverityChange: (severity: string) => void;
}

export const ThreatMatrixWidget: React.FC<ThreatMatrixWidgetProps> = ({
  anomalies,
  onSelectAnomaly,
  onSelectFacility,
  onOpenEvacAdvisor,
  onTriggerDispatch,
  selectedSector,
  onSectorChange,
  selectedSeverity,
  onSeverityChange,
}) => {
  const [sortField, setSortField] = useState<'threatScore' | 'distance' | 'frp' | 'timeToImpact'>('threatScore');
  const [sortAsc, setSortAsc] = useState(false);

  // Filter only anomalies that are actively mapped to an industrial facility
  let threatList = anomalies.filter((a) => a.nearestFacility);

  // Sector Filter
  if (selectedSector !== 'ALL') {
    threatList = threatList.filter(
      (a) => a.nearestFacility?.facility.type === selectedSector
    );
  }

  // Severity Filter
  if (selectedSeverity !== 'ALL') {
    threatList = threatList.filter(
      (a) => a.nearestFacility?.threatLevel === selectedSeverity
    );
  }

  // Sorting
  threatList.sort((a, b) => {
    const tfA = a.nearestFacility!;
    const tfB = b.nearestFacility!;

    let valA = 0;
    let valB = 0;

    switch (sortField) {
      case 'threatScore':
        valA = tfA.threatScore;
        valB = tfB.threatScore;
        break;
      case 'distance':
        valA = tfA.distanceKm;
        valB = tfB.distanceKm;
        break;
      case 'frp':
        valA = a.frp;
        valB = b.frp;
        break;
      case 'timeToImpact':
        valA = tfA.timeToImpactHours;
        valB = tfB.timeToImpactHours;
        break;
    }

    return sortAsc ? valA - valB : valB - valA;
  });

  const handleSort = (field: 'threatScore' | 'distance' | 'frp' | 'timeToImpact') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SECTORS = [
    { id: 'ALL', label: 'All Global Industrial Sectors' },
    { id: 'oil_refinery', label: 'Petroleum & Crude Refineries' },
    { id: 'lng_terminal', label: 'Cryogenic LNG Terminals' },
    { id: 'chemical_plant', label: 'Specialty Chemicals & Polymers' },
    { id: 'petrol_bunk_hub', label: '⛽ POL Fuel Depots & Retail Hubs' },
    { id: 'nuclear_plant', label: '☢️ Nuclear Power Plants (NPCIL)' },
    { id: 'mining_complex', label: 'Open-Cast Mines & Extraction' },
    { id: 'pipeline_hub', label: 'Strategic Pipeline Transshipment' },
  ];

  const SEVERITIES = [
    { id: 'ALL', label: 'All Threat Tiers', color: 'text-slate-300' },
    { id: 'CRITICAL', label: 'CRITICAL', color: 'text-rose-400' },
    { id: 'HIGH', label: 'HIGH', color: 'text-amber-400' },
    { id: 'ELEVATED', label: 'ELEVATED', color: 'text-yellow-400' },
  ];

  return (
    <div className="glass-panel rounded-2xl p-3 sm:p-4 flex flex-col shadow-[0_12px_40px_rgba(0,0,0,0.85)] border border-orange-500/25">
      
      {/* Widget Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 pb-3 border-b border-orange-500/20">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-black/70 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)] flex-shrink-0">
            <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold font-mono tracking-wide text-white uppercase glow-orange">
              Hazardous Facility Threat Matrix
            </h2>
            <p className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
              Real-time proximity evaluation against global industrial infrastructure
            </p>
          </div>
        </div>

        {/* Sector and Severity Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <select
            value={selectedSector}
            onChange={(e) => onSectorChange(e.target.value)}
            className="flex-1 sm:flex-initial bg-black/70 border border-orange-500/30 text-slate-200 text-[11px] sm:text-xs font-mono rounded-xl px-3 py-1.5 focus:outline-none focus:border-orange-400 focus:shadow-[0_0_12px_rgba(249,115,22,0.25)] transition-all cursor-pointer"
          >
            {SECTORS.map((s) => (
              <option key={s.id} value={s.id} className="bg-slate-950 text-slate-200">
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={selectedSeverity}
            onChange={(e) => onSeverityChange(e.target.value)}
            className="flex-1 sm:flex-initial bg-black/70 border border-orange-500/30 text-slate-200 text-[11px] sm:text-xs font-mono rounded-xl px-3 py-1.5 focus:outline-none focus:border-orange-400 focus:shadow-[0_0_12px_rgba(249,115,22,0.25)] transition-all cursor-pointer"
          >
            {SEVERITIES.map((sev) => (
              <option key={sev.id} value={sev.id} className="bg-slate-950 text-slate-200">
                {sev.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Sorting Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-2 text-[10px] sm:text-[11px] font-mono text-slate-400 border-b border-white/5 px-1">
        <span className="text-slate-400 whitespace-nowrap">Showing <strong className="text-orange-400">{threatList.length}</strong> Active Spatial Hazard Pairs</span>
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0">
          <span className="text-slate-500 flex-shrink-0">Sort By:</span>
          <button
            onClick={() => handleSort('threatScore')}
            className={`cursor-pointer transition-colors flex items-center gap-1 flex-shrink-0 ${sortField === 'threatScore' ? 'text-orange-400 font-bold glow-orange' : 'hover:text-slate-200'}`}
          >
            Risk <ArrowUpDown className="w-3 h-3 inline" />
          </button>
          <button
            onClick={() => handleSort('distance')}
            className={`cursor-pointer transition-colors flex items-center gap-1 flex-shrink-0 ${sortField === 'distance' ? 'text-orange-400 font-bold glow-orange' : 'hover:text-slate-200'}`}
          >
            Dist <ArrowUpDown className="w-3 h-3 inline" />
          </button>
          <button
            onClick={() => handleSort('frp')}
            className={`cursor-pointer transition-colors flex items-center gap-1 flex-shrink-0 ${sortField === 'frp' ? 'text-orange-400 font-bold glow-orange' : 'hover:text-slate-200'}`}
          >
            FRP <ArrowUpDown className="w-3 h-3 inline" />
          </button>
          <button
            onClick={() => handleSort('timeToImpact')}
            className={`cursor-pointer transition-colors flex items-center gap-1 flex-shrink-0 ${sortField === 'timeToImpact' ? 'text-orange-400 font-bold glow-orange' : 'hover:text-slate-200'}`}
          >
            ETA <ArrowUpDown className="w-3 h-3 inline" />
          </button>
        </div>
      </div>

      {/* Threat Cards List */}
      <div className="divide-y divide-white/5 overflow-y-auto max-h-[480px] scrollbar-glass pr-1">
        {threatList.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-mono text-xs flex flex-col items-center gap-3">
            <span>No thermal anomaly breaches detected for the selected filters.</span>
            {(selectedSector !== 'ALL' || selectedSeverity !== 'ALL') && (
              <button
                onClick={() => {
                  onSectorChange('ALL');
                  onSeverityChange('ALL');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-orange-500/20 text-orange-300 border border-orange-500/40 hover:bg-orange-500/30 text-xs font-mono cursor-pointer transition-all shadow-[0_0_15px_rgba(249,115,22,0.2)]"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          threatList.map((item) => {
            const fac = item.nearestFacility!.facility;
            const threat = item.nearestFacility!;
            const level = threat.threatLevel;

            return (
              <div
                key={item.id}
                onClick={() => {
                  onSelectAnomaly(item);
                  onSelectFacility(fac);
                }}
                className="py-3 px-2 sm:px-3 rounded-xl hover:bg-orange-500/10 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-3 group cursor-pointer border border-transparent hover:border-orange-500/30 hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]"
              >
                {/* Facility Info & Hazard Badges */}
                <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0">
                  {/* Risk Score Circle */}
                  <div
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex flex-col items-center justify-center font-mono font-extrabold flex-shrink-0 border shadow-inner ${
                      level === 'CRITICAL'
                        ? 'bg-rose-950/60 border-rose-500/70 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                        : level === 'HIGH'
                        ? 'bg-orange-950/60 border-orange-500/70 text-orange-300 shadow-[0_0_12px_rgba(249,115,22,0.3)]'
                        : 'bg-black/60 border-white/10 text-slate-300'
                    }`}
                  >
                    <span className="text-xs leading-none">{threat.threatScore}</span>
                    <span className="text-[8px] uppercase tracking-tighter text-slate-400">Risk</span>
                  </div>

                  {/* Name and Facility Meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="font-bold text-slate-100 text-xs sm:text-sm truncate font-mono group-hover:text-orange-300 transition-colors">
                        {fac.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider ${
                          level === 'CRITICAL'
                            ? 'bg-rose-950/40 text-rose-300 border border-rose-500/40'
                            : level === 'HIGH'
                            ? 'bg-orange-950/40 text-orange-300 border border-orange-500/40'
                            : 'bg-black/50 text-slate-300 border border-white/10'
                        }`}
                      >
                        {level}
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono">
                        {fac.country} ({fac.region})
                      </span>
                    </div>

                    {/* Stored Chemicals & Responder Unit */}
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1 text-[10px] sm:text-[11px] text-slate-400 font-mono">
                      <span className="text-slate-300">
                        📦 {fac.primaryChemicals.slice(0, 3).join(', ')}
                      </span>
                      <span className="hidden xs:inline">•</span>
                      <span className="text-slate-400">
                        Blast Radius: <strong className="text-rose-400">{fac.blastRadiusKm} km</strong>
                      </span>
                      <span className="hidden sm:inline">•</span>
                      <span className="text-slate-400 hidden sm:inline">
                        Fuel: <strong className="text-orange-300">{(fac.fuelStorageCapacityTons / 1000).toFixed(0)}k tons</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Spatial Proximity & Telemetry Metrics + Actions Responsive Row */}
                <div className="flex items-center justify-between lg:justify-end gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono flex-1 sm:flex-shrink-0 bg-black/70 px-3 py-2 rounded-xl border border-orange-500/20 shadow-inner">
                    <div>
                      <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase">Distance</div>
                      <div
                        className={`font-bold text-xs sm:text-sm ${
                          threat.distanceKm <= fac.blastRadiusKm
                            ? 'text-rose-400 font-extrabold animate-pulse'
                            : 'text-amber-300'
                        }`}
                      >
                        {threat.distanceKm.toFixed(1)} km
                      </div>
                    </div>

                    <div className="border-l border-white/10 pl-2 sm:pl-3">
                      <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase">FRP</div>
                      <div className="font-bold text-orange-400 text-xs sm:text-sm glow-orange">{item.frp.toFixed(0)} MW</div>
                    </div>

                    <div className="border-l border-white/10 pl-2 sm:pl-3">
                      <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase">ETA</div>
                      <div className="font-bold text-slate-200 text-xs sm:text-sm">{threat.timeToImpactHours}h</div>
                    </div>

                    <div className="border-l border-white/10 pl-2 sm:pl-3 hidden md:block">
                      <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase">Wind</div>
                      <div
                        className={`font-semibold ${
                          threat.windSpreadRisk === 'DIRECT'
                            ? 'text-rose-400'
                            : threat.windSpreadRisk === 'CROSSWIND'
                            ? 'text-amber-400'
                            : 'text-sky-400'
                        }`}
                      >
                        {item.windSource === 'unavailable'
                          ? 'Wind n/a'
                          : `${threat.windSpreadRisk} (${item.windSpeedKmh}km/h)`}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        onSelectAnomaly(item);
                        onSelectFacility(fac);
                      }}
                      title="Focus on Map"
                      className="p-2 rounded-xl bg-black/60 hover:bg-black/90 border border-orange-500/25 hover:border-orange-500/50 text-slate-300 hover:text-orange-300 transition-all cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center hover:shadow-[0_0_12px_rgba(249,115,22,0.2)]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onOpenEvacAdvisor(item, fac)}
                      title="AI Threat Intelligence & Incident Co-Pilot"
                      className="p-2 rounded-xl bg-black/60 hover:bg-orange-500/20 border border-orange-500/30 hover:border-orange-400 text-orange-400 transition-all cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center hover:shadow-[0_0_15px_rgba(249,115,22,0.35)]"
                    >
                      <BrainCircuit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onTriggerDispatch(item, fac)}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs font-mono shadow-[0_0_15px_rgba(244,63,94,0.35)] hover:shadow-[0_0_20px_rgba(244,63,94,0.5)] transition-all cursor-pointer min-h-[36px]"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>Dispatch</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
