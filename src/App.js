import { useState, useEffect, useRef, useCallback } from "react";

const WEBHOOK_URL = "https://ash-321.app.n8n.cloud/webhook/3cx-status";

const STATUS_META = {
  Available:          { color: "#00C389", bg: "#00C38920", label: "Available" },
  Away:               { color: "#F59E0B", bg: "#F59E0B20", label: "Away" },
  "Do Not Disturb":   { color: "#EF4444", bg: "#EF444420", label: "DND" },
  "Not Registered":   { color: "#6B7280", bg: "#6B728020", label: "Offline" },
  Lunch:              { color: "#8B5CF6", bg: "#8B5CF620", label: "Lunch" },
  Break:              { color: "#EC4899", bg: "#EC489920", label: "Break" },
  "With Client":      { color: "#3B82F6", bg: "#3B82F620", label: "With Client" },
  Outgoing:           { color: "#06B6D4", bg: "#06B6D420", label: "Outgoing" },
  "Follow Up":        { color: "#F97316", bg: "#F9731620", label: "Follow Up" },
  "Call Pending":     { color: "#A78BFA", bg: "#A78BFA20", label: "Call Pending" },
};
const getStatus = (s) => STATUS_META[s] || STATUS_META["Not Registered"];

const PROFILE_MAP = {
  Available: "Available",
  Away: "Away",
  DoNotDisturb: "Do Not Disturb",
  Lunch: "Lunch",
  BusinessTrip: "Away",
  Custom: "Away",
  WalkingAround: "Away",
  OutOfOffice: "Away",
};

function mapProfile(profile, registered) {
  if (!registered) return "Not Registered";
  return PROFILE_MAP[profile] || profile || "Available";
}

function parseStaff(data) {
  let raw = [];
  if (Array.isArray(data)) raw = data;
  else if (data?.value && Array.isArray(data.value)) raw = data.value;
  else if (data?.list && Array.isArray(data.list)) raw = data.list;
  else if (typeof data === "object") {
    for (const k of Object.keys(data)) {
      if (Array.isArray(data[k])) { raw = data[k]; break; }
    }
  }
  return raw
    .filter((e) => e && (e.Number || e.Id || e.DN || e.Extension))
    .map((e) => ({
      id: e.Number || e.Id || e.DN || e.Extension,
      name:
        [e.FirstName, e.LastName].filter(Boolean).join(" ") ||
        e.DisplayName ||
        e.Name ||
        `Ext ${e.Number || e.DN}`,
      ext: String(e.Number || e.DN || e.Id || e.Extension || ""),
      status: mapProfile(
        e.CurrentProfile || e.Profile || e.Status || e.PresenceState,
        e.Registered !== false && e.IsRegistered !== false
      ),
      registered: e.Registered !== false && e.IsRegistered !== false,
      dept: e.DepartmentName || e.Department || e.GroupName || "",
      lastSeen: e.LastModified || e.LastSeen || e.UpdatedAt || null,
    }));
}

async function fetchAIInsight(staff, question) {
  const summary = Object.entries(
    staff.reduce((acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const topAway = staff
    .filter((s) => s.status === "Away")
    .map((s) => s.name)
    .slice(0, 5)
    .join(", ");
  const dnd = staff
    .filter((s) => s.status === "Do Not Disturb")
    .map((s) => s.name)
    .slice(0, 3)
    .join(", ");
  const prompt = question
    ? `You are a call-centre operations analyst for Quickplus Dubai. Staff snapshot: ${summary}. Top Away: ${topAway}. DND: ${dnd}. Answer concisely (3-4 sentences): "${question}"`
    : `You are a call-centre operations analyst for Quickplus Dubai. Staff snapshot (${staff.length} agents): ${summary}. Top Away: ${topAway}. DND: ${dnd}. Give 3 sharp bullet-point manager insights about availability, risk areas, and one recommended action right now. Be direct and specific.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json();
  return json.content?.[0]?.text || "No insight returned.";
}

function StatusDot({ status, size = 10 }) {
  const m = getStatus(status);
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: m.color,
        flexShrink: 0,
        boxShadow: `0 0 5px ${m.color}99`,
      }}
    />
  );
}

function StatCard({ label, value, color, sub, onClick, active }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? `${color}22` : "#0f1923",
        border: `1px solid ${active ? color : color + "33"}`,
        borderRadius: 12,
        padding: "13px 17px",
        minWidth: 105,
        position: "relative",
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -18,
          right: -18,
          width: 65,
          height: 65,
          borderRadius: "50%",
          background: `${color}12`,
        }}
      />
      <div style={{ fontSize: 24, fontWeight: 800, color, fontFamily: "monospace" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: color + "bb", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function StaffRow({ s, onClick, selected }) {
  const m = getStatus(s.status);
  return (
    <div
      onClick={() => onClick(s)}
      style={{
        display: "grid",
        gridTemplateColumns: "12px 1fr 100px 80px",
        alignItems: "center",
        gap: 14,
        padding: "10px 16px",
        cursor: "pointer",
        background: selected ? "#1a2535" : "transparent",
        borderRadius: 8,
        transition: "background 0.15s",
        borderLeft: selected ? `3px solid ${m.color}` : "3px solid transparent",
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "#111d2a"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      <StatusDot status={s.status} size={10} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{s.name}</div>
        <div style={{ fontSize: 11, color: "#4b5563" }}>
          Ext {s.ext}{s.dept ? ` · ${s.dept}` : ""}
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: m.color, background: m.bg, borderRadius: 20, padding: "3px 10px", textAlign: "center" }}>
        {m.label}
      </div>
      <div style={{ fontSize: 11, color: "#4b5563", textAlign: "right" }}>
        {s.lastSeen
          ? new Date(s.lastSeen).toLocaleTimeString("en-AE", { hour: "2-digit", minute: "2-digit" })
          : "—"}
      </div>
    </div>
  );
}

function DetailPanel({ staff, onClose }) {
  if (!staff) return null;
  const m = getStatus(staff.status);
  return (
    <div style={{ width: 270, background: "#0a1520", borderLeft: "1px solid #1e2d3d", padding: 20, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flexShrink: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f3f4f6" }}>{staff.name}</div>
          <div style={{ fontSize: 12, color: "#4b5563" }}>Ext {staff.ext}{staff.dept ? ` · ${staff.dept}` : ""}</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", fontSize: 20 }}>×</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: m.bg, borderRadius: 10, border: `1px solid ${m.color}44` }}>
        <StatusDot status={staff.status} size={14} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: m.color }}>{m.label}</div>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>Current status</div>
        </div>
      </div>
      <div style={{ background: "#0f1923", borderRadius: 10, padding: 14 }}>
        {[
          ["Extension", staff.ext],
          ["Department", staff.dept || "—"],
          ["Registered", staff.registered ? "✅ Online" : "❌ Offline"],
          ["Last Seen", staff.lastSeen ? new Date(staff.lastSeen).toLocaleString("en-AE") : "—"],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>{k}</span>
            <span style={{ fontSize: 12, color: "#d1d5db" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sort, setSort] = useState("name");
  const [tab, setTab] = useState("team");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const intervalRef = useRef(null);

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(WEBHOOK_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
      const data = await res.json();
      const mapped = parseStaff(data);
      if (mapped.length === 0) {
        setError("Connected but no staff found. Raw: " + JSON.stringify(data).slice(0, 200));
      } else {
        setStaff(mapped);
        setError("");
      }
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStaff();
    intervalRef.current = setInterval(fetchStaff, 60000);
    return () => clearInterval(intervalRef.current);
  }, [fetchStaff]);

  const counts = Object.keys(STATUS_META).reduce(
    (acc, k) => ({ ...acc, [k]: staff.filter((s) => s.status === k).length }),
    {}
  );

  const filtered = staff
    .filter(
      (s) =>
        (statusFilter === "All" || s.status === statusFilter) &&
        (search === "" ||
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.ext.includes(search))
    )
    .sort((a, b) =>
      sort === "status" ? a.status.localeCompare(b.status) : a.name.localeCompare(b.name)
    );

  const loadInsight = async (q) => {
    setAiLoading(true);
    setAiText("");
    setTab("insights");
    try {
      setAiText(await fetchAIInsight(staff, q));
    } catch {
      setAiText("Could not fetch insight.");
    }
    setAiLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#060d16", color: "#e5e7eb", fontFamily: "'Segoe UI', sans-serif", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 22px", background: "#0a1520", borderBottom: "1px solid #1e2d3d", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#1A6CF6,#00C389)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, color: "#fff" }}>Q</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#f3f4f6" }}>Quickplus · Staff Status</div>
            <div style={{ fontSize: 11, color: error ? "#EF4444" : loading ? "#F59E0B" : "#4b5563" }}>
              {error ? `⚠ ${error.slice(0, 60)}` : loading ? "🔄 Syncing with 3CX..." : lastRefresh ? `✅ Live · ${lastRefresh.toLocaleTimeString("en-AE")} · ${staff.length} agents` : "Connecting..."}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={fetchStaff} style={{ background: "#0f1923", border: "1px solid #1e2d3d", borderRadius: 8, padding: "6px 12px", color: "#6b7280", fontSize: 12, cursor: "pointer" }}>↻ Refresh</button>
          {["team", "insights"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", background: tab === t ? "#1A6CF6" : "#0f1923", color: tab === t ? "#fff" : "#6b7280", fontSize: 12, fontWeight: 600 }}>
              {t === "team" ? "👥 Team" : "🤖 AI"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, padding: "10px 22px", overflowX: "auto", flexShrink: 0, borderBottom: "1px solid #1e2d3d" }}>
        <StatCard label="Total" value={staff.length} color="#1A6CF6" />
        <StatCard label="Available" value={counts["Available"] || 0} color="#00C389" sub={staff.length ? `${Math.round(((counts["Available"] || 0) / staff.length) * 100)}%` : ""} onClick={() => setStatusFilter((s) => (s === "Available" ? "All" : "Available"))} active={statusFilter === "Available"} />
        <StatCard label="Away" value={counts["Away"] || 0} color="#F59E0B" onClick={() => setStatusFilter((s) => (s === "Away" ? "All" : "Away"))} active={statusFilter === "Away"} />
        <StatCard label="DND" value={counts["Do Not Disturb"] || 0} color="#EF4444" onClick={() => setStatusFilter((s) => (s === "Do Not Disturb" ? "All" : "Do Not Disturb"))} active={statusFilter === "Do Not Disturb"} />
        <StatCard label="Offline" value={counts["Not Registered"] || 0} color="#6B7280" onClick={() => setStatusFilter((s) => (s === "Not Registered" ? "All" : "Not Registered"))} active={statusFilter === "Not Registered"} />
        <StatCard label="On Call" value={counts["Outgoing"] || 0} color="#06B6D4" />
        <StatCard label="Break/Lunch" value={(counts["Break"] || 0) + (counts["Lunch"] || 0)} color="#8B5CF6" />
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {tab === "team" && (
            <>
              <div style={{ display: "flex", gap: 10, padding: "10px 22px", borderBottom: "1px solid #1e2d3d", flexShrink: 0, alignItems: "center" }}>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ext..." style={{ background: "#0f1923", border: "1px solid #1e2d3d", borderRadius: 8, padding: "7px 14px", color: "#e5e7eb", fontSize: 13, width: 210, outline: "none" }} />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ background: "#0f1923", border: "1px solid #1e2d3d", borderRadius: 8, padding: "7px 12px", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>
                  {["All", ...Object.keys(STATUS_META)].map((s) => (<option key={s}>{s}</option>))}
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ background: "#0f1923", border: "1px solid #1e2d3d", borderRadius: 8, padding: "7px 12px", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}>
                  <option value="name">Sort: Name</option>
                  <option value="status">Sort: Status</option>
                </select>
                <div style={{ marginLeft: "auto", fontSize: 12, color: "#4b5563" }}>{filtered.length}/{staff.length} agents</div>
                <button onClick={() => loadInsight()} style={{ background: "#1A6CF620", border: "1px solid #1A6CF644", borderRadius: 8, padding: "7px 14px", color: "#1A6CF6", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>🤖 AI Snapshot</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "12px 1fr 100px 80px", gap: 14, padding: "7px 16px 5px", margin: "0 6px", borderBottom: "1px solid #1e2d3d", flexShrink: 0 }}>
                {["", "Name / Extension", "Status", "Last Seen"].map((h, i) => (
                  <div key={i} style={{ fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</div>
                ))}
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
                {loading && staff.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 60, color: "#4b5563" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #1A6CF6", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
                    Connecting to 3CX via n8n...
                  </div>
                ) : error && staff.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
                    <div style={{ color: "#EF4444", marginBottom: 8 }}>Connection error</div>
                    <div style={{ color: "#4b5563", fontSize: 12, maxWidth: 420, margin: "0 auto", lineHeight: 1.7, wordBreak: "break-all" }}>{error}</div>
                    <button onClick={fetchStaff} style={{ marginTop: 16, background: "#1A6CF6", border: "none", borderRadius: 8, padding: "8px 20px", color: "#fff", fontSize: 13, cursor: "pointer" }}>Retry</button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "#4b5563" }}>No agents match your filter.</div>
                ) : (
                  filtered.map((s) => <StaffRow key={s.id} s={s} onClick={setSelected} selected={selected?.id === s.id} />)
                )}
              </div>
            </>
          )}

          {tab === "insights" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              <div style={{ maxWidth: 680 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#f3f4f6", marginBottom: 4 }}>🤖 AI Manager Insights</div>
                <div style={{ fontSize: 13, color: "#4b5563", marginBottom: 18 }}>Live analysis of {staff.length} agents from 3CX.</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                  {["Who is underperforming today?", "What's the coverage risk right now?", "Who has been Away the longest?", "Who should I call in urgently?", "Which department needs attention?"].map((q) => (
                    <button key={q} onClick={() => { setQuestion(q); loadInsight(q); }} style={{ background: "#0f1923", border: "1px solid #1e2d3d", borderRadius: 20, padding: "7px 14px", color: "#9ca3af", fontSize: 12, cursor: "pointer" }}
                      onMouseEnter={(e) => { e.target.style.borderColor = "#1A6CF6"; e.target.style.color = "#1A6CF6"; }}
                      onMouseLeave={(e) => { e.target.style.borderColor = "#1e2d3d"; e.target.style.color = "#9ca3af"; }}>{q}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && question) loadInsight(question); }} placeholder="Ask anything about your team..." style={{ flex: 1, background: "#0f1923", border: "1px solid #1e2d3d", borderRadius: 10, padding: "10px 16px", color: "#e5e7eb", fontSize: 13, outline: "none" }} />
                  <button onClick={() => loadInsight(question || undefined)} style={{ background: "linear-gradient(135deg,#1A6CF6,#00C389)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Ask AI</button>
                </div>
                <div style={{ background: "#0a1520", border: "1px solid #1e2d3d", borderRadius: 14, padding: 22, minHeight: 130 }}>
                  {aiLoading ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#4b5563" }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #1A6CF6", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
                      Analysing {staff.length} live agents...
                    </div>
                  ) : aiText ? (
                    <div style={{ fontSize: 14, color: "#d1d5db", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{aiText}</div>
                  ) : (
                    <div style={{ color: "#374151", fontSize: 13, fontStyle: "italic" }}>Click a question above or "AI Snapshot" on the Team tab.</div>
                  )}
                </div>
                {staff.length > 0 && (
                  <div style={{ marginTop: 22, background: "#0a1520", border: "1px solid #1e2d3d", borderRadius: 14, padding: 20 }}>
                    <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>Live Status Distribution</div>
                    {Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
                      const m = getStatus(status);
                      const pct = Math.round((count / staff.length) * 100);
                      return (
                        <div key={status} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                          <div style={{ width: 105, fontSize: 12, color: "#9ca3af" }}>{m.label}</div>
                          <div style={{ flex: 1, background: "#1e2d3d", borderRadius: 4, height: 7 }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: m.color, borderRadius: 4, opacity: 0.9 }} />
                          </div>
                          <div style={{ width: 55, fontSize: 12, color: m.color, fontFamily: "monospace", textAlign: "right" }}>{count} ({pct}%)</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {selected && <DetailPanel staff={selected} onClose={() => setSelected(null)} />}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:#060d16}::-webkit-scrollbar-thumb{background:#1e2d3d;border-radius:3px}select option{background:#0f1923}`}</style>
    </div>
  );
}
