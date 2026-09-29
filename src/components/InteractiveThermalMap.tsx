import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Layers,
  Flame,
  ShieldAlert,
  Compass,
  Wind,
  Maximize2,
  Eye,
  Radio,
  Zap,
  Crosshair,
  Filter,
  MapPin,
  BrainCircuit,
  Copy,
  Check,
  X,
  Navigation,
  AlertTriangle,
  RotateCcw,
  Moon,
  Satellite,
  ChevronDown
} from 'lucide-react';
import { ThermalAnomaly, IndustrialFacility, GISLayerConfig } from '../types';

const BASE_STYLE_LABELS: Record<GISLayerConfig['mapStyle'], string> = {
  dark: 'Dark', light: 'Light', satellite: 'Satellite', terrain: 'Terrain', osm: 'OSM', 'nasa-live': 'NASA Live',
};

interface InteractiveThermalMapProps {
  anomalies: ThermalAnomaly[];
  facilities: IndustrialFacility[];
  selectedAnomaly: ThermalAnomaly | null;
  selectedFacility: IndustrialFacility | null;
  onSelectAnomaly: (anomaly: ThermalAnomaly | null) => void;
  onSelectFacility: (facility: IndustrialFacility | null) => void;
  onOpenEvacAdvisor: (anomaly: ThermalAnomaly, facility: IndustrialFacility) => void;
  onTriggerDispatch: (anomaly: ThermalAnomaly, facility: IndustrialFacility) => void;
  gisConfig: GISLayerConfig;
  onUpdateGISConfig: (newConfig: Partial<GISLayerConfig>) => void;
  onOpenIndiaCommand?: () => void;
  /** Industrial/All Fires scope (see HeaderHUD) - used only to re-frame the map onto
   *  whatever the current filter actually found, so switching scope never leaves the
   *  view pointed at an empty patch of ocean while real matches sit off-screen. */
  fireViewMode?: 'industrial' | 'all';
}

const CONTINENTS = [
  { name: 'Global', center: [20, 0] as [number, number], zoom: 2.5, isIndia: false },
  { name: 'India', center: [21.8, 78.9] as [number, number], zoom: 5.2, isIndia: true, flag: '🇮🇳' },
  { name: 'North America', center: [33, -96] as [number, number], zoom: 4.5, isIndia: false },
  { name: 'Europe', center: [48, 10] as [number, number], zoom: 4.5, isIndia: false },
  { name: 'Middle East', center: [25, 48] as [number, number], zoom: 5, isIndia: false },
  { name: 'Asia-Pacific', center: [18, 105] as [number, number], zoom: 4.5, isIndia: false },
  { name: 'Latin America', center: [-15, -60] as [number, number], zoom: 4, isIndia: false },
  { name: 'Africa', center: [5, 20] as [number, number], zoom: 4, isIndia: false },
];

export const InteractiveThermalMap: React.FC<InteractiveThermalMapProps> = ({
  anomalies,
  facilities,
  selectedAnomaly,
  selectedFacility,
  onSelectAnomaly,
  onSelectFacility,
  onOpenEvacAdvisor,
  onTriggerDispatch,
  gisConfig,
  onUpdateGISConfig,
  onOpenIndiaCommand,
  fireViewMode,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const blastZonesLayerRef = useRef<L.LayerGroup | null>(null);
  const windVectorsLayerRef = useRef<L.LayerGroup | null>(null);
  // Tracks scope-reframing state (see the fireViewMode effect below): the previous
  // scope value, and whether the current scope had any matches last render.
  const prevFireViewModeRef = useRef(fireViewMode);
  const hadAnyInScopeRef = useRef(anomalies.length > 0);

  const [activeContinent, setActiveContinent] = useState('Global');
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [copiedCoords, setCopiedCoords] = useState(false);

  // Initialize Map instance
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [25, 10],
      zoom: 2.5,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
    });

    // Custom tactical zoom control on bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapInstanceRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);
    blastZonesLayerRef.current = L.layerGroup().addTo(map);
    windVectorsLayerRef.current = L.layerGroup().addTo(map);

    // ResizeObserver to prevent map gray clipping
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Base Tile Layer based on gisConfig.mapStyle
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let tileUrl = '';
    let maxZoom = 19;
    let maxNativeZoom = 19;
    let subdomains: string | string[] = 'abc';

    if (gisConfig.mapStyle === 'dark') {
      // ESRI Dark Gray Canvas (High reliability, dark tactical aesthetic, 100% free & keyless)
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
      maxNativeZoom = 16;
      maxZoom = 19;
    } else if (gisConfig.mapStyle === 'light') {
      // ESRI Light Gray Canvas (Crisp white/light aesthetic with orange markers)
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
      maxNativeZoom = 16;
      maxZoom = 19;
    } else if (gisConfig.mapStyle === 'satellite') {
      // ESRI World Imagery (High resolution satellite)
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      maxNativeZoom = 18;
      maxZoom = 19;
    } else if (gisConfig.mapStyle === 'terrain') {
      // ESRI World Topo Map
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
      maxNativeZoom = 18;
      maxZoom = 19;
    } else if (gisConfig.mapStyle === 'nasa-live') {
      // NASA GIBS VIIRS true-colour daily composite - real near-real-time satellite
      // imagery (GIBS publishes with ~1 day latency, so request yesterday's pass).
      const gibsDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      tileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${gibsDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
      maxNativeZoom = 9;
      maxZoom = 19;
    } else {
      // Standard OpenStreetMap
      tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      maxZoom = 19;
      maxNativeZoom = 19;
    }

    tileLayerRef.current = L.tileLayer(tileUrl, {
      maxZoom,
      maxNativeZoom,
      subdomains,
    }).addTo(map);
  }, [gisConfig.mapStyle]);

  // Re-frame the map when the Industrial/All Fires scope changes, or when a live poll
  // makes the first match appear after the current scope had none. Industrial mode can
  // legitimately narrow the whole world down to a handful of detections anywhere on
  // Earth - without this, the map stays parked at whatever it was panned to and a real
  // match sitting off-screen looks identical to "nothing found". Guarded so it doesn't
  // re-fly on every routine 15s poll once the view already has something in frame.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const modeChanged = prevFireViewModeRef.current !== fireViewMode;
    const justAppeared = !hadAnyInScopeRef.current && anomalies.length > 0;
    prevFireViewModeRef.current = fireViewMode;
    hadAnyInScopeRef.current = anomalies.length > 0;

    if (!map || (!modeChanged && !justAppeared) || anomalies.length === 0) return;

    if (anomalies.length === 1) {
      map.flyTo([anomalies[0].latitude, anomalies[0].longitude], 8, { duration: 1.2 });
      return;
    }
    const bounds = L.latLngBounds(anomalies.map((a) => [a.latitude, a.longitude] as [number, number]));
    map.flyToBounds(bounds.pad(0.4), { maxZoom: 7, duration: 1.2 });
  }, [fireViewMode, anomalies]);

  // Render Hotspots, Industrial Markers, Blast Buffers, and Wind Vectors
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !blastZonesLayerRef.current || !windVectorsLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    blastZonesLayerRef.current.clearLayers();
    windVectorsLayerRef.current.clearLayers();

    // 1. Render Industrial Facilities
    if (gisConfig.showFacilityMarkers) {
      facilities.forEach((fac) => {
        if (gisConfig.selectedFacilityType === 'INDIA') {
          if (fac.country !== 'India') return;
        } else if (gisConfig.selectedFacilityType !== 'ALL' && fac.type !== gisConfig.selectedFacilityType) {
          return;
        }

        // Sector Icon, Badge Color & Pulse Effect
        let iconSymbol = '🏭';
        let badgeColor = 'bg-cyan-500';
        let borderHighlight = '';
        if (fac.type === 'nuclear_plant') {
          iconSymbol = '☢️';
          badgeColor = 'bg-amber-400';
          borderHighlight = 'ring-2 ring-amber-400 animate-pulse';
        } else if (fac.type === 'petrol_bunk_hub') {
          iconSymbol = '⛽';
          badgeColor = 'bg-blue-500';
        } else if (fac.type === 'mining_complex') {
          iconSymbol = '⛏️';
          badgeColor = 'bg-orange-600';
        } else if (fac.type === 'oil_refinery') {
          iconSymbol = '🛢️';
          badgeColor = 'bg-amber-500';
        } else if (fac.type === 'chemical_plant') {
          iconSymbol = '🧪';
          badgeColor = 'bg-purple-500';
        } else if (fac.type === 'lng_terminal') {
          iconSymbol = '❄️';
          badgeColor = 'bg-teal-500';
        } else if (fac.type === 'power_plant') {
          iconSymbol = '⚡';
          badgeColor = 'bg-yellow-500';
        } else if (fac.type === 'fertilizer_plant') {
          iconSymbol = '🌱';
          badgeColor = 'bg-emerald-500';
        } else if (fac.type === 'strategic_defense') {
          iconSymbol = '🚀';
          badgeColor = 'bg-rose-500';
        } else if (fac.type === 'timber_mill') {
          iconSymbol = '🌲';
          badgeColor = 'bg-emerald-500';
        }

        const isSelected = selectedFacility?.id === fac.id;
        const isIndia = fac.country === 'India';

        const customIcon = L.divIcon({
          className: 'custom-facility-pin',
          html: `
            <div class="group relative flex items-center justify-center cursor-pointer transition-transform hover:scale-125">
              <div class="w-8 h-8 rounded-lg bg-slate-900/90 border ${isSelected ? 'border-cyan-400 ring-2 ring-cyan-400' : borderHighlight ? 'border-amber-400 ' + borderHighlight : 'border-slate-700'} flex items-center justify-center shadow-lg text-sm">
                ${iconSymbol}
              </div>
              <div class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full ${badgeColor} border-2 border-slate-950 flex items-center justify-center">
                ${isIndia ? '<span class="text-[7px]">🇮🇳</span>' : ''}
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([fac.latitude, fac.longitude], { icon: customIcon });

        marker.on('click', () => {
          onSelectFacility(fac);
        });

        // Interactive Facility Tooltip
        marker.bindTooltip(
          `<div class="font-mono text-xs font-bold text-slate-100">${isIndia ? '🇮🇳 ' : ''}${fac.name}</div>
           <div class="text-[10px] text-slate-400">${fac.region}, ${fac.country} | Hazard: ${fac.hazardLevel} | Blast: ${fac.blastRadiusKm}km</div>`,
          { className: 'leaflet-dark-tooltip', direction: 'top', offset: [0, -18] }
        );

        markersLayerRef.current?.addLayer(marker);

        // Render Blast & Toxic Plume Buffers
        if (gisConfig.showBlastZones) {
          // Blast / Exclusion Perimeter
          const blastCircle = L.circle([fac.latitude, fac.longitude], {
            radius: fac.blastRadiusKm * 1000,
            color: fac.type === 'nuclear_plant' ? '#f59e0b' : '#ef4444',
            weight: 1.5,
            fillColor: fac.type === 'nuclear_plant' ? '#f59e0b' : '#ef4444',
            fillOpacity: fac.type === 'nuclear_plant' ? 0.18 : 0.12,
            dashArray: '4, 4',
          });
          blastZonesLayerRef.current?.addLayer(blastCircle);

          // Toxic Plume / AERB Emergency Planning Zone (EPZ) Perimeter
          const toxicCircle = L.circle([fac.latitude, fac.longitude], {
            radius: fac.toxicPlumeRadiusKm * 1000,
            color: fac.type === 'nuclear_plant' ? '#8b5cf6' : '#a855f7',
            weight: 1,
            fillColor: fac.type === 'nuclear_plant' ? '#8b5cf6' : '#a855f7',
            fillOpacity: 0.05,
          });
          blastZonesLayerRef.current?.addLayer(toxicCircle);
        }
      });
    }

    // 2. Render NASA FIRMS Thermal Anomalies
    if (gisConfig.showThermalOverlay) {
      anomalies.forEach((a) => {
        if (a.frp < gisConfig.minFRPFilter) return;
        if (gisConfig.selectedSeverity !== 'ALL' && a.nearestFacility?.threatLevel !== gisConfig.selectedSeverity) {
          return;
        }

        const threat = a.nearestFacility?.threatLevel || 'WATCH';
        const isSelected = selectedAnomaly?.id === a.id;

        // Visual radius & color based on Fire Radiative Power (MW) and threat
        let pulseColor = 'from-amber-500 to-orange-600';
        let glowBorder = 'border-amber-400';
        let ringAnim = 'animate-ping';

        if (threat === 'CRITICAL') {
          pulseColor = 'from-rose-600 to-red-700';
          glowBorder = 'border-rose-400';
        } else if (threat === 'HIGH') {
          pulseColor = 'from-orange-500 to-amber-600';
          glowBorder = 'border-orange-400';
        } else if (threat === 'ELEVATED') {
          pulseColor = 'from-amber-400 to-yellow-500';
          glowBorder = 'border-amber-300';
          ringAnim = '';
        }

        const markerSize = Math.max(24, Math.min(48, Math.round(20 + Math.sqrt(a.frp) * 2)));

        const customFireIcon = L.divIcon({
          className: 'custom-thermal-pin',
          html: `
            <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-135" style="width: ${markerSize}px; height: ${markerSize}px;">
              ${threat === 'CRITICAL' ? `<span class="${ringAnim} absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-40"></span>` : ''}
              <div class="relative w-full h-full rounded-full bg-gradient-to-br ${pulseColor} flex items-center justify-center border-2 ${glowBorder} shadow-lg shadow-orange-950/70 ${isSelected ? 'ring-4 ring-white' : ''}">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2c-1.5 2.5-3 5-3 8 0 3.3 2.7 6 6 6s6-2.7 6-6c0-3-1.5-5.5-3-8-1 2-2 3-3 3s-2-1-3-3z"/>
                </svg>
              </div>
            </div>
          `,
          iconSize: [markerSize, markerSize],
          iconAnchor: [markerSize / 2, markerSize / 2],
        });

        const fireMarker = L.marker([a.latitude, a.longitude], { icon: customFireIcon });

        fireMarker.on('click', () => {
          onSelectAnomaly(a);
          if (a.nearestFacility) {
            onSelectFacility(a.nearestFacility.facility);
          }
        });

        // Interactive Popup
        const fac = a.nearestFacility?.facility;
        const targetFac = fac || {
          id: `regional-forestry-${a.id}`,
          name: `Regional Wildland/Industrial Buffer Zone (Lat: ${a.latitude.toFixed(2)}, Lon: ${a.longitude.toFixed(2)})`,
          type: 'remote_wildfire' as any,
          country: 'Regional',
          region: 'Wildfire Sector',
          latitude: a.latitude,
          longitude: a.longitude,
          hazardLevel: 'ELEVATED' as any,
          primaryChemicals: ['Vegetation Biomass', 'Hydrocarbon Particulates'],
          fuelStorageCapacityTons: 50000,
          blastRadiusKm: 2.0,
          toxicPlumeRadiusKm: 4.5,
          emergencyContact: {
            responderUnit: 'Regional Forestry & Hazardous Materials Rapid Response',
            radioChannel: 'TAC-FIRE-01',
            contactPhone: '+1-800-555-FIRE'
          },
          status: 'NORMAL' as any
        };

        const popupContent = document.createElement('div');
        popupContent.className = 'tactical-popup font-mono text-xs text-slate-100 p-2 min-w-[260px]';
        popupContent.innerHTML = `
          <div class="flex items-center justify-between pb-1.5 border-b border-slate-700">
            <span class="font-bold text-orange-400 flex items-center gap-1">
              🔥 ${a.id}
            </span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${threat === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
            threat === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' :
              'bg-slate-800 text-slate-300'
          }">${threat}</span>
          </div>

          <div class="grid grid-cols-2 gap-2 my-2 text-[11px]">
            <div>
              <span class="text-slate-400">Fire Power:</span>
              <div class="font-bold text-orange-300">${a.frp.toFixed(0)} MW</div>
            </div>
            <div>
              <span class="text-slate-400">Brightness:</span>
              <div class="font-bold text-slate-200">${a.brightness} K</div>
            </div>
            <div>
              <span class="text-slate-400">Satellite:</span>
              <div class="text-slate-300">${a.satellite}</div>
            </div>
            <div>
              <span class="text-slate-400">Confidence:</span>
              <div class="text-emerald-400 uppercase">${a.confidence}</div>
            </div>
          </div>

          <div class="bg-slate-900/90 p-2 rounded border border-slate-800 my-2">
            <div class="text-[10px] text-slate-400 uppercase">Target Industrial Asset</div>
            <div class="font-bold text-slate-100 text-xs truncate">${targetFac.name}</div>
            <div class="flex items-center justify-between mt-1 text-[11px]">
              <span class="text-rose-400 font-bold">${a.nearestFacility ? `${a.nearestFacility.distanceKm.toFixed(1)} km away` : 'Active Fire Front'}</span>
              <span class="text-amber-400">${a.nearestFacility ? `ETA: ${a.nearestFacility.timeToImpactHours}h` : 'Real-time Telemetry'}</span>
            </div>
          </div>

          <div class="flex gap-2 mt-2">
            <button id="btn-dispatch-${a.id}" class="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-1.5 px-2 rounded text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer">
              🚨 Dispatch
            </button>
            <button id="btn-advisor-${a.id}" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold py-1.5 px-2 rounded text-[10px] flex items-center justify-center gap-1 border border-slate-700 transition-colors cursor-pointer">
              🧠 AI Evac
            </button>
          </div>
        `;

        // Wire popup click actions
        fireMarker.bindPopup(popupContent, { className: 'custom-leaflet-popup', offset: [0, -markerSize / 2] });

        fireMarker.on('popupopen', () => {
          const dispatchBtn = document.getElementById(`btn-dispatch-${a.id}`);
          const advisorBtn = document.getElementById(`btn-advisor-${a.id}`);
          if (dispatchBtn) {
            dispatchBtn.onclick = () => onTriggerDispatch(a, targetFac);
          }
          if (advisorBtn) {
            advisorBtn.onclick = () => onOpenEvacAdvisor(a, targetFac);
          }
        });

        markersLayerRef.current?.addLayer(fireMarker);

        // 3. Render Wind Vectors & Spread Projections
        if (gisConfig.showWindVectors && a.nearestFacility && a.windSource !== 'unavailable') {
          // Calculate wind arrow vector point
          const windRad = ((a.windDirectionDeg - 90) * Math.PI) / 180;
          const vectorDistKm = 6.0;
          const latDelta = (vectorDistKm / 111) * Math.sin(windRad);
          const lonDelta = (vectorDistKm / (111 * Math.cos((a.latitude * Math.PI) / 180))) * Math.cos(windRad);

          const endLat = a.latitude + latDelta;
          const endLon = a.longitude + lonDelta;

          const windLine = L.polyline(
            [[a.latitude, a.longitude], [endLat, endLon]],
            {
              color: a.nearestFacility.windSpreadRisk === 'DIRECT' ? '#f43f5e' : '#38bdf8',
              weight: 2.5,
              dashArray: '3, 6',
              opacity: 0.8,
            }
          );
          windVectorsLayerRef.current?.addLayer(windLine);
        }
      });
    }
  }, [anomalies, facilities, gisConfig, selectedAnomaly, selectedFacility]);

  // Fly to selected anomaly/facility when selected externally
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (selectedAnomaly) {
      mapInstanceRef.current.flyTo([selectedAnomaly.latitude, selectedAnomaly.longitude], 10, {
        duration: 1.2,
      });
    } else if (selectedFacility) {
      mapInstanceRef.current.flyTo([selectedFacility.latitude, selectedFacility.longitude], 9, {
        duration: 1.2,
      });
    }
  }, [selectedAnomaly, selectedFacility]);

  // Jump to continent
  const handleContinentClick = (cont: typeof CONTINENTS[0]) => {
    setActiveContinent(cont.name);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(cont.center, cont.zoom, { duration: 1.0 });
    }
  };

  const handleResetView = () => {
    setActiveContinent('Global');
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([20, 0], 2.5, { duration: 1.0 });
    }
  };

  const handleCopyCoords = (lat: number, lon: number) => {
    navigator.clipboard.writeText(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  // Compute active inspected pair
  const inspectedAnomaly = selectedAnomaly;
  const inspectedFacility = selectedFacility || selectedAnomaly?.nearestFacility?.facility || null;

  return (
    <div className="isolate relative w-full h-[min(70vh,520px)] sm:h-[460px] md:h-[490px] xl:h-[calc(100vh-145px)] xl:min-h-[630px] xl:max-h-[800px] bg-black rounded-2xl overflow-hidden border border-orange-500/25 shadow-[0_12px_40px_rgba(0,0,0,0.85)] flex flex-col z-0">

      {/* Top Map Control Overlay */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 right-2.5 sm:right-auto z-30 flex flex-wrap items-center gap-1.5 sm:gap-2 sm:max-w-[90%] pointer-events-none [&>*]:pointer-events-auto"
      >

        {/* Dropdown Location Navigation Button (static on phones so its panel anchors to the full-width bar) */}
        <div className="sm:relative flex-shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowLocationMenu(!showLocationMenu);
              setShowLayerMenu(false);
            }}
            title={`Location Navigation: ${activeContinent}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-black/75 backdrop-blur-xl hover:bg-black/90 border border-orange-500/25 hover:border-orange-500/50 rounded-xl text-orange-400 shadow-xl transition-all cursor-pointer hover:shadow-[0_0_15px_rgba(249,115,22,0.25)] min-h-[34px] min-w-[34px] justify-center"
          >
            <Compass className="w-4 h-4 text-orange-400" />
            <ChevronDown className={`w-3.5 h-3.5 text-orange-400/80 transition-transform duration-200 ${showLocationMenu ? 'rotate-180 text-orange-300' : ''}`} />
          </button>

          {showLocationMenu && (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="absolute left-0 right-0 sm:right-auto mt-2 sm:w-60 max-h-[55vh] overflow-y-auto bg-black/95 backdrop-blur-2xl border border-orange-500/30 rounded-2xl p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.9)] z-40 text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-150"
            >
              <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-white/10 px-1 text-[10px] text-orange-400 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5" />
                  Select Location
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetView();
                    setShowLocationMenu(false);
                  }}
                  title="Reset Global View"
                  className="text-slate-400 hover:text-orange-400 p-0.5 rounded transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-1">
                {CONTINENTS.map((cont) => {
                  const isSelected = activeContinent === cont.name;
                  const isIndia = cont.name === 'India';

                  return (
                    <button
                      type="button"
                      key={cont.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleContinentClick(cont);
                        setShowLocationMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left text-[11px] font-mono transition-all cursor-pointer ${isSelected
                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-black font-extrabold shadow-[0_0_12px_rgba(249,115,22,0.4)]'
                        : 'text-slate-300 hover:text-white hover:bg-orange-500/15'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        {isIndia ? <span>🇮🇳</span> : <MapPin className={`w-3.5 h-3.5 ${isSelected ? 'text-black' : 'text-orange-400/70'}`} />}
                        <span>{cont.name}</span>
                      </div>
                      {isSelected && (
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-black/30 text-black font-extrabold">Active</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Direct Dark / Satellite Base Layer Toggle */}
        <div className="flex items-center bg-black/75 backdrop-blur-xl p-1.5 rounded-xl border border-orange-500/20 shadow-xl text-xs font-mono flex-shrink-0">
          <button
            onClick={() => onUpdateGISConfig({ mapStyle: 'dark' })}
            title="Dark Tactical Mode"
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] transition-all cursor-pointer ${gisConfig.mapStyle === 'dark'
              ? 'bg-orange-500/20 text-orange-400 font-bold border border-orange-500/40 shadow-[0_0_12px_rgba(249,115,22,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
          >
            <Moon className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">Dark</span>
          </button>

          <button
            onClick={() => onUpdateGISConfig({ mapStyle: 'satellite' })}
            title="High-Resolution Satellite Imagery"
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] transition-all cursor-pointer ${gisConfig.mapStyle === 'satellite'
              ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
          >
            <Satellite className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden xs:inline sm:inline">Satellite</span>
          </button>
        </div>

        {/* GIS Layer Switcher Dropdown */}
        <div className="sm:relative flex-shrink-0">
          <button
            onClick={() => setShowLayerMenu(!showLayerMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-black/75 backdrop-blur-xl hover:bg-black/90 border border-orange-500/20 hover:border-orange-500/50 rounded-xl text-[11px] sm:text-xs font-mono text-slate-300 hover:text-orange-300 shadow-xl transition-all cursor-pointer hover:shadow-[0_0_15px_rgba(249,115,22,0.2)]"
          >
            <Layers className="w-3.5 h-3.5 text-orange-400" />
            <span>GIS Overlays</span>
          </button>

          {showLayerMenu && (
            <div className="absolute left-0 right-0 sm:right-auto mt-2 sm:w-64 max-h-[60vh] overflow-y-auto bg-black/95 backdrop-blur-2xl border border-orange-500/30 rounded-2xl p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.9)] z-40 text-xs font-mono">
              <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mb-2">
                Base Map Layer
              </div>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {(['dark', 'light', 'satellite', 'terrain', 'osm', 'nasa-live'] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => onUpdateGISConfig({ mapStyle: style })}
                    title={style === 'nasa-live' ? 'NASA GIBS live satellite imagery (VIIRS true-colour)' : undefined}
                    className={`px-2.5 py-1.5 rounded-lg text-center capitalize transition-all cursor-pointer ${gisConfig.mapStyle === style
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-black font-bold shadow-[0_0_12px_rgba(249,115,22,0.4)]'
                      : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                  >
                    {BASE_STYLE_LABELS[style]}
                  </button>
                ))}
              </div>

              <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wider mb-2 border-t border-white/10 pt-2.5">
                Spatial Overlays
              </div>

              <label className="flex items-center justify-between py-1 text-slate-300 cursor-pointer hover:text-white">
                <span className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" /> FIRMS Thermal Anomaly
                </span>
                <input
                  type="checkbox"
                  checked={gisConfig.showThermalOverlay}
                  onChange={(e) => onUpdateGISConfig({ showThermalOverlay: e.target.checked })}
                  className="rounded accent-orange-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between py-1 text-slate-300 cursor-pointer hover:text-white">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" /> Industrial Facilities
                </span>
                <input
                  type="checkbox"
                  checked={gisConfig.showFacilityMarkers}
                  onChange={(e) => onUpdateGISConfig({ showFacilityMarkers: e.target.checked })}
                  className="rounded accent-orange-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between py-1 text-slate-300 cursor-pointer hover:text-white">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Blast & Hazard Buffers
                </span>
                <input
                  type="checkbox"
                  checked={gisConfig.showBlastZones}
                  onChange={(e) => onUpdateGISConfig({ showBlastZones: e.target.checked })}
                  className="rounded accent-orange-500 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between py-1 text-slate-300 cursor-pointer hover:text-white">
                <span className="flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-sky-400" /> Wind Spread Vectors
                </span>
                <input
                  type="checkbox"
                  checked={gisConfig.showWindVectors}
                  onChange={(e) => onUpdateGISConfig({ showWindVectors: e.target.checked })}
                  className="rounded accent-orange-500 cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>

        {/* India Tactical Sub-Bar (Visible when India is active or on-demand) */}
        {activeContinent === 'India' && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="w-full flex items-center justify-between gap-2 p-1.5 px-3 rounded-xl bg-black/85 backdrop-blur-xl border border-orange-500/30 shadow-2xl overflow-x-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-xs">🇮🇳</span>
              <span className="text-[10px] sm:text-[11px] font-mono font-bold text-orange-400 whitespace-nowrap glow-orange">
                BHARAT SECTORS:
              </span>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[
                { id: 'ALL', label: 'All India' },
                { id: 'nuclear_plant', label: '☢️ Nuclear (NPCIL)' },
                { id: 'oil_refinery', label: '🛢️ Refineries' },
                { id: 'petrol_bunk_hub', label: '⛽ Petrol / POL Depots' },
                { id: 'mining_complex', label: '⛏️ Mines (DGMS)' },
                { id: 'chemical_plant', label: '🧪 PCPIR / Chem' },
                { id: 'fertilizer_plant', label: '🌱 Fertilizers' },
                { id: 'strategic_defense', label: '🚀 ISRO / Strategic' },
              ].map((sec) => {
                const isActive = gisConfig.selectedFacilityType === sec.id;

                return (
                  <button
                    type="button"
                    key={sec.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onUpdateGISConfig({ selectedFacilityType: sec.id });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium whitespace-nowrap transition-all cursor-pointer select-none ${isActive
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-black font-bold shadow-[0_0_12px_rgba(249,115,22,0.4)] border border-orange-300'
                      : 'bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:border-orange-500/40 hover:bg-orange-500/10'
                      }`}
                  >
                    {sec.label}
                  </button>
                );
              })}
            </div>

            {onOpenIndiaCommand && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onOpenIndiaCommand();
                }}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black text-[10px] font-mono font-bold whitespace-nowrap shadow-[0_0_15px_rgba(249,115,22,0.4)] transition-all cursor-pointer flex-shrink-0"
              >
                <span>🚨 NDRF Hub</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Floating Tactical Inspector Card (When Anomaly or Facility Selected) */}
      {(inspectedAnomaly || inspectedFacility) && (
        <div className="absolute top-14 right-2.5 sm:right-3 left-2.5 sm:left-auto z-30 w-auto sm:w-96 max-w-full bg-black/90 backdrop-blur-2xl border border-orange-500/30 rounded-2xl shadow-[0_16px_50px_rgba(0,0,0,0.95)] p-3 sm:p-4 font-mono text-slate-100 flex flex-col max-h-[75%] sm:max-h-[80%] overflow-y-auto scrollbar-glass">
          <div className="flex items-center justify-between pb-2 border-b border-orange-500/20">
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-orange-400 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-orange-300 glow-orange">
                Tactical Target Inspector
              </span>
            </div>
            <button
              onClick={() => {
                onSelectAnomaly(null);
                onSelectFacility(null);
              }}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-orange-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Facility Details */}
          {inspectedFacility && (
            <div className="mt-2.5 bg-slate-900/80 p-2.5 sm:p-3 rounded-xl border border-slate-800 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400 uppercase">Industrial Asset</div>
                  <div className="font-bold text-xs text-slate-100 leading-tight truncate">
                    {inspectedFacility.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    {inspectedFacility.region}, {inspectedFacility.country}
                  </div>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase flex-shrink-0">
                  {inspectedFacility.hazardLevel} HAZARD
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] pt-1.5 border-t border-slate-800 text-slate-300">
                <div>
                  <span className="text-slate-400">Blast Radius:</span> <strong className="text-rose-400">{inspectedFacility.blastRadiusKm} km</strong>
                </div>
                <div>
                  <span className="text-slate-400">Toxic Plume:</span> <strong className="text-purple-400">{inspectedFacility.toxicPlumeRadiusKm} km</strong>
                </div>
                <div className="col-span-2 truncate">
                  <span className="text-slate-400">Primary Hazmat:</span> <span className="text-slate-200">{inspectedFacility.primaryChemicals.join(', ')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Anomaly Telemetry Details */}
          {inspectedAnomaly && (
            <div className="mt-2 bg-orange-950/20 p-2.5 sm:p-3 rounded-xl border border-orange-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-orange-400 font-bold text-xs">
                  <Flame className="w-4 h-4" />
                  <span>{inspectedAnomaly.id}</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold">
                  {inspectedAnomaly.satellite} ({inspectedAnomaly.confidence})
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center text-xs">
                <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-400 uppercase">FRP</div>
                  <div className="font-bold text-orange-400 text-xs">{inspectedAnomaly.frp.toFixed(0)} MW</div>
                </div>
                <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-400 uppercase">Brightness</div>
                  <div className="font-bold text-slate-200 text-xs">{inspectedAnomaly.brightness} K</div>
                </div>
                <div className="bg-slate-950/70 p-1.5 rounded border border-slate-800">
                  <div className="text-[9px] text-slate-400 uppercase">Wind Vector</div>
                  <div className="font-bold text-sky-400 text-xs">
                    {inspectedAnomaly.windSource === 'unavailable'
                      ? 'n/a'
                      : `${inspectedAnomaly.windSpeedKmh} km/h from ${inspectedAnomaly.windDirectionDeg}°`}
                  </div>
                </div>
              </div>

              {inspectedAnomaly.nearestFacility && (
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-orange-500/20">
                  <span className="text-slate-300 font-bold">
                    Perimeter: <strong className="text-rose-400">{inspectedAnomaly.nearestFacility.distanceKm.toFixed(1)} km</strong>
                  </span>
                  <span className="text-amber-300 font-bold">
                    ETA: {inspectedAnomaly.nearestFacility.timeToImpactHours}h
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Action Button Bar */}
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              {inspectedAnomaly && inspectedFacility && (
                <>
                  <button
                    onClick={() => onTriggerDispatch(inspectedAnomaly, inspectedFacility)}
                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-950/50 transition-all cursor-pointer min-h-[36px]"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Dispatch</span>
                  </button>

                  <button
                    onClick={() => onOpenEvacAdvisor(inspectedAnomaly, inspectedFacility)}
                    className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(249,115,22,0.4)] transition-all cursor-pointer min-h-[36px]"
                  >
                    <BrainCircuit className="w-3.5 h-3.5" />
                    <span>AI Intel</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const targetLat = inspectedAnomaly ? inspectedAnomaly.latitude : inspectedFacility!.latitude;
                  const targetLon = inspectedAnomaly ? inspectedAnomaly.longitude : inspectedFacility!.longitude;
                  handleCopyCoords(targetLat, targetLon);
                }}
                className="flex-1 bg-black/60 hover:bg-black/90 text-slate-300 hover:text-orange-300 border border-orange-500/25 hover:border-orange-500/50 py-2 px-2 rounded-lg text-[10px] sm:text-[11px] flex items-center justify-center gap-1 transition-all cursor-pointer min-h-[36px]"
              >
                {copiedCoords ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCoords ? 'GPS Copied' : 'Copy GPS'}</span>
              </button>

              <button
                onClick={() => {
                  const targetLat = inspectedAnomaly ? inspectedAnomaly.latitude : inspectedFacility!.latitude;
                  const targetLon = inspectedAnomaly ? inspectedAnomaly.longitude : inspectedFacility!.longitude;
                  mapInstanceRef.current?.flyTo([targetLat, targetLon], 12, { duration: 1.0 });
                }}
                className="bg-black/60 hover:bg-black/90 text-slate-300 hover:text-orange-300 border border-orange-500/25 hover:border-orange-500/50 p-2 rounded-lg text-[10px] flex items-center justify-center gap-1 transition-all cursor-pointer min-h-[36px] min-w-[36px]"
                title="Zoom into blast boundary"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Map Legend */}
      <div className="absolute bottom-3 left-3 z-20 hidden md:flex items-center gap-3 bg-black/80 backdrop-blur-xl px-3.5 py-2 rounded-xl border border-orange-500/20 text-[11px] font-mono text-slate-300 shadow-[0_8px_32px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
          <span>Critical Blast Zone</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]"></span>
          <span>High Threat (1-5km)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></span>
          <span>Toxic Vapor Buffer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 bg-sky-400 border-dashed"></span>
          <span>Wind Propagation</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span>Wind: </span>
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-orange-400">
            Open-Meteo.com
          </a>
        </div>
      </div>

      {/* Industrial scope, currently zero matches: make that an explicit, readable state
          instead of a map that just looks empty/broken. */}
      {fireViewMode === 'industrial' && anomalies.length === 0 && (
        <div className="absolute inset-x-0 top-16 sm:top-20 z-20 flex justify-center pointer-events-none px-3">
          <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-black/85 backdrop-blur-md border border-amber-500/40 text-amber-300 text-[11px] sm:text-xs font-mono shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
            <Flame className="w-3.5 h-3.5 flex-shrink-0" />
            No active thermal detection is currently within 5km of a monitored industrial facility. Switch to "All Fires" to see the full live feed.
          </div>
        </div>
      )}

      {/* Leaflet Map DOM Target */}
      <div ref={mapContainerRef} className="w-full h-full flex-1 z-0" />
    </div>
  );
};
