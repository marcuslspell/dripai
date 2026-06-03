import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "dripaiv3_lines";
const ID_KEY      = "dripaiv3_nextid";
const API_KEY     = import.meta.env.VITE_ANTHROPIC_KEY;

const COLORS = {
  bg:       "#0a0f1a",
  surface:  "#111827",
  surface2: "#1a2235",
  border:   "#1f2d45",
  accent:   "#00d4aa",
  blue:     "#0ea5e9",
  warn:     "#f59e0b",
  danger:   "#ef4444",
  text:     "#e2e8f0",
  muted:    "#64748b",
};

const STATUS_STYLES = {
  success: { bg: "rgba(0,212,170,0.1)",  color: COLORS.accent, border: "rgba(0,212,170,0.25)" },
  error:   { bg: "rgba(239,68,68,0.1)",  color: COLORS.danger, border: "rgba(239,68,68,0.25)" },
  warn:    { bg: "rgba(245,158,11,0.1)", color: COLORS.warn,   border: "rgba(245,158,11,0.25)" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcMlHr(vol, min) {
  if (!vol || !min || min <= 0) return null;
  return (vol / min) * 60;
}

function fmtTime(min) {
  if (!min) return "—";
  if (min < 60) return `${min}min`;
  const h = min / 60;
  return h % 1 === 0 ? `${h}hr` : `${h.toFixed(1)}hr`;
}

function loadLines()  { try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : []; } catch { return []; } }
function loadNextId() { try { return parseInt(localStorage.getItem(ID_KEY) || "1"); } catch { return 1; } }

// ─── AI Parse ────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a clinical IV rate calculation assistant embedded in a nursing tool.
Parse instructions about IV drips and extract structured data.
Convert time: "1 hour"=60, "2 hours"=120, "30 minutes"=30, "half hour"=30, "90 min"=90.
If instruction updates an existing line (words: change, update, adjust, switch, modify), set action="update".
If adding new line, set action="add".
Respond ONLY with valid compact JSON, no markdown, no explanation:
{"action":"add|update","room":"string or null","drug":"string or null","volumeMl":number_or_null,"timeMin":number_or_null,"notes":"string or null","warning":"string or null","summary":"plain English one sentence of what was done"}`;

async function parseWithAI(text){
  console.log("API KEY present:", !!API_KEY);
  console.log("Sending text:", text);
  
  const resp=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":API_KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,system:SYSTEM_PROMPT,messages:[{role:"user",content:text}]}),
  });
  
  const data=await resp.json();
  console.log("Response status:", resp.status);
  console.log("Response body:", JSON.stringify(data));
  
  if(!resp.ok)throw new Error(`API ${resp.status}`);
  const raw=data.content.map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
  return JSON.parse(raw);
}
// ─── Components ───────────────────────────────────────────────────────────────

function StatusBanner({ status }) {
  if (!status) return null;
  const s = STATUS_STYLES[status.type];
  return (
    <div style={{ marginTop: 10, padding: "9px 13px", borderRadius: 8, background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontFamily: "IBM Plex Mono", fontSize: 12, animation: "slideIn 0.2s ease" }}>
      {status.msg}
    </div>
  );
}

function VoiceButton({ onTranscript, disabled }) {
  const [listening, setListening] = useState(false);
  const recogRef = useRef(null);

  const toggle = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Voice input isn't supported on this browser. Try Chrome on Android or Safari on iOS."); return; }

    if (listening) {
      recogRef.current?.stop();
      setListening(false);
      return;
    }

    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = false;
    r.maxAlternatives = 1;
    recogRef.current = r;

    r.onresult = e => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
      setListening(false);
    };
    r.onerror = () => setListening(false);
    r.onend   = () => setListening(false);
    r.start();
    setListening(true);
  }, [listening, onTranscript]);

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      title={listening ? "Tap to stop" : "Tap to speak"}
      style={{
        position: "relative",
        width: 46, height: 46,
        borderRadius: "50%",
        background: listening ? "rgba(239,68,68,0.15)" : COLORS.surface2,
        border: `1px solid ${listening ? COLORS.danger : COLORS.border}`,
        color: listening ? COLORS.danger : COLORS.muted,
        fontSize: 18,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        transition: "all 0.2s",
      }}
    >
      {listening && (
        <span style={{
          position: "absolute", inset: -4,
          borderRadius: "50%",
          border: `2px solid ${COLORS.danger}`,
          animation: "ripple 1.2s ease-out infinite",
          pointerEvents: "none",
        }} />
      )}
      {listening ? "⏹" : "🎤"}
    </button>
  );
}

function LineCard({ line, onUpdate, onRemove }) {
  const rate    = calcMlHr(line.volumeMl, line.timeMin);
  const flagged = rate && rate > 500;

  return (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${line.highlight ? COLORS.accent : flagged ? COLORS.warn : COLORS.border}`,
      borderRadius: 12, padding: 16,
      boxShadow: line.highlight ? `0 0 16px rgba(0,212,170,0.13)` : "none",
      transition: "border-color 0.4s, box-shadow 0.4s",
      animation: "slideIn 0.25s ease",
    }}>
      {/* Top */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ background: `linear-gradient(135deg,${COLORS.accent},${COLORS.blue})`, color: "#0a0f1a", fontFamily: "IBM Plex Mono", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 5, whiteSpace: "nowrap" }}>
          RM {line.room || "?"}
        </div>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: line.drug ? COLORS.text : COLORS.muted }}>
          {line.drug || "No drug entered"}
        </div>
        <button onClick={() => onRemove(line.id)} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "4px 9px", color: COLORS.muted, cursor: "pointer", fontSize: 12, transition: "all 0.15s" }}
          onMouseEnter={e => { e.target.style.borderColor = COLORS.danger; e.target.style.color = COLORS.danger; }}
          onMouseLeave={e => { e.target.style.borderColor = COLORS.border; e.target.style.color = COLORS.muted; }}>
          ✕
        </button>
      </div>

      {/* Fields */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Room",        field: "room",     placeholder: "4A",      type: "text"   },
          { label: "Drug / Fluid",field: "drug",     placeholder: "Heparin", type: "text"   },
          { label: "Volume (mL)", field: "volumeMl", placeholder: "100",     type: "number" },
          { label: "Over (min)",  field: "timeMin",  placeholder: "60",      type: "number" },
          { label: "Notes",       field: "notes",    placeholder: "optional",type: "text"   },
        ].map(f => (
          <div key={f.field}>
            <div style={{ fontFamily: "IBM Plex Mono", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: COLORS.muted, marginBottom: 4 }}>{f.label}</div>
            <input
              type={f.type}
              value={line[f.field] || ""}
              placeholder={f.placeholder}
              onChange={e => onUpdate(line.id, f.field, f.type === "number" ? (parseFloat(e.target.value) || "") : e.target.value)}
              style={{ width: "100%", background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "7px 9px", color: COLORS.text, fontFamily: "IBM Plex Mono", fontSize: 12 }}
            />
          </div>
        ))}
      </div>

      {/* Result */}
      <div style={{ background: COLORS.surface2, borderRadius: 8, padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontFamily: "IBM Plex Mono", fontSize: 24, fontWeight: 700, color: COLORS.accent }}>{rate ? rate.toFixed(1) : "—"}</span>
          <span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: COLORS.muted, marginLeft: 4 }}>mL/hr</span>
          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
            {line.volumeMl || "—"}mL over {fmtTime(line.timeMin)}
          </div>
        </div>
        {flagged && (
          <div style={{ background: "rgba(245,158,11,0.12)", color: COLORS.warn, border: "1px solid rgba(245,158,11,0.3)", fontFamily: "IBM Plex Mono", fontSize: 10, padding: "4px 9px", borderRadius: 5 }}>
            ⚠ Verify rate
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [lines,  setLines]  = useState(loadLines);
  const [nextId, setNextId] = useState(loadNextId);
  const [input,  setInput]  = useState("");
  const [loading, setLoading] = useState(false);
  const [status,  setStatus]  = useState(null);
  const [clock,   setClock]   = useState("");
  const inputRef = useRef();

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
      localStorage.setItem(ID_KEY, String(nextId));
    } catch {}
  }, [lines, nextId]);

  function showStatus(msg, type = "success") {
    setStatus({ msg, type });
    setTimeout(() => setStatus(null), 4500);
  }

  function addLine(data = {}) {
    setLines(prev => [...prev, {
      id: nextId, room: data.room || "", drug: data.drug || "",
      volumeMl: data.volumeMl || "", timeMin: data.timeMin || "",
      notes: data.notes || "", highlight: data.highlight || false,
    }]);
    setNextId(n => n + 1);
  }

  function updateLine(id, field, value) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }

  function removeLine(id) {
    setLines(prev => prev.filter(l => l.id !== id));
  }

  function clearAll() {
    if (!lines.length) return;
    if (window.confirm("Clear all lines for this shift?")) setLines([]);
  }

  function clearHighlight() {
    setTimeout(() => setLines(prev => prev.map(l => ({ ...l, highlight: false }))), 1600);
  }

  async function submit(text) {
    const txt = (text || input).trim();
    if (!txt) return;
    setLoading(true);

    try {
      const parsed = await parseWithAI(txt);
      const norm = s => String(s).toLowerCase().replace(/\s/g, "");

      if (parsed.action === "update" && parsed.room) {
        const existing = lines.find(l => l.room && norm(l.room) === norm(parsed.room));
        if (existing) {
          setLines(prev => prev.map(l => l.id === existing.id ? {
            ...l,
            ...(parsed.volumeMl != null && { volumeMl: parsed.volumeMl }),
            ...(parsed.timeMin  != null && { timeMin:  parsed.timeMin  }),
            ...(parsed.drug     && { drug:  parsed.drug  }),
            ...(parsed.notes    && { notes: parsed.notes }),
            highlight: true,
          } : l));
          clearHighlight();
          showStatus("✓ " + (parsed.summary || "Line updated"));
        } else {
          addLine({ ...parsed, highlight: true });
          clearHighlight();
          showStatus("✓ Room not found — added as new line");
        }
      } else {
        addLine({ ...parsed, highlight: true });
        clearHighlight();
        showStatus("✓ " + (parsed.summary || "Line added"));
      }

      if (parsed.warning) setTimeout(() => showStatus("⚠ " + parsed.warning, "warn"), 600);
      setInput("");
    } catch (e) {
      showStatus("Could not parse — try rephrasing or add manually", "error");
    }
    setLoading(false);
  }

  function onVoiceTranscript(transcript) {
    setInput(transcript);
    setTimeout(() => submit(transcript), 100);
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", backgroundImage: "linear-gradient(rgba(0,212,170,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,170,0.025) 1px,transparent 1px)", backgroundSize: "32px 32px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, paddingBottom: 16, borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, background: `linear-gradient(135deg,${COLORS.accent},${COLORS.blue})`, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>💉</div>
            <span style={{ fontFamily: "IBM Plex Mono", fontSize: 20, fontWeight: 600, letterSpacing: -0.5 }}>
              Drip<span style={{ color: COLORS.accent }}>AI</span>
            </span>
          </div>
          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: COLORS.muted, textAlign: "right" }}>
            <div style={{ color: COLORS.accent, fontSize: 14, fontWeight: 600 }}>{clock}</div>
            <div>{lines.length} active {lines.length === 1 ? "line" : "lines"}</div>
          </div>
        </div>

        {/* AI Input Box */}
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.accent}`, borderRadius: 12, padding: 16, marginBottom: 20, boxShadow: "0 0 24px rgba(0,212,170,0.07)" }}>
          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: COLORS.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, background: COLORS.accent, borderRadius: "50%", display: "inline-block", animation: "pulse 2s infinite" }} />
            AI Input — type or speak
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <VoiceButton onTranscript={onVoiceTranscript} disabled={loading} />
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && submit()}
              placeholder="e.g. add room 7 heparin 125ml over 60 min"
              style={{ flex: 1, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "12px 14px", color: COLORS.text, fontSize: 14, fontFamily: "IBM Plex Sans" }}
            />
            <button
              onClick={() => submit()}
              disabled={loading || !input.trim()}
              style={{ background: loading || !input.trim() ? COLORS.surface2 : `linear-gradient(135deg,${COLORS.accent},${COLORS.blue})`, border: "none", borderRadius: 8, padding: "12px 18px", color: loading || !input.trim() ? COLORS.muted : "#0a0f1a", fontFamily: "IBM Plex Mono", fontSize: 12, fontWeight: 600, cursor: loading || !input.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap", minWidth: 72, transition: "all 0.2s" }}>
              {loading ? "..." : "Parse"}
            </button>
          </div>

          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8, fontStyle: "italic" }}>
            Try: <span style={{ color: COLORS.blue, fontStyle: "normal" }}>"change room 4 dopamine from 100ml over 60 min to 90 min"</span>
          </div>

          <StatusBanner status={status} />
        </div>

        {/* Lines header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontFamily: "IBM Plex Mono", fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: COLORS.muted }}>Active IV Lines</span>
          <div style={{ display: "flex", gap: 8 }}>
            {lines.length > 0 && (
              <button onClick={clearAll} style={{ background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5px 10px", color: COLORS.muted, fontFamily: "IBM Plex Mono", fontSize: 10, cursor: "pointer" }}>
                Clear shift
              </button>
            )}
            <button onClick={() => addLine()} style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5px 12px", color: COLORS.text, fontFamily: "IBM Plex Mono", fontSize: 11, cursor: "pointer" }}>
              + Add manually
            </button>
          </div>
        </div>

        {/* Lines list */}
        {lines.length === 0 ? (
          <div style={{ textAlign: "center", padding: "52px 24px", color: COLORS.muted }}>
            <div style={{ fontSize: 42, marginBottom: 12, opacity: 0.35 }}>💊</div>
            <div style={{ fontSize: 14, marginBottom: 6 }}>No active IV lines this shift</div>
            <div style={{ fontSize: 12, fontFamily: "IBM Plex Mono", opacity: 0.6 }}>Tap 🎤 to speak or type above</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lines.map(line => (
              <LineCard key={line.id} line={line} onUpdate={updateLine} onRemove={removeLine} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
