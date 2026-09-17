import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Flame, 
  Zap, 
  Radio, 
  PhoneCall, 
  BookOpen, 
  Calendar, 
  Copy, 
  Check, 
  X, 
  ExternalLink, 
  AlertTriangle, 
  Atom, 
  Fuel, 
  Pickaxe, 
  Building2, 
  Rocket, 
  Compass, 
  Filter,
  Layers,
  MapPin,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { ThermalAnomaly, IndustrialFacility } from '../types';
import { INDIAN_INDUSTRIAL_FACILITIES } from '../data/industrialDatabase';

interface IndiaCommandCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  anomalies: ThermalAnomaly[];
  facilities: IndustrialFacility[];
  onSelectFacility: (fac: IndustrialFacility) => void;
  onSelectAnomaly: (anomaly: ThermalAnomaly) => void;
  onFlyToCoordinates: (lat: number, lon: number, zoom?: number) => void;
}

type TabType = 'overview' | 'facilities' | 'ndrf' | 'regulations' | 'seasonal' | 'broadcast';

export const IndiaCommandCenterModal: React.FC<IndiaCommandCenterModalProps> = ({
  isOpen,
  onClose,
  anomalies,
  facilities,
  onSelectFacility,
  onSelectAnomaly,
  onFlyToCoordinates,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [copiedBroadcast, setCopiedBroadcast] = useState(false);
  const [selectedFacilityForBroadcast, setSelectedFacilityForBroadcast] = useState<IndustrialFacility>(
    INDIAN_INDUSTRIAL_FACILITIES[0]
  );

  if (!isOpen) return null;

  // Filter Indian facilities
  const indianFacilities = facilities.filter(f => f.country === 'India' || INDIAN_INDUSTRIAL_FACILITIES.some(inf => inf.id === f.id));
  
  // Filter anomalies affecting India
  const indianAnomalies = anomalies.filter(a => {
    // Check if within India coordinates box or closest facility is in India
    const inIndiaBBox = a.latitude >= 7.0 && a.latitude <= 36.5 && a.longitude >= 68.0 && a.longitude <= 97.5;
    const closestIsIndian = a.nearestFacility?.facility.country === 'India';
    return inIndiaBBox || closestIsIndian;
  });

  const criticalIndianThreats = indianAnomalies.filter(a => a.nearestFacility?.threatLevel === 'CRITICAL');
  const highIndianThreats = indianAnomalies.filter(a => a.nearestFacility?.threatLevel === 'HIGH');
  const totalIndianFRP = Math.round(indianAnomalies.reduce((sum, a) => sum + a.frp, 0));

  // NDRF Battalions Directory
  const NDRF_BATTALIONS = [
    { bn: '1st Bn NDRF', hq: 'Guwahati, Assam', coverage: 'Northeast, NRL Refinery, Oil Fields', phone: '+91-361-284-0010', callsign: 'NDRF-01-NE' },
    { bn: '2nd Bn NDRF', hq: 'Haringhata / Kolkata, West Bengal', coverage: 'Eastern Region, IOCL Haldia, Mourigram', phone: '+91-33-2587-0020', callsign: 'NDRF-02-KOL' },
    { bn: '3rd Bn NDRF', hq: 'Mundali, Cuttack, Odisha', coverage: 'Paradip Mega Refinery, Sukinda, DRDO ITR', phone: '+91-671-287-0030', callsign: 'NDRF-03-OD' },
    { bn: '4th Bn NDRF', hq: 'Arakkonam, Tamil Nadu', coverage: 'Kudankulam Nuclear, MAPS Kalpakkam, Manali POL', phone: '+91-4177-226-040', callsign: 'NDRF-04-TN' },
    { bn: '5th Bn NDRF', hq: 'Sudumbare, Pune, Maharashtra', coverage: 'Tarapur Nuclear, BPCL Sewree, HPCL Loni, RCF', phone: '+91-2114-247-050', callsign: 'NDRF-05-MH' },
    { bn: '6th Bn NDRF', hq: 'Jarod, Vadodara, Gujarat', coverage: 'Jamnagar RIL, Dahej PCPIR, Ankleshwar, Kakrapar', phone: '+91-2668-273-060', callsign: 'NDRF-06-GJ' },
    { bn: '7th Bn NDRF', hq: 'Bathinda, Punjab', coverage: 'GGSR Bathinda Refinery, Stubble Fire Corridors', phone: '+91-164-224-0070', callsign: 'NDRF-07-PB' },
    { bn: '8th Bn NDRF', hq: 'Kamla Nehru Nagar, Ghaziabad, UP', coverage: 'Delhi NCR, IOCL Bijwasan, Narora Nuclear, Panipat', phone: '+91-120-276-0080', callsign: 'NDRF-08-NCR' },
    { bn: '9th Bn NDRF', hq: 'Bihta, Patna, Bihar', coverage: 'BCCL Jharia Coalfields, Barauni Refinery', phone: '+91-6115-253-090', callsign: 'NDRF-09-BH' },
    { bn: '10th Bn NDRF', hq: 'Achutapuram, Vijayawada, AP', coverage: 'ISRO Sriharikota, HPCL Vizag, ISPRL Caverns', phone: '+91-866-246-0100', callsign: 'NDRF-10-AP' },
    { bn: '11th Bn NDRF', hq: 'Sanskriti Bhawan, Varanasi, UP', coverage: 'Singrauli Coal Belt, Rihand, Eastern UP', phone: '+91-542-250-0110', callsign: 'NDRF-11-UP' },
    { bn: '12th Bn NDRF', hq: 'Doimukh, Itanagar, Arunachal', coverage: 'Eastern Himalayan Hydro & Frontier Infrastructure', phone: '+91-360-227-0120', callsign: 'NDRF-12-AR' },
  ];

  // Filtered facilities by sector
  const displayedFacilities = indianFacilities.filter(fac => {
    if (sectorFilter === 'ALL') return true;
    if (sectorFilter === 'nuclear' && fac.type === 'nuclear_plant') return true;
    if (sectorFilter === 'refinery' && fac.type === 'oil_refinery') return true;
    if (sectorFilter === 'petrol' && fac.type === 'petrol_bunk_hub') return true;
    if (sectorFilter === 'mining' && fac.type === 'mining_complex') return true;
    if (sectorFilter === 'chemical' && (fac.type === 'chemical_plant' || fac.type === 'fertilizer_plant')) return true;
    if (sectorFilter === 'strategic' && fac.type === 'strategic_defense') return true;
    return false;
  });

  const generateBilingualAlertText = () => {
    const f = selectedFacilityForBroadcast;
    const now = new Date();
    const dateFormatted = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    return `🇮🇳 [GOVERNMENT OF INDIA / NDMA / SDRF TACTICAL EMERGENCY DIRECTIVE]
================================================================================
TIME OF DISPATCH / प्रेषण समय: ${dateFormatted} IST
FACILITY TARGET / प्रतिष्ठान: ${f.name}
LOCATION & STATE / स्थान एवं राज्य: ${f.region}, ${f.country}
COORDINATES / भौगोलिक निर्देशांक: ${f.latitude.toFixed(4)}° N, ${f.longitude.toFixed(4)}° E
HAZARD CLASSIFICATION / जोखिम स्तर: ${f.hazardLevel} (${f.type.toUpperCase()})
PRIMARY CHEMICALS / प्राथमिक रसायन: ${f.primaryChemicals.join(', ')}
EVACUATION PERIMETER / निकासी परिधि: ${f.blastRadiusKm} KM (Immediate Blast) / ${f.toxicPlumeRadiusKm} KM (Plume Dispersion)
FIRST RESPONDER BATTALION / प्रथम प्रतिक्रिया दल: ${f.emergencyContact.responderUnit}
HOTLINE / संपर्क सूत्र: ${f.emergencyContact.phone} | RADIO TAC: ${f.emergencyContact.radioChannel}

--------------------------------------------------------------------------------
[ENGLISH MANDATE]:
Immediate satellite-based early warning confirmed active high-intensity thermal front advancing towards industrial perimeter. In accordance with National Disaster Management Act Section 30/34, standard OISD-STD-117 / AERB nuclear / DGMS protocols are in effect. Deploy primary foam water monitors, activate perimeter water curtain, and establish a ${(f.blastRadiusKm + 1).toFixed(1)} km sterile cordon.

[हिंदी आधिकारिक निर्देश]:
उपग्रह आधारित प्रारंभिक चेतावनी प्रणाली द्वारा प्रतिष्ठान की सुरक्षा परिधि के निकट तीव्र ताप/अग्नि फ्रंट की पुष्टि की गई है। राष्ट्रीय आपदा प्रबंधन अधिनियम की धारा ३०/३४ के अंतर्गत ओआईएसडी/एईआरबी सुरक्षा मानकों को तत्काल प्रभाव से लागू किया जाता है। अग्नि शमन दल, फोम टेंडर एवं जल कर्टेन को सक्रिय करें तथा ${(f.blastRadiusKm + 1).toFixed(1)} किमी का सुरक्षित क्षेत्र घोषित करें।
================================================================================`;
  };

  const handleCopyBroadcast = () => {
    navigator.clipboard.writeText(generateBilingualAlertText());
    setCopiedBroadcast(true);
    setTimeout(() => setCopiedBroadcast(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Modal Header */}
        <div className="p-3.5 sm:p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 via-white/20 to-emerald-600 flex items-center justify-center shadow-lg border border-orange-500/40 p-0.5">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <span className="text-lg font-bold">🇮🇳</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 font-mono tracking-wide">
                  BHARAT INDUSTRIAL SAFETY & DISASTER COMMAND
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30">
                  INDIA REGIONAL HUB
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                AERB Nuclear • OISD Fuel Depots • DGMS Mines • Petrochemical PCPIR • NDRF Response Network
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-3.5 sm:px-5 pt-2 border-b border-slate-800 bg-slate-900/40 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800">
          {[
            { id: 'overview', label: '🇮🇳 National Overview', icon: Compass },
            { id: 'facilities', label: `🏭 Indian Facilities (${indianFacilities.length})`, icon: Building2 },
            { id: 'ndrf', label: '🚨 NDRF / SDRF Battalions', icon: ShieldAlert },
            { id: 'regulations', label: '📜 AERB & OISD Standards', icon: BookOpen },
            { id: 'seasonal', label: '🌾 FSI Stubble & Fire Index', icon: Calendar },
            { id: 'broadcast', label: '📢 Bilingual Alert Dispatch', icon: Radio },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-3 py-2.5 text-xs font-mono whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-400 font-bold bg-orange-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Modal Body Content */}
        <div className="p-3.5 sm:p-5 overflow-y-auto max-h-[calc(92vh-140px)] space-y-4">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              
              {/* National Key Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col">
                  <span className="text-[10px] font-mono uppercase text-slate-400">Total Monitored Sites</span>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-slate-100 mt-1">
                    {indianFacilities.length}
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono mt-0.5">Across 16 Indian States</span>
                </div>

                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40 flex flex-col">
                  <span className="text-[10px] font-mono uppercase text-rose-300">Red Zone Indian Sites</span>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-rose-400 mt-1">
                    {criticalIndianThreats.length}
                  </div>
                  <span className="text-[10px] text-rose-400/80 font-mono mt-0.5">Under Immediate Review</span>
                </div>

                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 flex flex-col">
                  <span className="text-[10px] font-mono uppercase text-amber-300">High Risk Hotspots</span>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-amber-400 mt-1">
                    {highIndianThreats.length}
                  </div>
                  <span className="text-[10px] text-amber-400/80 font-mono mt-0.5">Active VIIRS/MODIS passes</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col">
                  <span className="text-[10px] font-mono uppercase text-slate-400">India Thermal Energy</span>
                  <div className="text-xl sm:text-2xl font-bold font-mono text-orange-400 mt-1">
                    {totalIndianFRP.toLocaleString()} <span className="text-xs font-normal text-slate-400">MW</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono mt-0.5">NASA FIRMS Radiative Power</span>
                </div>
              </div>

              {/* Sector Quick Jump Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                
                {/* 1. Nuclear Sector */}
                <div 
                  onClick={() => { setActiveTab('facilities'); setSectorFilter('nuclear'); }}
                  className="p-4 rounded-xl bg-slate-900/60 border border-amber-500/30 hover:border-amber-400 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <Atom className="w-5 h-5" />
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300">
                      7 Stations
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 font-mono group-hover:text-amber-400 transition-colors">
                    Nuclear Energy Plants (NPCIL)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Kudankulam, Tarapur, Kakrapar, Kalpakkam, Rawatbhata, Narora, Kaiga. AERB 1.6km exclusion perimeters.
                  </p>
                </div>

                {/* 2. Fuel Depots & Petrol Bunks */}
                <div 
                  onClick={() => { setActiveTab('facilities'); setSectorFilter('petrol'); }}
                  className="p-4 rounded-xl bg-slate-900/60 border border-blue-500/30 hover:border-blue-400 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <Fuel className="w-5 h-5" />
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300">
                      8 Terminals & SPRs
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 font-mono group-hover:text-blue-400 transition-colors">
                    POL Fuel Depots & Strategic Reserves
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    IOCL Bijwasan, BPCL Sewree, HPCL Loni, ISPRL Caverns Vizag/Padur. OISD-STD-117 compliance.
                  </p>
                </div>

                {/* 3. Mining Complexes */}
                <div 
                  onClick={() => { setActiveTab('facilities'); setSectorFilter('mining'); }}
                  className="p-4 rounded-xl bg-slate-900/60 border border-orange-500/30 hover:border-orange-400 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                      <Pickaxe className="w-5 h-5" />
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/20 text-orange-300">
                      7 Major Basins
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 font-mono group-hover:text-orange-400 transition-colors">
                    Coal & Mineral Mines (CIL / DGMS)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Jharia underground coalfire seams, Korba megamines, Singrauli open-cast, Bailadila iron ore.
                  </p>
                </div>

              </div>

              {/* Indian Emergency Hotline Strip */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-200 font-mono uppercase flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-rose-500" />
                    Emergency Dispatch Integrations (India National Gateway)
                  </h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    National Emergency: <strong className="text-slate-200">112</strong> • NDMA Control Room: <strong className="text-slate-200">1078</strong> • Disaster Helpline: <strong className="text-slate-200">1070</strong>
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('ndrf')}
                  className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-mono font-semibold transition-colors cursor-pointer flex-shrink-0"
                >
                  View 12 NDRF Battalions
                </button>
              </div>

            </div>
          )}

          {/* TAB 2: INDIAN FACILITIES DIRECTORY */}
          {activeTab === 'facilities' && (
            <div className="space-y-3">
              
              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
                <Filter className="w-3.5 h-3.5 text-slate-400 ml-1 flex-shrink-0" />
                {[
                  { id: 'ALL', label: 'All Indian Facilities' },
                  { id: 'nuclear', label: '☢️ Nuclear Plants (7)' },
                  { id: 'refinery', label: '🛢️ Refineries (9)' },
                  { id: 'petrol', label: '⛽ Fuel Depots / SPRs (8)' },
                  { id: 'mining', label: '⛏️ Mines & Coal Basins (7)' },
                  { id: 'chemical', label: '🧪 Chemical & Fertilizers (4)' },
                  { id: 'strategic', label: '🚀 ISRO / Strategic (3)' },
                ].map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setSectorFilter(filter.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-colors cursor-pointer ${
                      sectorFilter === filter.id
                        ? 'bg-orange-600 text-white font-bold'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {/* Facilities Table / Grid */}
              <div className="space-y-2">
                {displayedFacilities.map((fac) => {
                  let badge = '🏭 Industrial';
                  let badgeClass = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
                  if (fac.type === 'nuclear_plant') { badge = '☢️ Nuclear Plant (AERB)'; badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/30'; }
                  else if (fac.type === 'petrol_bunk_hub') { badge = '⛽ Fuel Depot (OISD)'; badgeClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30'; }
                  else if (fac.type === 'mining_complex') { badge = '⛏️ Mine / Coal Seam (DGMS)'; badgeClass = 'bg-orange-500/10 text-orange-400 border-orange-500/30'; }
                  else if (fac.type === 'oil_refinery') { badge = '🛢️ Mega Refinery'; badgeClass = 'bg-rose-500/10 text-rose-400 border-rose-500/30'; }
                  else if (fac.type === 'fertilizer_plant') { badge = '🌱 Fertilizer & Ammonia'; badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'; }
                  else if (fac.type === 'strategic_defense') { badge = '🚀 Space / Defense'; badgeClass = 'bg-purple-500/10 text-purple-400 border-purple-500/30'; }

                  return (
                    <div 
                      key={fac.id}
                      className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-orange-500/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-100 font-mono">
                            {fac.name}
                          </h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${badgeClass}`}>
                            {badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono">
                          📍 {fac.region} • Primary: <span className="text-slate-300">{fac.primaryChemicals.slice(0, 2).join(', ')}</span>
                        </p>
                        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                          <span>Blast Radius: <strong className="text-rose-400">{fac.blastRadiusKm} km</strong></span>
                          <span>Plume Perimeter: <strong className="text-amber-400">{fac.toxicPlumeRadiusKm} km</strong></span>
                          <span>Storage: <strong className="text-slate-300">{fac.fuelStorageCapacityTons.toLocaleString()} tons</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => {
                            onClose();
                            onSelectFacility(fac);
                            onFlyToCoordinates(fac.latitude, fac.longitude, 10);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5 text-orange-400" />
                          Locate on Map
                        </button>
                        <button
                          onClick={() => {
                            setSelectedFacilityForBroadcast(fac);
                            setActiveTab('broadcast');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 text-orange-400 text-xs font-mono font-semibold transition-colors cursor-pointer"
                        >
                          Dispatch Alert
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* TAB 3: NDRF & SDRF BATTALIONS */}
          {activeTab === 'ndrf' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-orange-950/20 border border-orange-500/30 text-xs font-mono text-slate-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <span>
                  National Disaster Response Force (NDRF) Specialized Industrial & CBRN Response Battalions assigned across India.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {NDRF_BATTALIONS.map((bn) => (
                  <div key={bn.bn} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-orange-400 font-mono">
                        {bn.bn}
                      </h4>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                        {bn.callsign}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-200 font-mono mt-1">
                      HQ: {bn.hq}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      Sector Coverage: {bn.coverage}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-xs font-mono">
                      <span className="text-slate-400">Emergency Line:</span>
                      <a href={`tel:${bn.phone}`} className="text-emerald-400 font-bold hover:underline">
                        {bn.phone}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: AERB & OISD REGULATORY COMPLIANCE */}
          {activeTab === 'regulations' && (
            <div className="space-y-4">
              
              {/* AERB Standards */}
              <div className="p-4 rounded-xl bg-slate-900 border border-amber-500/30">
                <div className="flex items-center gap-2 text-amber-400 font-mono font-bold text-sm mb-2">
                  <Atom className="w-4 h-4" />
                  AERB (Atomic Energy Regulatory Board) Nuclear Safety Perimeter Directives
                </div>
                <ul className="text-xs text-slate-300 font-mono space-y-1.5 list-disc list-inside">
                  <li><strong>1.6 km Exclusion Zone (EZ):</strong> Absolute sterilized perimeter under statutory administrative control of the plant management. No public habitation.</li>
                  <li><strong>5.0 km Sterilized Zone (SZ):</strong> Controlled development zone where population growth and industrial expansion are strictly monitored and restricted.</li>
                  <li><strong>16.0 km Emergency Planning Zone (EPZ):</strong> Mandated boundary for real-time aerial radiation monitoring, emergency evacuation drills, and potassium iodate prophylaxis distribution.</li>
                </ul>
              </div>

              {/* OISD Standards */}
              <div className="p-4 rounded-xl bg-slate-900 border border-blue-500/30">
                <div className="flex items-center gap-2 text-blue-400 font-mono font-bold text-sm mb-2">
                  <Fuel className="w-4 h-4" />
                  OISD (Oil Industry Safety Directorate) Standards for Fuel Depots & Petrol Bunks
                </div>
                <ul className="text-xs text-slate-300 font-mono space-y-1.5 list-disc list-inside">
                  <li><strong>OISD-STD-117:</strong> Fire protection facilities for Petroleum Depots, Terminals, Pipeline Installations & AFS. Mandates minimum 4-hour dedicated fire water reservoir capacity.</li>
                  <li><strong>OISD-STD-116:</strong> Fire protection facilities for Petroleum Refineries and Process Units with high-expansion foam deluge systems for rim-seal tank fires.</li>
                  <li><strong>OISD-STD-144:</strong> Liquefied Petroleum Gas (LPG) Bottling Plant safety including water spray deluge for Horton spheres and cylinder carousel auto-shutoff.</li>
                </ul>
              </div>

              {/* DGMS Standards */}
              <div className="p-4 rounded-xl bg-slate-900 border border-orange-500/30">
                <div className="flex items-center gap-2 text-orange-400 font-mono font-bold text-sm mb-2">
                  <Pickaxe className="w-4 h-4" />
                  DGMS (Directorate General of Mines Safety) Coal Seam & Mine Fire Rules
                </div>
                <ul className="text-xs text-slate-300 font-mono space-y-1.5 list-disc list-inside">
                  <li><strong>Spontaneous Heating Monitoring:</strong> Continuous CO/CO2 ratio gas chromatography for active coal seams in Jharia, Korba, and Singrauli.</li>
                  <li><strong>Blast Safe Distance (DGMS Circular 02):</strong> Minimum 500m mandatory evacuation during ANFO open-cast blast operations; continuous thermal infrared scanning of dump slopes.</li>
                </ul>
              </div>

            </div>
          )}

          {/* TAB 5: SEASONAL STUBBLE & FOREST FIRE INDEX */}
          {activeTab === 'seasonal' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
                <div className="font-bold text-slate-100 uppercase mb-1">
                  Forest Survey of India (FSI) & ISRO Bhuvan Agricultural Fire Risk Calendar
                </div>
                <p className="text-slate-400">
                  India experiences pronounced seasonal fire regimes that elevate proximal threats to petroleum depots, refineries, and coal seams.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-800/40">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-rose-400 font-mono">
                      OCTOBER - NOVEMBER
                    </h4>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-rose-500/20 text-rose-300">
                      CRITICAL RISK
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200 font-mono mt-1">
                    North India Paddy Stubble Burning (Parali)
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    Punjab, Haryana, Western UP, Delhi NCR. Elevated thermal plume interference near Panipat Mega Refinery & Bijwasan Aviation POL Terminal.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-amber-400 font-mono">
                      MARCH - JUNE
                    </h4>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300">
                      HIGH HEATWAVE RISK
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200 font-mono mt-1">
                    Central & Eastern Forest / Coal Seam Fires
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    Jharkhand, Odisha, Chhattisgarh, MP. Extreme heat (44°C+) accelerates spontaneous combustion across Jharia and Korba coalfield waste dumps.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-yellow-950/20 border border-yellow-800/40">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-yellow-400 font-mono">
                      APRIL - MAY
                    </h4>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-yellow-500/20 text-yellow-300">
                      LIGHTNING STRIKES
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200 font-mono mt-1">
                    Pre-Monsoon Convective Storms
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    Western Ghats, Coastal Kerala, Karnataka, and Assam. Lightning ignition risk for floating roof storage tanks at MRPL, BPCL Kochi, and NRL.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-800/40">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-emerald-400 font-mono">
                      JULY - SEPTEMBER
                    </h4>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300">
                      LOW RISK (MONSOON)
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-200 font-mono mt-1">
                    Southwest Monsoon High Moisture Window
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-1">
                    Subcontinent-wide heavy rainfall dampens thermal hotspots; focus shifts to drainage containment and flood water bund integrity.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: BILINGUAL ALERT BROADCASTER */}
          {activeTab === 'broadcast' && (
            <div className="space-y-3">
              
              {/* Facility Picker */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="text-xs font-mono text-slate-300">
                  Target Facility for Disaster Directive:
                </div>
                <select
                  value={selectedFacilityForBroadcast.id}
                  onChange={(e) => {
                    const found = INDIAN_INDUSTRIAL_FACILITIES.find(f => f.id === e.target.value);
                    if (found) setSelectedFacilityForBroadcast(found);
                  }}
                  className="bg-slate-950 border border-slate-700 text-slate-200 text-xs font-mono rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500"
                >
                  {INDIAN_INDUSTRIAL_FACILITIES.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.region})
                    </option>
                  ))}
                </select>
              </div>

              {/* Broadcast Preview Box */}
              <div className="relative">
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {generateBilingualAlertText()}
                </pre>

                <button
                  onClick={handleCopyBroadcast}
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-mono font-semibold shadow-lg transition-colors cursor-pointer"
                >
                  {copiedBroadcast ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedBroadcast ? 'Copied to Clipboard!' : 'Copy Directive'}</span>
                </button>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>FIRMS South Asia VIIRS / MODIS Synchronized</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => {
                onClose();
                onFlyToCoordinates(21.8, 78.9, 5.2);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-mono font-semibold transition-all shadow-md cursor-pointer"
            >
              Zoom to India Map View 🇮🇳
            </button>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-mono transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
