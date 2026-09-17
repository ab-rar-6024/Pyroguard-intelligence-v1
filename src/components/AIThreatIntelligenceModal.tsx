import React, { useState, useEffect } from 'react';
import {
  X,
  BrainCircuit,
  ShieldAlert,
  Radio,
  Wind,
  CheckSquare,
  Square,
  Loader2,
  Flame,
  AlertTriangle,
  FileCheck,
  Truck,
  Send,
  RefreshCw
} from 'lucide-react';
import { ThermalAnomaly, IndustrialFacility, AIThreatAnalysisReport } from '../types';

interface AIThreatIntelligenceModalProps {
  anomaly: ThermalAnomaly;
  facility: IndustrialFacility;
  onClose: () => void;
  onTriggerDispatch: (anomaly: ThermalAnomaly, facility: IndustrialFacility, customMessage?: string) => void;
}

export const AIThreatIntelligenceModal: React.FC<AIThreatIntelligenceModalProps> = ({
  anomaly,
  facility,
  onClose,
  onTriggerDispatch,
}) => {
  // Analysis State
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<AIThreatAnalysisReport | null>(null);
  const [reportSource, setReportSource] = useState<string>('AI Tactical Engine');
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});
  const [evacRadius, setEvacRadius] = useState<number>(facility.blastRadiusKm + 1.5);
  const [customNotes, setCustomNotes] = useState('');

  // Interactive Co-Pilot Chat
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; text: string; time: string }>>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const fetchAIAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-threat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facilityName: facility.name,
          facilityType: facility.type,
          distanceKm: anomaly.nearestFacility?.distanceKm || 2.0,
          frpMW: anomaly.frp,
          chemicals: facility.primaryChemicals,
          windSpeedKmh: anomaly.windSpeedKmh,
          windDirectionDeg: anomaly.windDirectionDeg,
          blastRadiusKm: facility.blastRadiusKm,
          provider: 'groq',
        }),
      });

      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
        setReportSource(data.source || 'AI Intelligence Engine');
      }
    } catch (e) {
      console.error('Failed to load AI situation analysis:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAIAnalysis();
  }, [anomaly, facility]);

  const handleSendChat = async (questionText?: string) => {
    const q = questionText || inputQuestion;
    if (!q.trim() || chatLoading) return;

    const userMsg = { role: 'user' as const, text: q, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    setChatMessages((prev) => [...prev, userMsg]);
    setInputQuestion('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: q,
          context: {
            facilityName: facility.name,
            facilityType: facility.type,
            chemicals: facility.primaryChemicals,
            blastRadiusKm: facility.blastRadiusKm,
            threatDistanceKm: anomaly.nearestFacility?.distanceKm,
            frpMW: anomaly.frp,
            windSpeedKmh: anomaly.windSpeedKmh,
            windDirectionDeg: anomaly.windDirectionDeg,
          },
          provider: 'groq',
        }),
      });

      const data = await res.json();
      const aiMsg = {
        role: 'ai' as const,
        text: data.reply || 'No tactical recommendation available.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: 'Tactical link interrupted. Ensure deluge monitors are engaged.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const toggleCheck = (index: number) => {
    setCheckedItems((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  // Lightweight markdown renderer — handles bold, headers, bullets, tables, dividers
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];

    const renderInline = (line: string, key: number): React.ReactNode => {
      // Process inline bold: **text**
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <span key={key}>
          {parts.map((part, i) =>
            i % 2 === 1 ? <strong key={i} className="font-bold text-white">{part}</strong> : part
          )}
        </span>
      );
    };

    lines.forEach((line, i) => {
      const trimmed = line.trim();

      // Horizontal rule
      if (trimmed === '---' || trimmed === '***') {
        elements.push(<hr key={i} className="border-slate-700 my-1.5" />);
      }
      // ### Header
      else if (trimmed.startsWith('### ')) {
        elements.push(
          <p key={i} className="font-bold text-orange-400 text-[11px] mt-2 mb-0.5 uppercase tracking-wide">
            {renderInline(trimmed.replace(/^###\s+/, ''), i)}
          </p>
        );
      }
      // ## Header
      else if (trimmed.startsWith('## ')) {
        elements.push(
          <p key={i} className="font-bold text-orange-300 text-xs mt-2 mb-0.5">
            {renderInline(trimmed.replace(/^##\s+/, ''), i)}
          </p>
        );
      }
      // Table row (| col | col |)
      else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());
        // Skip separator rows (|---|---|)
        if (cells.some(c => /^[-:]+$/.test(c))) return;
        const isHeader = i > 0 && lines[i - 1]?.trim().startsWith('|') && (lines[i + 1]?.trim() || '').replace(/[| :-]/g, '') === '';
        elements.push(
          <div key={i} className="flex gap-2 text-[10px] border-b border-slate-800 py-0.5">
            {cells.map((cell, ci) => (
              <span key={ci} className={`flex-1 ${isHeader ? 'font-bold text-slate-300' : 'text-slate-400'}`}>
                {renderInline(cell, ci)}
              </span>
            ))}
          </div>
        );
      }
      // Bullet point: starts with • or - or *
      else if (/^[•\-\*]\s/.test(trimmed)) {
        elements.push(
          <div key={i} className="flex gap-1.5 text-[11px] leading-relaxed">
            <span className="text-orange-400 flex-shrink-0 mt-px">•</span>
            <span className="text-slate-300">{renderInline(trimmed.replace(/^[•\-\*]\s+/, ''), i)}</span>
          </div>
        );
      }
      // Numbered list
      else if (/^\d+\.\s/.test(trimmed)) {
        const num = trimmed.match(/^(\d+)\./)![1];
        elements.push(
          <div key={i} className="flex gap-1.5 text-[11px] leading-relaxed">
            <span className="text-orange-400 flex-shrink-0 font-bold min-w-[14px]">{num}.</span>
            <span className="text-slate-300">{renderInline(trimmed.replace(/^\d+\.\s+/, ''), i)}</span>
          </div>
        );
      }
      // Empty line → small spacer
      else if (trimmed === '') {
        elements.push(<div key={i} className="h-1" />);
      }
      // Normal paragraph line
      else {
        elements.push(
          <p key={i} className="text-[11px] leading-relaxed text-slate-300">
            {renderInline(trimmed, i)}
          </p>
        );
      }
    });

    return <div className="space-y-0.5">{elements}</div>;
  };

  const handleDispatch = () => {
    const msg = customNotes
      ? `TACTICAL AI DISPATCH: ${customNotes}`
      : `EMERGENCY EVACUATION & SUPPRESSION DISPATCH: Threat near ${facility.name}. Calculated perimeter: ${evacRadius} km.`;
    onTriggerDispatch(anomaly, facility, msg);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xl">
      <div className="bg-black/95 border border-orange-500/30 rounded-2xl w-full max-w-4xl max-h-[96vh] sm:max-h-[90vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.95)] overflow-hidden font-mono text-slate-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-orange-500/20 bg-black/80">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="p-2 sm:p-2.5 rounded-xl bg-black/80 border border-orange-500/40 text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.3)] flex-shrink-0">
              <BrainCircuit className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h3 className="text-xs sm:text-base font-bold text-white tracking-wide truncate glow-orange">
                  AI Hazard & Incident Co-Pilot
                </h3>
                <span className="px-2 py-0.5 rounded text-[9px] sm:text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.2)]">
                  LIVE ADVISOR
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
                Target: <strong className="text-slate-200">{facility.name}</strong> • Proximity: <strong className="text-orange-400">{anomaly.nearestFacility?.distanceKm.toFixed(1)} km</strong> ({anomaly.frp} MW)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAIAnalysis}
              title="Regenerate Tactical Analysis"
              className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-orange-400 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-orange-400 hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
          
          {/* Situation Context Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-900/60 p-2.5 sm:p-3 rounded-xl border border-slate-800 text-[11px] sm:text-xs">
            <div>
              <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase">Chemical Stored</div>
              <div className="font-bold text-slate-200 truncate">
                {facility.primaryChemicals.slice(0, 2).join(', ')}
              </div>
            </div>
            <div>
              <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase">FRP Radiance</div>
              <div className="font-bold text-orange-400 flex items-center gap-1">
                <Flame className="w-3 h-3" /> {anomaly.frp} MW
              </div>
            </div>
            <div>
              <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase">Wind Vector</div>
              <div className="font-bold text-sky-400 flex items-center gap-1">
                <Wind className="w-3 h-3" /> {anomaly.windSpeedKmh} km/h
              </div>
            </div>
            <div>
              <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase">Blast Zone Base</div>
              <div className="font-bold text-rose-400">{facility.blastRadiusKm} km</div>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
              <div className="text-sm text-slate-300 font-bold text-center">
                Synthesizing real-time hazard intelligence & mitigation directives...
              </div>
              <p className="text-xs text-slate-400 text-center max-w-md">
                Running computational dispersion, apparatus sizing, and structural ignition models
              </p>
            </div>
          ) : report ? (
            <div className="space-y-3 sm:space-y-4">
              
              {/* Executive Summary */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-orange-950/20 border border-orange-500/30">
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <div className="flex items-center gap-2 text-xs font-bold text-orange-400 uppercase tracking-wide">
                    <AlertTriangle className="w-4 h-4" /> Strategic Assessment
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Intelligence Engine: <strong className="text-slate-300">{reportSource}</strong>
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                  {report.executiveSummary}
                </p>
              </div>

              {/* Blast & Evacuation Perimeter Sizing */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" /> Perimeter & Toxic Plume Evacuation Zone
                  </div>
                  <div className="text-xs text-rose-400 font-bold">
                    {evacRadius.toFixed(1)} km Radius
                  </div>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  {report.blastRadiusEvaluation}
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min={facility.blastRadiusKm}
                    max={facility.blastRadiusKm + 10}
                    step={0.5}
                    value={evacRadius}
                    onChange={(e) => setEvacRadius(Number(e.target.value))}
                    className="flex-1 accent-orange-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-400 whitespace-nowrap font-mono">
                    Target: {evacRadius.toFixed(1)} km
                  </span>
                </div>
              </div>

              {/* Recommended Apparatus Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 sm:p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs font-bold text-slate-200 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-cyan-400" /> Recommended Suppression Apparatus
                  </div>
                  <ul className="space-y-1.5 text-[11px] sm:text-xs text-slate-300">
                    {report.recommendedApparatus?.map((app, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-cyan-400">•</span>
                        <span>{app}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Priority Operational Directives Checklist */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs font-bold text-slate-200 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-400" /> Operational Directives
                  </div>
                  <ul className="space-y-1.5 text-[11px] sm:text-xs">
                    {report.mitigationDirectives?.map((dir, idx) => (
                      <li
                        key={idx}
                        onClick={() => toggleCheck(idx)}
                        className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                          checkedItems[idx]
                            ? 'bg-emerald-950/40 text-emerald-300 line-through opacity-70'
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        {checkedItems[idx] ? (
                          <CheckSquare className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                        )}
                        <span>{dir}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Interactive AI Co-Pilot Tactical Query */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                    <BrainCircuit className="w-4 h-4 text-orange-400" /> Tactical Co-Pilot Inquiry
                  </div>
                  <span className="text-[10px] text-slate-400">Instant AI Hazard Assessment & Strategy</span>
                </div>

                {/* Quick chip queries */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'What water curtain flow rate is needed?',
                    'Draft staff evacuation broadcast text',
                    'BLEVE danger timeline for propane tanks',
                    'Hazmat PPE requirements for these chemicals'
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendChat(chip)}
                      className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded text-[10px] sm:text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Conversation History */}
                {chatMessages.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto p-2 bg-slate-950/80 rounded-lg border border-slate-800">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-lg ${
                          msg.role === 'user'
                            ? 'bg-slate-800/80 ml-4'
                            : 'bg-orange-950/20 border border-orange-500/20 mr-2'
                        }`}
                      >
                        <div className="text-[9px] text-slate-400 mb-1 flex justify-between">
                          <span className="font-bold">{msg.role === 'user' ? 'Operator Inquiry' : 'Tactical AI Co-Pilot'}</span>
                          <span>{msg.time}</span>
                        </div>
                        {msg.role === 'user' ? (
                          <p className="text-[11px] text-slate-200 leading-relaxed">{msg.text}</p>
                        ) : (
                          renderMarkdown(msg.text)
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Chat Input */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <input
                    type="text"
                    value={inputQuestion}
                    onChange={(e) => setInputQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    placeholder="Ask AI for specialized tactical calculations, foam types, or protocols..."
                    className="flex-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 sm:px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 min-h-[38px]"
                  />
                  <button
                    onClick={() => handleSendChat()}
                    disabled={chatLoading || !inputQuestion.trim()}
                    className="px-3 py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 min-h-[38px]"
                  >
                    {chatLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span className="hidden xs:inline">Ask</span>
                  </button>
                </div>
              </div>

              {/* Custom Dispatch Directive Notes */}
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase">
                  Custom Incident Command Orders:
                </label>
                <textarea
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="e.g., Immediate foam monitor deployment to Bay 4; initiate CAP siren sequence..."
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-orange-500 placeholder-slate-600"
                />
              </div>

            </div>
          ) : null}

        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
          <div className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
            Emergency Channel: <strong className="text-slate-200">{facility.emergencyContact.radioChannel}</strong> • Unit: <strong className="text-slate-200">{facility.emergencyContact.responderUnit}</strong>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
            >
              Close
            </button>
            <button
              onClick={handleDispatch}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/50 transition-all cursor-pointer min-h-[40px]"
            >
              <Radio className="w-4 h-4" />
              <span>Broadcast Tactical Dispatch</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
