export type AnomalySeverity = 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'WATCH';

export type IndustryType =
  | 'oil_refinery'
  | 'petrol_bunk_hub'
  | 'chemical_plant'
  | 'lng_terminal'
  | 'power_plant'
  | 'nuclear_plant'
  | 'mining_complex'
  | 'strategic_defense'
  | 'fertilizer_plant'
  | 'ammunition_depot'
  | 'manufacturing_hub'
  | 'timber_mill';

export interface IndustrialFacility {
  id: string;
  name: string;
  type: IndustryType;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
  hazardLevel: 'EXTREME' | 'HIGH' | 'MODERATE';
  primaryChemicals: string[];
  fuelStorageCapacityTons: number;
  blastRadiusKm: number;
  toxicPlumeRadiusKm: number;
  emergencyContact: {
    responderUnit: string;
    phone: string;
    radioChannel: string;
    hazmatLevel: string;
  };
  status: 'NORMAL' | 'ALERT' | 'EVACUATING' | 'CRITICAL';
}

export interface ThermalAnomaly {
  id: string;
  latitude: number;
  longitude: number;
  brightness: number; // Kelvin
  bright_t31?: number; // Kelvin
  frp: number; // Fire Radiative Power in MW
  scan: number;
  track: number;
  acq_date: string;
  acq_time: string;
  satellite: 'VIIRS-SNPP' | 'VIIRS-NOAA20' | 'VIIRS-NOAA21' | 'MODIS-Terra' | 'MODIS-Aqua';
  confidence: 'nominal' | 'high' | 'critical' | 'low';
  daynight: 'D' | 'N';
  windSpeedKmh: number;
  windDirectionDeg: number;
  nearestFacility?: {
    facility: IndustrialFacility;
    distanceKm: number;
    threatScore: number; // 0 - 100
    threatLevel: AnomalySeverity;
    timeToImpactHours: number;
    windSpreadRisk: 'DIRECT' | 'CROSSWIND' | 'AWAY' | 'STAGNANT';
  };
}

export interface EmergencyAlert {
  id: string;
  timestamp: string;
  facilityId: string;
  facilityName: string;
  anomalyId: string;
  severity: AnomalySeverity;
  title: string;
  message: string;
  distanceKm: number;
  frpMW: number;
  dispatchedTo: string[];
  status: 'DISPATCHED' | 'ACKNOWLEDGED' | 'CONTAINED' | 'ESCALATED';
  evacuationPerimeterKm: number;
  apparatusAssigned: string[];
}

export interface NotificationThresholds {
  maxDistanceKm: number;
  minFrpMW: number;
  minRiskScore: number;
  autoDispatchEnabled: boolean;
  browserPushEnabled: boolean;
  repeatAlertIntervalMinutes: number;
}

export type AppTheme = 'dark' | 'light';

export interface GISLayerConfig {
  mapStyle: 'dark' | 'light' | 'satellite' | 'terrain' | 'osm' | 'nasa-live';
  showThermalOverlay: boolean;
  showFacilityMarkers: boolean;
  showBlastZones: boolean;
  showWindVectors: boolean;
  showEvacZones: boolean;
  showHeatmap: boolean;
  minFRPFilter: number;
  selectedFacilityType: string;
  selectedSeverity: string;
}

export interface WidgetVisibilityState {
  threatMatrix: boolean;
  liveFeed: boolean;
  frpChart: boolean;
  sectorDistribution: boolean;
  dispatchConsole: boolean;
  windSpreadPredictor: boolean;
  systemTelemetry: boolean;
  complianceStats: boolean;
}

export interface FIRMSFeedStatus {
  isRealData: boolean;
  apiKeyConfigured: boolean;
  lastSyncTime: string;
  totalLiveDetections: number;
  activeSatellites: string[];
  sourcesQueried: string[];
  statusMessage: string;
}

export interface AIAuditReport {
  timestamp: string;
  executiveSummary: string;
  criticalZonesIdentified: number;
  facilitiesUnderImmediateThreat: Array<{
    facilityName: string;
    threatLevel: string;
    distanceKm: number;
    immediateActions: string[];
  }>;
  evacuationRecommendations: string[];
  oshaviolationRisks: string[];
  generatedBy: string;
}

export type AIProvider = 'gemini' | 'openrouter' | 'huggingface';

export interface AIThreatAnalysisReport {
  executiveSummary: string;
  blastRadiusEvaluation: string;
  recommendedApparatus: string[];
  mitigationDirectives: string[];
  containmentStrategy?: string;
  chemicalHazardsAssessment?: string;
}

export interface AIProviderOption {
  id: AIProvider;
  name: string;
  badge: string;
  description: string;
  defaultModel: string;
  availableModels: { id: string; name: string; isFree?: boolean }[];
  isDefault?: boolean;
}
