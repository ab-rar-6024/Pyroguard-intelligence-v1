import React, { useState, useEffect, useCallback } from 'react';
import { HeaderHUD } from './components/HeaderHUD';
import { InteractiveThermalMap } from './components/InteractiveThermalMap';
import { ThreatMatrixWidget } from './components/ThreatMatrixWidget';
import { LiveIncidentFeed } from './components/LiveIncidentFeed';
import { AnalyticsCharts } from './components/AnalyticsCharts';
import { IncidentHistoryModal } from './components/IncidentHistoryModal';
import { ReportFireSightingModal } from './components/ReportFireSightingModal';
import { AIThreatIntelligenceModal } from './components/AIThreatIntelligenceModal';
import { ThresholdSettingsModal } from './components/ThresholdSettingsModal';
import { GISExportModal } from './components/GISExportModal';
import { FastAPICodeViewerModal } from './components/FastAPICodeViewerModal';
import { CustomWidgetDrawer } from './components/CustomWidgetDrawer';
import { IndiaCommandCenterModal } from './components/IndiaCommandCenterModal';
import { 
  ThermalAnomaly, 
  IndustrialFacility, 
  EmergencyAlert, 
  NotificationThresholds, 
  GISLayerConfig, 
  WidgetVisibilityState,
  FIRMSFeedStatus,
  AppTheme
} from './types';
import { GLOBAL_INDUSTRIAL_FACILITIES } from './data/industrialDatabase';
import { generateClientBaselineHotspots, DEFAULT_ACTIVE_ALERTS } from './utils/baselineData';

export default function App() {
  // Theme State
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('pyroguard_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  // Preload both logo variants so the very first theme toggle swaps instantly
  // instead of showing a brief blank/flash while the other SVG fetches.
  useEffect(() => {
    ['/logo/dark-logo.svg', '/logo/light-logo.svg'].forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  // State with instant rich baseline defaults (zero-latency, never empty)
  const [anomalies, setAnomalies] = useState<ThermalAnomaly[]>(() => generateClientBaselineHotspots());
  const [facilities, setFacilities] = useState<IndustrialFacility[]>(() => GLOBAL_INDUSTRIAL_FACILITIES);
  const [alerts, setAlerts] = useState<EmergencyAlert[]>(() => DEFAULT_ACTIVE_ALERTS);
  const [firmsStatus, setFirmsStatus] = useState<FIRMSFeedStatus | null>(null);
  const [isRefreshingSatellites, setIsRefreshingSatellites] = useState(false);
  const [loading, setLoading] = useState(false);

  // Selection
  const [selectedAnomaly, setSelectedAnomaly] = useState<ThermalAnomaly | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<IndustrialFacility | null>(null);

  // Modals & Drawers
  const [showEvacModal, setShowEvacModal] = useState(false);
  const [activeEvacPair, setActiveEvacPair] = useState<{ anomaly: ThermalAnomaly; facility: IndustrialFacility } | null>(null);
  const [showThresholdsModal, setShowThresholdsModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFastAPIModal, setShowFastAPIModal] = useState(false);
  const [showWidgetsDrawer, setShowWidgetsDrawer] = useState(false);
  const [showIndiaModal, setShowIndiaModal] = useState(false);
  const [showIncidentHistory, setShowIncidentHistory] = useState(false);
  const [showReportSighting, setShowReportSighting] = useState(false);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');

  // Thresholds Configuration
  const [thresholds, setThresholds] = useState<NotificationThresholds>({
    maxDistanceKm: 3.5,
    minFrpMW: 30,
    minRiskScore: 65,
    autoDispatchEnabled: true,
    browserPushEnabled: false,
    repeatAlertIntervalMinutes: 10,
  });

  // GIS Configuration
  const [gisConfig, setGisConfig] = useState<GISLayerConfig>(() => ({
    mapStyle: ((localStorage.getItem('pyroguard_theme') === 'light') ? 'light' : 'dark') as 'dark' | 'light',
    showThermalOverlay: true,
    showFacilityMarkers: true,
    showBlastZones: true,
    showWindVectors: true,
    showEvacZones: true,
    showHeatmap: true,
    minFRPFilter: 0,
    selectedFacilityType: 'ALL',
    selectedSeverity: 'ALL',
  }));

  // Sync theme with document class and data-theme attribute
  useEffect(() => {
    localStorage.setItem('pyroguard_theme', theme);
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
    }
  }, [theme]);

  // Toggle theme instantly (CSS-only). The map base layer is intentionally left alone -
  // swapping it here used to trigger a live tile re-fetch from ESRI's servers on every
  // toggle, causing a visible blank-map flash/lag. Map style is still picked independently
  // via the Dark/Satellite quick-toggle or the GIS Overlays menu.
  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Widget Visibility State
  const [widgets, setWidgets] = useState<WidgetVisibilityState>({
    threatMatrix: true,
    liveFeed: true,
    frpChart: true,
    sectorDistribution: true,
    dispatchConsole: true,
    windSpreadPredictor: true,
    systemTelemetry: true,
    complianceStats: true,
  });

  // Fetch initial telemetry
  const fetchData = useCallback(async () => {
    try {
      const [thermalRes, facRes, alertRes] = await Promise.all([
        fetch('/api/thermal/live').catch(() => null),
        fetch('/api/facilities').catch(() => null),
        fetch('/api/alerts').catch(() => null),
      ]);

      if (thermalRes && thermalRes.ok) {
        try {
          const thermalData = await thermalRes.json();
          if (thermalData && thermalData.success && Array.isArray(thermalData.data) && thermalData.data.length > 0) {
            setAnomalies(thermalData.data);
            if (thermalData.firmsStatus) {
              setFirmsStatus(thermalData.firmsStatus);
            }
          }
        } catch (_) {}
      }

      if (facRes && facRes.ok) {
        try {
          const facData = await facRes.json();
          if (facData && facData.success && Array.isArray(facData.data) && facData.data.length > 0) {
            setFacilities(facData.data);
          }
        } catch (_) {}
      }

      if (alertRes && alertRes.ok) {
        try {
          const alertData = await alertRes.json();
          if (alertData && alertData.success && Array.isArray(alertData.data) && alertData.data.length > 0) {
            setAlerts(alertData.data);
          }
        } catch (_) {}
      }

    } catch (err) {
      console.warn('Telemetry sync:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefreshSatellites = async () => {
    setIsRefreshingSatellites(true);
    try {
      const res = await fetch('/api/thermal/refresh', { method: 'POST' });
      const data = await res.json();
      if (data.status) {
        setFirmsStatus(data.status);
      }
      await fetchData();
    } catch (e) {
      console.error('Refresh satellites error:', e);
    } finally {
      setIsRefreshingSatellites(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Monitor thresholds for automatic alerts & emergency responder triggers
  useEffect(() => {
    if (anomalies.length === 0 || facilities.length === 0) return;

    // Check critical threshold breaches
    const criticalHotspots = anomalies.filter(
      (a) =>
        a.nearestFacility &&
        a.nearestFacility.distanceKm <= thresholds.maxDistanceKm &&
        a.frp >= thresholds.minFrpMW &&
        a.nearestFacility.threatScore >= thresholds.minRiskScore
    );

    // Trigger browser notification if permitted
    if (
      criticalHotspots.length > 0 &&
      thresholds.browserPushEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      const topThreat = criticalHotspots[0];
      new Notification(`🚨 PYROGUARD CRITICAL THREAT: ${topThreat.nearestFacility?.facility.name}`, {
        body: `Thermal anomaly detected ${topThreat.nearestFacility?.distanceKm.toFixed(1)} km away (${topThreat.frp} MW). High ignition risk!`,
        icon: '/favicon.ico',
      });
    }
  }, [anomalies, facilities, thresholds]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEvacModal(false);
        setShowThresholdsModal(false);
        setShowExportModal(false);
        setShowFastAPIModal(false);
        setShowWidgetsDrawer(false);
        setShowIncidentHistory(false);
        setShowReportSighting(false);
      } else if (e.key === 'e' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowExportModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Dispatch Emergency Responders Handler
  const handleTriggerDispatch = async (
    anomaly: ThermalAnomaly,
    facility: IndustrialFacility,
    customMessage?: string
  ) => {
    try {
      const res = await fetch('/api/alerts/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityId: facility.id,
          anomalyId: anomaly.id,
          customMessage,
          evacuationPerimeterKm: facility.blastRadiusKm + 1.5,
        }),
      });

      const data = await res.json();
      if (data.success && data.alert) {
        setAlerts((prev) => [data.alert, ...prev]);
      }
    } catch (err) {
      console.error('Dispatch trigger error:', err);
    }
  };

  // Acknowledge Dispatch
  const handleAcknowledgeAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, status: 'ACKNOWLEDGED' } : a))
    );
  };

  // Open Evacuation Strategy Advisor Modal
  const handleOpenEvacAdvisor = (anomaly: ThermalAnomaly, facility: IndustrialFacility) => {
    setActiveEvacPair({ anomaly, facility });
    setShowEvacModal(true);
  };

  // Filtered anomalies by search
  const filteredAnomalies = anomalies.filter((a) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const facName = a.nearestFacility?.facility.name.toLowerCase() || '';
    const facRegion = a.nearestFacility?.facility.region.toLowerCase() || '';
    const facCountry = a.nearestFacility?.facility.country.toLowerCase() || '';
    const sat = a.satellite.toLowerCase();
    return (
      facName.includes(term) ||
      facRegion.includes(term) ||
      facCountry.includes(term) ||
      sat.includes(term) ||
      a.id.toLowerCase().includes(term)
    );
  });

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'light bg-[#f8fafc] text-slate-900' : 'dark bg-[#030508] text-slate-100'} bg-ambient-glow flex flex-col selection:bg-orange-500/40 selection:text-orange-200 relative overflow-x-hidden transition-colors duration-300`}>
      {/* Ambient background tactical glow elements */}
      <div className={`fixed top-0 left-1/4 w-96 h-96 ${theme === 'light' ? 'bg-orange-400/5' : 'bg-orange-600/10'} rounded-full blur-[140px] pointer-events-none -z-10`} />
      <div className={`fixed top-1/3 right-10 w-80 h-80 ${theme === 'light' ? 'bg-amber-300/5' : 'bg-amber-500/5'} rounded-full blur-[120px] pointer-events-none -z-10`} />
      <div className={`fixed bottom-10 left-10 w-96 h-96 ${theme === 'light' ? 'bg-orange-300/5' : 'bg-orange-700/5'} rounded-full blur-[160px] pointer-events-none -z-10`} />
      
      {/* 1. Header & Live Telemetry HUD */}
      <HeaderHUD
        theme={theme}
        onToggleTheme={handleToggleTheme}
        anomalies={anomalies}
        alerts={alerts}
        firmsStatus={firmsStatus}
        isRefreshingSatellites={isRefreshingSatellites}
        onRefreshSatellites={handleRefreshSatellites}
        onOpenThresholds={() => setShowThresholdsModal(true)}
        onOpenExport={() => setShowExportModal(true)}
        onOpenWidgets={() => setShowWidgetsDrawer(true)}
        onOpenIndiaCommand={() => setShowIndiaModal(true)}
        onOpenIncidentHistory={() => setShowIncidentHistory(true)}
        onOpenReportSighting={() => setShowReportSighting(true)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedSeverity={selectedSeverity}
        onSeverityChange={setSelectedSeverity}
      />

      {/* 2. Main Command Center Grid */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto p-3 lg:p-4 space-y-4">
        
        {/* Top Split: Interactive World GIS Map + Live Incident Stream */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          
          {/* Map Column (8 Cols on XL) */}
          <div className="xl:col-span-8 flex flex-col">
            <InteractiveThermalMap
              anomalies={filteredAnomalies}
              facilities={facilities}
              selectedAnomaly={selectedAnomaly}
              selectedFacility={selectedFacility}
              onSelectAnomaly={setSelectedAnomaly}
              onSelectFacility={setSelectedFacility}
              onOpenEvacAdvisor={handleOpenEvacAdvisor}
              onTriggerDispatch={handleTriggerDispatch}
              onOpenIndiaCommand={() => setShowIndiaModal(true)}
              gisConfig={{
                ...gisConfig,
                selectedFacilityType: selectedSector,
                selectedSeverity: selectedSeverity,
              }}
              onUpdateGISConfig={(newCfg) => {
                if (newCfg.selectedFacilityType !== undefined) {
                  setSelectedSector(newCfg.selectedFacilityType);
                }
                if (newCfg.selectedSeverity !== undefined) {
                  setSelectedSeverity(newCfg.selectedSeverity);
                }
                setGisConfig((prev) => ({ ...prev, ...newCfg }));
              }}
            />
          </div>

          {/* Incident Feed & Quick Dispatches (4 Cols on XL) */}
          {widgets.liveFeed && (
            <div className="xl:col-span-4 flex flex-col">
              <LiveIncidentFeed
                anomalies={filteredAnomalies}
                alerts={alerts}
                onSelectAnomaly={setSelectedAnomaly}
                onAcknowledgeAlert={handleAcknowledgeAlert}
              />
            </div>
          )}
        </div>

        {/* Middle Section: Hazardous Facility Threat Matrix */}
        {widgets.threatMatrix && (
          <ThreatMatrixWidget
            anomalies={filteredAnomalies}
            onSelectAnomaly={setSelectedAnomaly}
            onSelectFacility={setSelectedFacility}
            onOpenEvacAdvisor={handleOpenEvacAdvisor}
            onTriggerDispatch={handleTriggerDispatch}
            selectedSector={selectedSector}
            onSectorChange={setSelectedSector}
            selectedSeverity={selectedSeverity}
            onSeverityChange={setSelectedSeverity}
          />
        )}

        {/* Bottom Section: Real-time Analytics & Fire Power Histograms */}
        {widgets.frpChart && (
          <AnalyticsCharts 
            anomalies={filteredAnomalies} 
            onSelectSector={setSelectedSector}
            onSelectAnomaly={setSelectedAnomaly}
            theme={theme}
          />
        )}

      </main>

      {/* Modals and Drawers */}

      {/* AI Threat Intelligence & Incident Co-Pilot Modal */}
      {showEvacModal && activeEvacPair && (
        <AIThreatIntelligenceModal
          anomaly={activeEvacPair.anomaly}
          facility={activeEvacPair.facility}
          onClose={() => setShowEvacModal(false)}
          onTriggerDispatch={handleTriggerDispatch}
        />
      )}

      {/* Threshold Alerts Settings Modal */}
      {showThresholdsModal && (
        <ThresholdSettingsModal
          thresholds={thresholds}
          onSave={setThresholds}
          onClose={() => setShowThresholdsModal(false)}
          onRefreshSatellites={handleRefreshSatellites}
        />
      )}

      {/* GIS Export & Compliance Modal */}
      {showExportModal && (
        <GISExportModal
          anomalies={anomalies}
          facilities={facilities}
          alerts={alerts}
          onClose={() => setShowExportModal(false)}
          onOpenFastAPI={() => setShowFastAPIModal(true)}
        />
      )}

      {/* FastAPI Python Backend Source Viewer Modal */}
      {showFastAPIModal && (
        <FastAPICodeViewerModal onClose={() => setShowFastAPIModal(false)} />
      )}

      {/* Bharat / India Industrial Safety & NDRF Command Center Modal */}
      {showIndiaModal && (
        <IndiaCommandCenterModal
          isOpen={showIndiaModal}
          onClose={() => setShowIndiaModal(false)}
          anomalies={anomalies}
          facilities={facilities}
          onSelectFacility={(fac) => {
            setSelectedFacility(fac);
            setSelectedAnomaly(null);
          }}
          onSelectAnomaly={(anom) => {
            setSelectedAnomaly(anom);
            if (anom.nearestFacility) setSelectedFacility(anom.nearestFacility.facility);
          }}
          onFlyToCoordinates={(lat, lon, zoom) => {
            // Can be passed or handled
            setSelectedAnomaly(null);
          }}
        />
      )}

      {/* Incident History (Supabase-backed durable fire detection log) */}
      {showIncidentHistory && (
        <IncidentHistoryModal onClose={() => setShowIncidentHistory(false)} />
      )}

      {/* Report a Fire Sighting (citizen ground-truth report) */}
      {showReportSighting && (
        <ReportFireSightingModal onClose={() => setShowReportSighting(false)} />
      )}

      {/* Widget Layout Manager Drawer */}
      {showWidgetsDrawer && (
        <CustomWidgetDrawer
          widgets={widgets}
          onToggleWidget={(key) => setWidgets((prev) => ({ ...prev, [key]: !prev[key] }))}
          onResetWidgets={() =>
            setWidgets({
              threatMatrix: true,
              liveFeed: true,
              frpChart: true,
              sectorDistribution: true,
              dispatchConsole: true,
              windSpreadPredictor: true,
              systemTelemetry: true,
              complianceStats: true,
            })
          }
          onClose={() => setShowWidgetsDrawer(false)}
        />
      )}

      {/* Footer */}
      <footer className={`px-4 py-2.5 text-center text-xs font-mono flex flex-col sm:flex-row items-center justify-between gap-2 border-t transition-colors ${
        theme === 'light' ? 'bg-white border-orange-500/20 text-slate-700' : 'bg-slate-950 border-slate-900 text-slate-500'
      }`}>
        <div className="flex items-center gap-2">
          <span className={theme === 'light' ? 'text-slate-900 font-extrabold' : 'text-slate-400 font-bold'}>PYROGUARD v2.4</span>
          <span>•</span>
          <span>NASA FIRMS VIIRS & MODIS Telemetry Engine</span>
          <span>•</span>
          <span>Spatial Proximity & Blast Radius Modeling</span>
        </div>
        <div className={`flex items-center gap-3 text-[11px] ${theme === 'light' ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
          <span>NFPA 30 & OSHA 1910.119 Auditing</span>
          <span>•</span>
          <span>OGC GeoJSON / WMS Synchronized</span>
        </div>
      </footer>

    </div>
  );
}
