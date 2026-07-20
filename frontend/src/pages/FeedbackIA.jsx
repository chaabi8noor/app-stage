import { useEffect, useState } from "react";
import { api } from "../api/client";

const AVATAR_COLORS = ["#4f46e5","#059669","#d97706","#e53e3e","#7c3aed","#0284c7","#be185d","#0f766e"];
function avatarColor(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const APPRECIATION_COLOR = {
  "Très bien": "#10b981",
  "Bien": "#3b82f6",
  "Satisfaisant": "#f59e0b",
  "À améliorer": "#f97316",
  "Insuffisant": "#ef4444",
};

function ScoreRing({ score }) {
  const pct = Math.min(Math.max(score / 10, 0), 1);
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const color = score >= 8 ? "#10b981" : score >= 6 ? "#3b82f6" : score >= 4 ? "#f59e0b" : "#ef4444";
  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
      <circle
        cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="9"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 55 55)"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text x="55" y="51" textAnchor="middle" fontSize="22" fontWeight="700" fill={color}>{score}</text>
      <text x="55" y="67" textAnchor="middle" fontSize="11" fill="#94a3b8">/10</text>
    </svg>
  );
}

export default function FeedbackIA() {
  const [interns, setInterns] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedIntern, setSelectedIntern] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.getUsers(), api.getProjects()])
      .then(([users, projs]) => {
        setInterns(users.filter(u => u.role === "intern"));
        setProjects(projs);
      })
      .catch(console.error);
  }, []);

  async function analyze() {
    if (!selectedIntern) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.getInternFeedback(selectedIntern, selectedProject || null);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.heading}>Feedback IA</h1>
          <p style={s.sub}>Analyse automatique du travail d'un stagiaire par intelligence artificielle</p>
        </div>
      </div>

      {/* Controls */}
      <div style={s.controls}>
        <select style={s.select} value={selectedIntern} onChange={e => { setSelectedIntern(e.target.value); setResult(null); }}>
          <option value="">-- Choisir un stagiaire</option>
          {interns.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select style={s.select} value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
          <option value="">Tous les projets</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          style={{ ...s.btn, opacity: (!selectedIntern || loading) ? 0.6 : 1 }}
          onClick={analyze}
          disabled={!selectedIntern || loading}
        >
          {loading ? "Analyse en cours..." : "Analyser le travail"}
        </button>
      </div>

      {loading && (
        <div style={s.loadingBox}>
          <div style={s.loadingSpinner} />
          <div style={s.loadingText}>L'IA analyse le travail du stagiaire...</div>
          <div style={s.loadingHint}>Cela peut prendre quelques secondes</div>
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}

      {!result && !loading && (
        <div style={s.emptyState}>
          <div style={s.emptyTitle}>Sélectionnez un stagiaire</div>
          <div style={s.emptySub}>L'IA analysera ses tâches, son avancement, ses points forts et ses axes d'amélioration.</div>
        </div>
      )}

      {result && !loading && (
        <div style={s.reportWrap}>
          {/* Header card */}
          <div style={s.topCard}>
            <div style={s.internRow}>
              <div style={{ ...s.avatar, background: avatarColor(result.intern_name) }}>
                {result.intern_name?.[0] || "?"}
              </div>
              <div style={s.internInfo}>
                <div style={s.internName}>{result.intern_name}</div>
                <div style={s.internEmail}>{result.intern_email}</div>
                <div style={s.internProjects}>{result.stats.projects.join(" · ")}</div>
              </div>
              <div style={s.scoreSection}>
                <ScoreRing score={result.feedback.note_globale} />
                <div style={{
                  ...s.appreciation,
                  background: (APPRECIATION_COLOR[result.feedback.appreciation] || "#94a3b8") + "22",
                  color: APPRECIATION_COLOR[result.feedback.appreciation] || "#94a3b8",
                }}>
                  {result.feedback.appreciation}
                </div>
              </div>
            </div>

            {/* Stats bar */}
            <div style={s.statsRow}>
              <StatBadge label="Tâches totales" value={result.stats.total_tasks} color="#4f46e5" />
              <StatBadge label="Terminées" value={`${result.stats.done} (${result.stats.completion_rate}%)`} color="#10b981" />
              <StatBadge label="En cours" value={result.stats.in_progress} color="#3b82f6" />
              <StatBadge label="En retard" value={result.stats.overdue} color="#ef4444" />
              <StatBadge label="Sous-tâches" value={`${result.stats.subtask_completion_rate}%`} color="#7c3aed" />
            </div>

            {/* Progress bar */}
            <div style={s.progressWrap}>
              <div style={s.progressBar}>
                <div style={{ ...s.progressFill, width: `${result.stats.completion_rate}%` }} />
              </div>
              <span style={s.progressLabel}>{result.stats.completion_rate}% complété</span>
            </div>

            <p style={s.resume}>{result.feedback.resume}</p>
          </div>

          {/* 3-column grid */}
          <div style={s.grid3}>
            <FeedbackSection
              title="Points forts"
              items={result.feedback.points_forts}
              color="#10b981"
              bg="#f0fdf4"
              border="#bbf7d0"
              icon="+"
            />
            <FeedbackSection
              title="Axes d'amélioration"
              items={result.feedback.axes_amelioration}
              color="#f59e0b"
              bg="#fffbeb"
              border="#fde68a"
              icon="~"
            />
            <FeedbackSection
              title="Recommandations"
              items={result.feedback.recommandations}
              color="#4f46e5"
              bg="#eef2ff"
              border="#c7d2fe"
              icon=">"
            />
          </div>

          {/* Retards + Progression */}
          <div style={s.grid2}>
            <div style={s.analysisCard}>
              <div style={s.analysisTitle}>Analyse des retards</div>
              <p style={s.analysisText}>{result.feedback.analyse_retards}</p>
            </div>
            <div style={s.analysisCard}>
              <div style={s.analysisTitle}>Dynamique de travail</div>
              <p style={s.analysisText}>{result.feedback.progression}</p>
            </div>
          </div>

          {/* Motivation message */}
          <div style={s.motivationCard}>
            <div style={s.motivationLabel}>Message au stagiaire</div>
            <p style={s.motivationText}>"{result.feedback.message_motivation}"</p>
          </div>

          <div style={s.generatedAt}>Généré le {result.generated_at}</div>
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <div style={{ ...sb.wrap, borderTop: `3px solid ${color}` }}>
      <div style={{ ...sb.value, color }}>{value}</div>
      <div style={sb.label}>{label}</div>
    </div>
  );
}

function FeedbackSection({ title, items, color, bg, border, icon }) {
  return (
    <div style={{ ...fs.card, background: bg, border: `1px solid ${border}` }}>
      <div style={{ ...fs.title, color }}>{title}</div>
      <ul style={fs.list}>
        {(items || []).map((item, i) => (
          <li key={i} style={fs.item}>
            <span style={{ ...fs.icon, color }}>{icon}</span>
            <span style={fs.text}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const sb = {
  wrap: { background: "#fff", borderRadius: "8px", padding: "0.75rem 1rem", flex: 1, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", textAlign: "center" },
  value: { fontSize: "1.3rem", fontWeight: 700 },
  label: { fontSize: "0.72rem", color: "#718096", marginTop: "0.1rem" },
};

const fs = {
  card: { borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  title: { fontWeight: 700, fontSize: "0.9rem" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" },
  item: { display: "flex", gap: "0.5rem", alignItems: "flex-start" },
  icon: { fontWeight: 800, fontSize: "0.9rem", flexShrink: 0, marginTop: "1px" },
  text: { fontSize: "0.84rem", color: "#374151", lineHeight: 1.5 },
};

const s = {
  header: { marginBottom: "1.25rem" },
  heading: { fontSize: "1.6rem", fontWeight: 700, color: "#1a202c", margin: 0 },
  sub: { color: "#718096", fontSize: "0.875rem", marginTop: "0.25rem" },
  controls: { display: "flex", gap: "0.75rem", marginBottom: "1.5rem", alignItems: "center", flexWrap: "wrap" },
  select: { padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.95rem", minWidth: "200px" },
  btn: { background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "#fff", border: "none", padding: "0.65rem 1.5rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "0.95rem" },
  loadingBox: { background: "#fff", borderRadius: "12px", padding: "3rem", textAlign: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" },
  loadingSpinner: { width: "40px", height: "40px", border: "4px solid #e2e8f0", borderTop: "4px solid #4f46e5", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  loadingText: { fontWeight: 600, color: "#1a202c", fontSize: "1rem" },
  loadingHint: { color: "#a0aec0", fontSize: "0.85rem" },
  error: { background: "#fff5f5", border: "1px solid #fca5a5", color: "#c53030", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.875rem", marginBottom: "1rem" },
  emptyState: { background: "#fff", borderRadius: "12px", padding: "4rem 2rem", textAlign: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" },
  emptyTitle: { fontSize: "1.1rem", fontWeight: 700, color: "#1a202c", marginBottom: "0.5rem" },
  emptySub: { color: "#718096", fontSize: "0.875rem", maxWidth: "400px", margin: "0 auto", lineHeight: 1.6 },
  reportWrap: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  topCard: { background: "#fff", borderRadius: "12px", padding: "1.5rem", boxShadow: "0 1px 8px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: "1rem" },
  internRow: { display: "flex", alignItems: "center", gap: "1rem" },
  avatar: { width: "52px", height: "52px", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", fontWeight: 700, flexShrink: 0 },
  internInfo: { flex: 1 },
  internName: { fontSize: "1.2rem", fontWeight: 700, color: "#1a202c" },
  internEmail: { fontSize: "0.8rem", color: "#718096" },
  internProjects: { fontSize: "0.78rem", color: "#4f46e5", marginTop: "0.2rem", fontWeight: 600 },
  scoreSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem" },
  appreciation: { fontSize: "0.78rem", fontWeight: 700, padding: "0.25rem 0.75rem", borderRadius: "999px" },
  statsRow: { display: "flex", gap: "0.75rem", flexWrap: "wrap" },
  progressWrap: { display: "flex", alignItems: "center", gap: "0.75rem" },
  progressBar: { flex: 1, height: "8px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" },
  progressFill: { height: "100%", background: "linear-gradient(90deg,#4f46e5,#7c3aed)", borderRadius: "999px", transition: "width 0.8s ease" },
  progressLabel: { fontSize: "0.8rem", fontWeight: 700, color: "#4f46e5", whiteSpace: "nowrap" },
  resume: { margin: 0, fontSize: "0.9rem", color: "#4a5568", lineHeight: 1.7, borderLeft: "3px solid #4f46e5", paddingLeft: "0.85rem", fontStyle: "italic" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" },
  analysisCard: { background: "#fff", borderRadius: "10px", padding: "1.25rem", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" },
  analysisTitle: { fontWeight: 700, fontSize: "0.875rem", color: "#1a202c", marginBottom: "0.5rem" },
  analysisText: { margin: 0, fontSize: "0.875rem", color: "#4a5568", lineHeight: 1.7 },
  motivationCard: { background: "linear-gradient(135deg,#4f46e5,#7c3aed)", borderRadius: "12px", padding: "1.5rem 2rem", color: "#fff" },
  motivationLabel: { fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.75, marginBottom: "0.5rem" },
  motivationText: { margin: 0, fontSize: "1rem", lineHeight: 1.7, fontStyle: "italic" },
  generatedAt: { fontSize: "0.75rem", color: "#a0aec0", textAlign: "right" },
};
