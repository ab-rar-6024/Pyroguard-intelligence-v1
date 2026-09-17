import React from 'react';
import {
  Flame,
  AlertTriangle,
  ShieldAlert,
  Radio,
  Settings,
  Download,
  Layers,
  Activity,
  Zap,
  Search,
  RefreshCw,
  X,
  Sun,
  Moon,
  History,
  MapPinPlus
} from 'lucide-react';
import { ThermalAnomaly, EmergencyAlert, FIRMSFeedStatus, AppTheme } from '../types';

interface HeaderHUDProps {
  theme: AppTheme;
  onToggleTheme: () => void;
  anomalies: ThermalAnomaly[];
  alerts: EmergencyAlert[];
  firmsStatus?: FIRMSFeedStatus | null;
  isRefreshingSatellites?: boolean;
  onRefreshSatellites?: () => void;
  onOpenThresholds: () => void;
  onOpenExport: () => void;
  onOpenFastAPI?: () => void;
  onOpenWidgets: () => void;
  onOpenIndiaCommand?: () => void;
  onOpenIncidentHistory: () => void;
  onOpenReportSighting: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedSeverity: string;
  onSeverityChange: (severity: string) => void;
}

export const HeaderHUD: React.FC<HeaderHUDProps> = ({
  theme,
  onToggleTheme,
  anomalies,
  alerts,
  firmsStatus,
  isRefreshingSatellites,
  onRefreshSatellites,
  onOpenThresholds,
  onOpenExport,
  onOpenWidgets,
  onOpenIndiaCommand,
  onOpenIncidentHistory,
  onOpenReportSighting,
  searchTerm,
  onSearchChange,
  selectedSeverity,
  onSeverityChange,
}) => {
  const criticalThreats = anomalies.filter(
    (a) => a.nearestFacility?.threatLevel === 'CRITICAL'
  );
  const highThreats = anomalies.filter(
    (a) => a.nearestFacility?.threatLevel === 'HIGH'
  );
  const totalFRP = Math.round(anomalies.reduce((sum, a) => sum + a.frp, 0));
  const activeDispatches = alerts.filter(a => a.status === 'DISPATCHED').length;

  return (
    <header className="bg-black/75 backdrop-blur-2xl border-b border-orange-500/20 px-2.5 sm:px-4 py-2 sm:py-2.5 sticky top-0 z-40 shadow-[0_4px_30px_rgba(0,0,0,0.85)]">
      <div className="max-w-[1920px] mx-auto flex flex-col xl:flex-row items-center justify-between gap-2.5 sm:gap-3">

        {/* Brand & System Status */}
        <div className="flex items-center gap-2 sm:gap-3 w-full xl:w-auto justify-between">
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Brand Logo */}
            <div
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden shadow-[0_0_20px_rgba(249,115,22,0.4)] border border-orange-500/40 flex-shrink-0 select-none"
            >
              <img
                key={theme}
                src={theme === 'dark' ? '/logo/dark-logo.svg' : '/logo/light-logo.svg'}
                alt={theme === 'dark' ? 'PyroGuard Dark Logo' : 'PyroGuard Light Logo'}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Brand Title */}
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className={`font-extrabold text-sm sm:text-base tracking-wider uppercase font-mono ${theme === 'light' ? 'text-slate-950' : 'text-white'}`}>
                  PYRO<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-400 glow-orange">GUARD</span>
                </span>
              </div>
              <p className={`text-[10px] sm:text-[11px] hidden md:block font-mono ${theme === 'light' ? 'text-slate-700 font-bold' : 'text-slate-400'}`}>
                Industrial Fire Early-Warning Engine
              </p>
            </div>
          </div>

          {/* Manual Sync Button */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {onRefreshSatellites && (
              <button
                onClick={onRefreshSatellites}
                disabled={isRefreshingSatellites}
                title="Scan latest NASA FIRMS satellite passes"
                className={`p-1 sm:p-1.5 rounded-md border transition-all disabled:opacity-50 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center ${
                  theme === 'light'
                    ? 'bg-white border-orange-300 text-slate-700 hover:text-orange-600 hover:border-orange-500 shadow-sm'
                    : 'bg-black/60 backdrop-blur-md border-white/10 text-slate-400 hover:text-orange-400 hover:border-orange-500/40 hover:shadow-[0_0_12px_rgba(249,115,22,0.25)]'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSatellites ? 'animate-spin text-orange-500' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Tactical HUD Telemetry Metrics */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap shrink-0 overflow-x-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">

          {/* Critical Red Zone Breaches */}
          <div
            onClick={() => onSeverityChange(selectedSeverity === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
            className={`cursor-pointer px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border backdrop-blur-md transition-all flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${
              theme === 'light'
                ? 'bg-rose-50 border-rose-300 text-slate-900 hover:bg-rose-100 shadow-sm'
                : (criticalThreats.length > 0
                  ? 'bg-rose-950/30 border-rose-500/40 text-rose-300 hover:bg-rose-900/40 hover:border-rose-400 hover:shadow-[0_0_18px_rgba(244,63,94,0.3)]'
                  : 'bg-black/50 border-white/10 text-slate-400')
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 flex-shrink-0" />
            <div>
              <div className={`text-[9px] sm:text-[10px] uppercase font-mono leading-tight whitespace-nowrap ${theme === 'light' ? 'text-slate-800 font-bold' : 'text-slate-400'}`}>Red Zone</div>
              <div className={`text-xs sm:text-sm font-black font-mono leading-tight whitespace-nowrap ${theme === 'light' ? 'text-rose-700' : 'text-rose-400'}`}>
                {criticalThreats.length} <span className={`text-[9px] sm:text-[10px] ${theme === 'light' ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>sites</span>
              </div>
            </div>
          </div>

          {/* High Warning Sites */}
          <div
            onClick={() => onSeverityChange(selectedSeverity === 'HIGH' ? 'ALL' : 'HIGH')}
            className={`cursor-pointer px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border backdrop-blur-md transition-all flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${
              theme === 'light'
                ? 'bg-amber-50 border-amber-300 text-slate-900 hover:bg-amber-100 shadow-sm'
                : 'bg-black/50 border-amber-500/30 text-slate-300 hover:border-amber-400/70 hover:bg-amber-950/20 hover:shadow-[0_0_16px_rgba(245,158,11,0.25)]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 flex-shrink-0" />
            <div>
              <div className={`text-[9px] sm:text-[10px] uppercase font-mono leading-tight whitespace-nowrap ${theme === 'light' ? 'text-slate-800 font-bold' : 'text-slate-400'}`}>High Risk</div>
              <div className={`text-xs sm:text-sm font-black font-mono leading-tight whitespace-nowrap ${theme === 'light' ? 'text-amber-800' : 'text-amber-400'}`}>
                {highThreats.length} <span className={`text-[9px] sm:text-[10px] ${theme === 'light' ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>sites</span>
              </div>
            </div>
          </div>

          {/* Total Cumulative FRP */}
          <div className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border backdrop-blur-md flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${
            theme === 'light'
              ? 'bg-orange-50 border-orange-300 text-slate-900 shadow-sm'
              : 'bg-black/50 border-orange-500/30 text-slate-300 shadow-[0_0_15px_rgba(249,115,22,0.12)]'
          }`}>
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500 flex-shrink-0" />
            <div>
              <div className={`text-[9px] sm:text-[10px] uppercase font-mono leading-tight whitespace-nowrap ${theme === 'light' ? 'text-slate-800 font-bold' : 'text-slate-400'}`}>Total Power</div>
              <div className={`text-xs sm:text-sm font-black font-mono leading-tight whitespace-nowrap ${theme === 'light' ? 'text-orange-700' : 'text-orange-400'}`}>
                {totalFRP.toLocaleString()} <span className={`text-[9px] sm:text-[10px] ${theme === 'light' ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>MW</span>
              </div>
            </div>
          </div>

          {/* Active Responders Dispatched */}
          <div className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border backdrop-blur-md flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ${
            theme === 'light'
              ? 'bg-blue-50 border-blue-300 text-slate-900 shadow-sm'
              : 'bg-black/50 border-blue-500/30 text-slate-300'
          }`}>
            <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500 flex-shrink-0" />
            <div>
              <div className={`text-[9px] sm:text-[10px] uppercase font-mono leading-tight whitespace-nowrap ${theme === 'light' ? 'text-slate-800 font-bold' : 'text-slate-400'}`}>Dispatches</div>
              <div className={`text-xs sm:text-sm font-black font-mono leading-tight whitespace-nowrap ${theme === 'light' ? 'text-blue-800' : 'text-blue-400'}`}>
                {activeDispatches} <span className={`text-[9px] sm:text-[10px] ${theme === 'light' ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>units</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search, Severity Filter & Power Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full xl:w-auto justify-between sm:justify-end flex-wrap sm:flex-nowrap">

          {/* Quick Search */}
          <div className="relative flex-1 sm:w-44 lg:w-48 min-w-[140px]">
            <Search className={`w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${theme === 'light' ? 'text-orange-600' : 'text-orange-400/70'}`} />
            <input
              type="text"
              placeholder="Search facility..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`w-full rounded-lg pl-8 pr-7 py-1.5 text-xs focus:outline-none transition-all font-mono ${
                theme === 'light'
                  ? 'bg-white border border-orange-400 text-slate-900 placeholder-slate-500 font-semibold focus:border-orange-500 focus:ring-1 focus:ring-orange-500 shadow-sm'
                  : 'bg-black/60 backdrop-blur-md border border-orange-500/25 text-slate-200 placeholder-slate-500 focus:border-orange-400 focus:shadow-[0_0_15px_rgba(249,115,22,0.3)]'
              }`}
            />
            {searchTerm && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-400 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Light / Dark Theme Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              className={`relative flex items-center w-14 h-8 sm:w-16 sm:h-9 rounded-full border transition-colors cursor-pointer flex-shrink-0 ${
                theme === 'light'
                  ? 'bg-orange-50 border-orange-300'
                  : 'bg-black/60 border-white/10'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-6 h-6 sm:w-7 sm:h-7 rounded-full shadow-md flex items-center justify-center transition-transform duration-300 ${
                  theme === 'light'
                    ? 'translate-x-0 bg-white text-orange-500'
                    : 'translate-x-6 sm:translate-x-7 bg-slate-900 text-orange-400'
                }`}
              >
                {theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </span>
            </button>

            {/* India Command Center Dedicated Button */}
            {onOpenIndiaCommand && (
              <button
                onClick={onOpenIndiaCommand}
                title="India Bharat Industrial Safety & NDRF Hub"
                className={`india-hub-btn flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-mono font-black transition-all cursor-pointer min-h-[36px] ${
                  theme === 'light'
                    ? 'border-orange-500 text-slate-950 shadow-[0_2px_8px_rgba(234,88,12,0.18)] hover:shadow-[0_4px_14px_rgba(234,88,12,0.25)]'
                    : 'bg-gradient-to-r from-orange-500/20 via-black/70 to-emerald-500/20 border-orange-500/40 hover:border-orange-400 text-orange-300 hover:text-white shadow-[0_0_15px_rgba(249,115,22,0.2)] hover:shadow-[0_0_20px_rgba(249,115,22,0.35)]'
                }`}
              >
                <span className="text-sm">🇮🇳</span>
                <span className={`hidden sm:inline ${theme === 'light' ? 'text-slate-950 font-black tracking-wide' : 'text-orange-300'}`}>India Hub</span>
              </button>
            )}

            {/* Thresholds Settings */}
            <button
              onClick={onOpenThresholds}
              title="Configure Alert Thresholds"
              className={`p-1.5 sm:p-2 rounded-lg border transition-all min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer ${
                theme === 'light'
                  ? 'bg-white border-orange-300 text-slate-800 hover:text-orange-600 hover:border-orange-500 shadow-sm'
                  : 'bg-black/50 backdrop-blur-md border-white/10 text-slate-300 hover:text-orange-400 hover:border-orange-500/40 hover:shadow-[0_0_12px_rgba(249,115,22,0.2)]'
              }`}
            >
              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* GIS & Audit Export */}
            <button
              onClick={onOpenExport}
              title="Audit & GIS Export"
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-black font-bold text-xs shadow-[0_0_18px_rgba(249,115,22,0.4)] hover:shadow-[0_0_25px_rgba(249,115,22,0.6)] hover:brightness-110 transition-all cursor-pointer min-h-[36px] border border-orange-400/50"
            >
              <Download className="w-3.5 h-3.5 flex-shrink-0 text-black" />
              <span className="hidden xs:inline">Audit & GIS</span>
              <span className="xs:hidden">Export</span>
            </button>

            {/* Incident History (Supabase-backed) */}
            <button
              onClick={onOpenIncidentHistory}
              title="Incident History (Supabase)"
              className={`p-1.5 sm:p-2 rounded-lg border transition-all min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer ${
                theme === 'light'
                  ? 'bg-white border-orange-300 text-slate-800 hover:text-orange-600 hover:border-orange-500 shadow-sm'
                  : 'bg-black/50 backdrop-blur-md border-white/10 text-slate-300 hover:text-orange-400 hover:border-orange-500/40 hover:shadow-[0_0_12px_rgba(249,115,22,0.2)]'
              }`}
            >
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Report a Fire Sighting (citizen ground-truth report) */}
            <button
              onClick={onOpenReportSighting}
              title="Report a Fire Sighting"
              className={`p-1.5 sm:p-2 rounded-lg border transition-all min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer ${
                theme === 'light'
                  ? 'bg-white border-orange-300 text-slate-800 hover:text-orange-600 hover:border-orange-500 shadow-sm'
                  : 'bg-black/50 backdrop-blur-md border-white/10 text-slate-300 hover:text-orange-400 hover:border-orange-500/40 hover:shadow-[0_0_12px_rgba(249,115,22,0.2)]'
              }`}
            >
              <MapPinPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Widget Layout Toggle */}
            <button
              onClick={onOpenWidgets}
              title="Customize Widgets"
              className={`p-1.5 sm:p-2 rounded-lg border transition-all min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer ${
                theme === 'light'
                  ? 'bg-white border-orange-300 text-slate-800 hover:text-orange-600 hover:border-orange-500 shadow-sm'
                  : 'bg-black/50 backdrop-blur-md border-white/10 text-slate-300 hover:text-orange-400 hover:border-orange-500/40 hover:shadow-[0_0_12px_rgba(249,115,22,0.2)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

      </div>
    </header>
  );
};
