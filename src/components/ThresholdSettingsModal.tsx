import React, { useState } from 'react';
import { 
  X,
  Settings,
  Bell,
  ShieldAlert,
  Radio, 
  Sliders, 
  Save,
  CheckCircle2,
  Key,
  Satellite,
  RefreshCw,
  Zap,
  Eye,
  EyeOff
} from 'lucide-react';
import { NotificationThresholds } from '../types';

interface ThresholdSettingsModalProps {
  thresholds: NotificationThresholds;
  onSave: (newThresholds: NotificationThresholds) => void;
  onClose: () => void;
  onRefreshSatellites?: () => void;
}

export const ThresholdSettingsModal: React.FC<ThresholdSettingsModalProps> = ({
  thresholds,
  onSave,
  onClose,
  onRefreshSatellites,
}) => {
  const [form, setForm] = useState<NotificationThresholds>({ ...thresholds });
  const [savedMessage, setSavedMessage] = useState(false);
  const [nasaKey, setNasaKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pyroguard_nasa_key') || '4ddefd0f9c4e2cf87148595c54a19642';
    }
    return '4ddefd0f9c4e2cf87148595c54a19642';
  });
  const [showKey, setShowKey] = useState(false);
  const [isUpdatingKey, setIsUpdatingKey] = useState(false);
  const [keyUpdateMsg, setKeyUpdateMsg] = useState<string | null>('Connected to NASA Earthdata Live VIIRS/MODIS Feeds');
  const [pushStatus, setPushStatus] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  const requestBrowserPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setPushStatus(perm);
        if (perm === 'granted') {
          setForm((prev) => ({ ...prev, browserPushEnabled: true }));
        }
      } catch (e) {
        console.warn('Could not request notification permission:', e);
      }
    }
  };

  const handleTestUpdateKey = async () => {
    if (!nasaKey || nasaKey.length < 8) return;
    setIsUpdatingKey(true);
    setKeyUpdateMsg(null);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('pyroguard_nasa_key', nasaKey.trim());
      }
      const res = await fetch('/api/firms/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: nasaKey.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setKeyUpdateMsg(`Live sync verified: ${data.totalDetections || 'Active'} anomalies tracked`);
        if (onRefreshSatellites) {
          onRefreshSatellites();
        }
      } else {
        setKeyUpdateMsg(data.error || 'Failed to sync NASA key');
      }
    } catch (e: any) {
      setKeyUpdateMsg(`Error: ${e.message}`);
    } finally {
      setIsUpdatingKey(false);
    }
  };

  const handleSave = () => {
    onSave(form);
    setSavedMessage(true);
    setTimeout(() => {
      setSavedMessage(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-black/85 backdrop-blur-xl font-mono text-slate-100">
      <div className="bg-black/95 border border-orange-500/30 rounded-2xl w-full max-w-lg shadow-[0_20px_60px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-orange-500/20 bg-black/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-black/80 border border-orange-500/40 text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.3)]">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wide uppercase text-white glow-orange">
                NASA FIRMS & Emergency Thresholds
              </h2>
              <div className="text-[11px] text-slate-400">
                Satellite stream & automated responder triggers
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-orange-400 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 space-y-4 text-xs overflow-y-auto">

          {/* NASA FIRMS Live API Key Section */}
          <div className="bg-emerald-950/30 p-3.5 rounded-xl border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between text-emerald-300 font-bold">
              <div className="flex items-center gap-2">
                <Satellite className="w-4 h-4 text-emerald-400" />
                <span>NASA FIRMS API Key (Live Satellite Data)</span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ACTIVE FEED
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              NASA Earthdata MAP Key for direct VIIRS (Suomi-NPP / NOAA-20) and MODIS thermal radiance polling.
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Key className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showKey ? 'text' : 'password'}
                  value={nasaKey}
                  onChange={(e) => setNasaKey(e.target.value)}
                  placeholder="Enter NASA FIRMS MAP_KEY..."
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-8 py-1.5 text-xs text-emerald-400 font-mono tracking-wider focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? 'Hide Secret Key' : 'Reveal Secret Key'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleTestUpdateKey}
                disabled={isUpdatingKey}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingKey ? 'animate-spin' : ''}`} />
                <span>{isUpdatingKey ? 'Syncing...' : 'Sync Key'}</span>
              </button>
            </div>
            {keyUpdateMsg && (
              <div className="text-[10px] text-emerald-400/90 font-mono flex items-center gap-1.5 pt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {keyUpdateMsg}
              </div>
            )}
          </div>
          
          {/* Proximity Distance Threshold */}
          <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex justify-between items-center text-slate-200">
              <span className="font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                Critical Proximity Alert Threshold:
              </span>
              <span className="text-rose-400 font-extrabold text-sm">{form.maxDistanceKm} km</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Triggers emergency escalation if a thermal anomaly is within this distance of any industrial asset.
            </p>
            <input
              type="range"
              min="1.0"
              max="15.0"
              step="0.5"
              value={form.maxDistanceKm}
              onChange={(e) => setForm({ ...form, maxDistanceKm: Number(e.target.value) })}
              className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded cursor-pointer mt-1"
            />
          </div>

          {/* Min FRP Threshold */}
          <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex justify-between items-center text-slate-200">
              <span className="font-bold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-orange-400" />
                Minimum Fire Radiative Power (FRP):
              </span>
              <span className="text-orange-400 font-extrabold text-sm">{form.minFrpMW} MW</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Ignore low-intensity thermal noise below this radiative threshold.
            </p>
            <input
              type="range"
              min="10"
              max="150"
              step="5"
              value={form.minFrpMW}
              onChange={(e) => setForm({ ...form, minFrpMW: Number(e.target.value) })}
              className="w-full accent-orange-500 h-1.5 bg-slate-800 rounded cursor-pointer mt-1"
            />
          </div>

          {/* Min Composite Risk Score */}
          <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex justify-between items-center text-slate-200">
              <span className="font-bold flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                Minimum Composite Threat Score:
              </span>
              <span className="text-amber-400 font-extrabold text-sm">{form.minRiskScore} / 100</span>
            </div>
            <input
              type="range"
              min="30"
              max="90"
              step="5"
              value={form.minRiskScore}
              onChange={(e) => setForm({ ...form, minRiskScore: Number(e.target.value) })}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded cursor-pointer mt-1"
            />
          </div>

          {/* Notification Channels & Sound Controls */}
          <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-2.5">
            <div className="font-bold text-slate-200 uppercase text-[11px] mb-1">
              Alert Notification Channels
            </div>

            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-cyan-400" /> Browser Web Push Alerts
              </span>
              <div className="flex items-center gap-2">
                {pushStatus !== 'granted' && (
                  <button
                    onClick={requestBrowserPermission}
                    className="px-2 py-0.5 rounded bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-[10px] cursor-pointer"
                  >
                    Enable
                  </button>
                )}
                <input
                  type="checkbox"
                  checked={form.browserPushEnabled}
                  onChange={(e) => setForm({ ...form, browserPushEnabled: e.target.checked })}
                  className="accent-orange-500 rounded"
                />
              </div>
            </div>

            <label className="flex items-center justify-between text-slate-300 cursor-pointer">
              <span className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-rose-400" /> Auto-Dispatch First Responders on Critical Breach
              </span>
              <input
                type="checkbox"
                checked={form.autoDispatchEnabled}
                onChange={(e) => setForm({ ...form, autoDispatchEnabled: e.target.checked })}
                className="accent-orange-500 rounded"
              />
            </label>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-orange-500/20 bg-black/80">
          <div>
            {savedMessage && (
              <span className="text-emerald-400 text-xs flex items-center gap-1 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Settings Saved!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold cursor-pointer border border-white/10"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black text-xs font-bold shadow-[0_0_15px_rgba(249,115,22,0.4)] cursor-pointer transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save & Apply</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
