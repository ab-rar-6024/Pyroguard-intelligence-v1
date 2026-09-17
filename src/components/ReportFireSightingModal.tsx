import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Flame, X, TriangleAlert, Navigation, MapPin, Camera, Loader2, CheckCircle2 } from 'lucide-react';

interface ReportFireSightingModalProps {
  onClose: () => void;
  onSubmitted?: () => void;
}

const MAX_PHOTO_DIMENSION = 1280;
const PHOTO_JPEG_QUALITY = 0.8;

// Reads an image file, downsizes it to a max dimension, and re-encodes as JPEG so the
// base64 payload sent to the server stays small regardless of the original phone photo size.
function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode the selected image.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > MAX_PHOTO_DIMENSION) {
          height = Math.round((height * MAX_PHOTO_DIMENSION) / width);
          width = MAX_PHOTO_DIMENSION;
        } else if (height > MAX_PHOTO_DIMENSION) {
          width = Math.round((width * MAX_PHOTO_DIMENSION) / height);
          height = MAX_PHOTO_DIMENSION;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported.'));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export const ReportFireSightingModal: React.FC<ReportFireSightingModalProps> = ({ onClose, onSubmitted }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [landmark, setLandmark] = useState('');
  const [description, setDescription] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const placeMarker = (lat: number, lon: number) => {
    if (!mapInstanceRef.current) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
    } else {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#f97316;border:2px solid white;box-shadow:0 0 10px rgba(249,115,22,0.8);"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      markerRef.current = L.marker([lat, lon], { icon, draggable: true }).addTo(mapInstanceRef.current);
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current!.getLatLng();
        setLocation({ lat: pos.lat, lon: pos.lng });
      });
    }
    mapInstanceRef.current.setView([lat, lon], mapInstanceRef.current.getZoom() < 4 ? 6 : mapInstanceRef.current.getZoom());
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20, 10],
      zoom: 2,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      setLocation({ lat: e.latlng.lat, lon: e.latlng.lng });
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (location) placeMarker(location.lat, location.lon);
  }, [location]);

  const handleUseLiveLocation = () => {
    if (!navigator.geolocation) {
      setSubmitError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setSubmitError('Could not get your location. Try clicking/dragging the pin on the map instead.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setPhotoDataUrl(dataUrl);
    } catch (err: any) {
      setPhotoError(err.message || 'Failed to process the photo.');
    }
  };

  const canSubmit = location !== null && photoDataUrl !== null && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !location || !photoDataUrl) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/citizen-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          latitude: location.lat,
          longitude: location.lon,
          landmark,
          photoDataUrl,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setSubmitError(data.error || 'Failed to submit report.');
        return;
      }
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      setSubmitError('Failed to reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 font-mono text-slate-100">
      <div
        className="w-full max-w-lg max-h-[90vh] bg-slate-950 border border-orange-500/25 rounded-2xl shadow-[0_12px_60px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-orange-500/20">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-black/70 border border-orange-500/40 flex items-center justify-center text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.3)] flex-shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white">Report a Fire Sighting</h2>
              <p className="text-[11px] text-slate-400">Seen a fire the satellite hasn't caught yet? Help fill the gap.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer flex-shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Report submitted</h3>
            <p className="text-xs text-slate-400">
              Thanks - your sighting has been logged for cross-checking in Incident History &rarr; Citizen Reports.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-glass p-4 space-y-4 text-xs">
            {/* Warning banner */}
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300">
              <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                This is a ground-truth report for cross-checking, not an emergency dispatch. If this is life-threatening, contact local emergency services directly.
              </p>
            </div>

            {/* 1. Location */}
            <div>
              <div className="font-bold text-slate-200 mb-1.5">1. Location</div>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={handleUseLiveLocation}
                  disabled={locating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 font-bold text-[11px] cursor-pointer disabled:opacity-60"
                >
                  {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
                  Use My Live Location
                </button>
                <span className="text-slate-500 text-[11px]">or click/drag the pin on the map</span>
              </div>
              <div
                ref={mapContainerRef}
                className="w-full h-52 rounded-xl overflow-hidden border border-white/10"
              />
              <div className="flex items-center gap-1 mt-1.5 text-[11px] text-slate-400">
                <MapPin className="w-3 h-3" />
                {location ? `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}` : 'No location set yet'}
              </div>
            </div>

            {/* 2. Landmark */}
            <div>
              <div className="font-bold text-slate-200 mb-1.5">2. Landmark (optional)</div>
              <input
                type="text"
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder="e.g. behind the water tank, near the old grain mill"
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 text-[11px] focus:outline-none focus:border-orange-500/50"
              />
            </div>

            {/* 3. Description */}
            <div>
              <div className="font-bold text-slate-200 mb-1.5">3. What do you see? (optional)</div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Smoke color, flame size, how fast it's spreading..."
                rows={3}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 text-[11px] focus:outline-none focus:border-orange-500/50 resize-none"
              />
            </div>

            {/* 4. Photo */}
            <div>
              <div className="font-bold text-slate-200 mb-1.5">4. Reference photo (required, to verify authenticity)</div>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 font-bold text-[11px] cursor-pointer w-fit">
                <Camera className="w-3.5 h-3.5" />
                Attach / Take Photo
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
              </label>
              {photoError && <p className="text-rose-400 text-[11px] mt-1.5">{photoError}</p>}
              {photoDataUrl && (
                <img src={photoDataUrl} alt="Reference" className="mt-2 max-h-32 rounded-lg border border-white/10" />
              )}
            </div>

            {submitError && <p className="text-rose-400 text-[11px]">{submitError}</p>}
          </div>
        )}

        {!submitted && (
          <div className="p-4 border-t border-white/5">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-xs transition-colors ${
                canSubmit
                  ? 'bg-orange-600 hover:bg-orange-500 text-white cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
              Submit Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
