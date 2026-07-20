import { useEffect, useState } from "react";
import { api } from "../api/client";

const AVATAR_COLORS = ["#4f46e5","#059669","#d97706","#e53e3e","#7c3aed","#0284c7","#be185d","#0f766e"];
function avatarColor(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function Rapports() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getProjects().then(setProjects).catch(console.error);
  }, []);

  async function generateReport() {
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const res = await api.getWeeklyReport(selectedProject || null);
      setReport(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function scoreColor(done, total) {
    if (!total) return "#94a3b8";
    const pct = done / total;
    if (pct >= 0.8) return "#10b981";
    if (pct >= 0.5) return "#f59e0b";
    return "#ef4444";
  }

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.heading}>Rapport Hebdomadaire</h1>
          <p style={s.sub}>Résumé de l'avancement des stagiaires généré par IA</p>
        </div>
      </div>

      {/* Controls */}
      <div style={s.controls}>
        <select style={s.select} value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
          <option value="">Tous les projets</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={generateReport} disabled={loading}>
          {loading ? "🤖 Génération en cours..." : "Générer le rapport"}
        </button>
      </div>

      {loading && (
        <div style={s.loadingBox}>
          <div style={s.loadingIcon}>🤖</div>
          <div style={s.loadingText}>L'IA analyse l'avancement de tous les stagiaires...</div>
          <div style={s.loadingHint}>Cela peut prendre 10–20 secondes</div>
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}

      {report && !loading && (
        <div style={s.reportContainer}>
          {/* Report header */}
          <div style={s.reportHeader}>
            <div style={s.reportMeta}>
              <div style={s.reportTitle}>{report.project_name}</div>
              <div style={s.reportWeek}>{report.week_label}</div>
            </div>
            <button style={s.printBtn} onClick={() => window.print()}>Imprimer</button>
          </div>

          {/* Global summary */}
          <div style={s.globalSummary}>
            <div style={s.globalSummaryTitle}>Résumé global</div>
            <p style={s.globalSummaryText}>{report.global_summary}</p>
          </div>

          {/* Stats row */}
          <div style={s.statsRow}>
            <StatCard
              label="Stagiaires"
              value={report.interns.length}
              color="#4f46e5"
            />
            <StatCard
              label="Tâches terminées"
              value={report.interns.reduce((s, i) => s + (i.completed_this_week || 0), 0)}
              color="#10b981"
              suffix="cette semaine"
            />
            <StatCard
              label="En cours"
              value={report.interns.reduce((s, i) => s + (i.in_progress || 0), 0)}
              color="#3b82f6"
            />
            <StatCard
              label="En retard"
              value={report.interns.reduce((s, i) => s + (i.overdue || 0), 0)}
              color="#ef4444"
            />
          </div>

          {/* Per-intern cards */}
          <div style={s.internGrid}>
            {report.interns.map((intern, i) => {
              const total = (intern.completed_this_week || 0) + (intern.in_progress || 0) + (intern.todo || 0);
              const hasBlockers = intern.blockers && intern.blockers !== "Aucun blocker détecté";
              return (
                <div key={i} style={{ ...s.internCard, borderTop: `4px solid ${avatarColor(intern.intern_name)}` }}>
                  {/* Intern header */}
                  <div style={s.internHeader}>
                    <div style={{ ...s.internAvatar, background: avatarColor(intern.intern_name) }}>
                      {intern.intern_name?.[0] || "?"}
                    </div>
                    <div style={s.internInfo}>
                      <div style={s.internName}>{intern.intern_name}</div>
                      <div style={s.internPart}>{intern.part_name} — {intern.project_name}</div>
                    </div>
                    <div style={{ ...s.score, color: scoreColor(intern.completed_this_week, total) }}>
                      {intern.completed_this_week}/{total}
                      <div style={s.scoreLabel}>tâches</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={s.progressBar}>
                    {/* Done */}
                    <div style={{ width: `${total ? (intern.completed_this_week / total) * 100 : 0}%`, background: "#10b981", height: "100%", borderRadius: "999px 0 0 999px", transition: "width 0.5s" }} />
                    {/* In progress */}
                    <div style={{ width: `${total ? (intern.in_progress / total) * 100 : 0}%`, background: "#3b82f6", height: "100%" }} />
                    {/* Overdue */}
                    {intern.overdue > 0 && <div style={{ width: `${total ? (intern.overdue / total) * 100 : 0}%`, background: "#ef4444", height: "100%" }} />}
                  </div>

                  {/* Mini stats */}
                  <div style={s.miniStats}>
                    <span style={s.miniStat}>{intern.completed_this_week || 0} terminées</span>
                    <span style={s.miniStat}>{intern.in_progress || 0} en cours</span>
                    {intern.overdue > 0 && <span style={{ ...s.miniStat, color: "#ef4444" }}>{intern.overdue} en retard</span>}
                    <span style={s.miniStat}>📋 {intern.todo || 0} à faire</span>
                  </div>

                  {/* Summary */}
                  <p style={s.summary}>{intern.summary}</p>

                  {/* Blockers */}
                  {hasBlockers && (
                    <div style={s.blockerBox}>
                      <span style={s.blockerTitle}>Points d'attention :</span>
                      <span style={s.blockerText}>{intern.blockers}</span>
                    </div>
                  )}
                  {!hasBlockers && (
                    <div style={s.okBox}>✓ Aucun blocker détecté</div>
                  )}
                </div>
              );
            })}
          </div>

          {report.interns.length === 0 && (
            <div style={s.empty}>Aucune donnée stagiaire disponible pour cette période.</div>
          )}
        </div>
      )}

      {!report && !loading && (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>📊</div>
          <div style={s.emptyTitle}>Aucun rapport généré</div>
          <div style={s.emptySub}>Sélectionnez un projet et cliquez sur "Générer le rapport" pour obtenir un résumé hebdomadaire de l'avancement des stagiaires.</div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, suffix }) {
  return (
    <div style={{ ...sc.card, borderTop: `3px solid ${color}` }}>
      <div style={{ ...sc.value, color }}>{value}</div>
      <div style={sc.label}>{label}</div>
      {suffix && <div style={sc.suffix}>{suffix}</div>}
    </div>
  );
}

const sc = {
  card: { background: "#fff", borderRadius: "8px", padding: "1rem 1.25rem", flex: 1, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" },
  value: { fontSize: "2rem", fontWeight: 700 },
  label: { fontSize: "0.8rem", color: "#718096", marginTop: "0.15rem" },
  suffix: { fontSize: "0.72rem", color: "#a0aec0" },
};

const s = {
  header: { marginBottom: "1.25rem" },
  heading: { fontSize: "1.6rem", fontWeight: 700, color: "#1a202c", margin: 0 },
  sub: { color: "#718096", fontSize: "0.875rem", marginTop: "0.25rem" },
  controls: { display: "flex", gap: "0.75rem", marginBottom: "1.5rem", alignItems: "center" },
  select: { padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.95rem", minWidth: "220px" },
  btn: { background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "#fff", border: "none", padding: "0.65rem 1.5rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "0.95rem" },
  loadingBox: { background: "#fff", borderRadius: "12px", padding: "3rem", textAlign: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" },
  loadingIcon: { fontSize: "2.5rem", marginBottom: "0.75rem" },
  loadingText: { fontWeight: 600, color: "#1a202c", fontSize: "1rem" },
  loadingHint: { color: "#a0aec0", fontSize: "0.85rem", marginTop: "0.4rem" },
  error: { background: "#fff5f5", border: "1px solid #fca5a5", color: "#c53030", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.875rem", marginBottom: "1rem" },
  reportContainer: { display: "flex", flexDirection: "column", gap: "1.25rem" },
  reportHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  reportMeta: {},
  reportTitle: { fontSize: "1.2rem", fontWeight: 700, color: "#1a202c" },
  reportWeek: { fontSize: "0.85rem", color: "#718096", marginTop: "0.15rem" },
  printBtn: { background: "#f7f8fc", border: "1px solid #e2e8f0", color: "#4a5568", padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer", fontSize: "0.85rem" },
  globalSummary: { background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "10px", padding: "1rem 1.25rem" },
  globalSummaryTitle: { fontWeight: 700, color: "#0369a1", marginBottom: "0.5rem", fontSize: "0.875rem" },
  globalSummaryText: { margin: 0, color: "#1e40af", fontSize: "0.9rem", lineHeight: 1.6 },
  statsRow: { display: "flex", gap: "1rem" },
  internGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" },
  internCard: { background: "#fff", borderRadius: "10px", padding: "1.25rem", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", gap: "0.75rem" },
  internHeader: { display: "flex", alignItems: "center", gap: "0.75rem" },
  internAvatar: { width: "38px", height: "38px", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem", fontWeight: 700, flexShrink: 0 },
  internInfo: { flex: 1 },
  internName: { fontWeight: 700, color: "#1a202c", fontSize: "0.95rem" },
  internPart: { fontSize: "0.75rem", color: "#4f46e5", marginTop: "0.1rem" },
  score: { fontSize: "1.4rem", fontWeight: 700, textAlign: "center" },
  scoreLabel: { fontSize: "0.65rem", color: "#a0aec0", textAlign: "center" },
  progressBar: { height: "8px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden", display: "flex" },
  miniStats: { display: "flex", gap: "0.6rem", flexWrap: "wrap" },
  miniStat: { fontSize: "0.75rem", color: "#4a5568" },
  summary: { margin: 0, fontSize: "0.85rem", color: "#4a5568", lineHeight: 1.6, borderLeft: "3px solid #e2e8f0", paddingLeft: "0.75rem" },
  blockerBox: { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "8px", padding: "0.65rem 0.85rem", display: "flex", flexDirection: "column", gap: "0.25rem" },
  blockerTitle: { fontSize: "0.75rem", fontWeight: 700, color: "#c2410c" },
  blockerText: { fontSize: "0.8rem", color: "#9a3412" },
  okBox: { fontSize: "0.78rem", color: "#059669", background: "#f0fdf4", padding: "0.4rem 0.75rem", borderRadius: "6px", fontWeight: 600 },
  emptyState: { background: "#fff", borderRadius: "12px", padding: "4rem 2rem", textAlign: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" },
  emptyIcon: { fontSize: "3rem", marginBottom: "0.75rem" },
  emptyTitle: { fontSize: "1.1rem", fontWeight: 700, color: "#1a202c", marginBottom: "0.5rem" },
  emptySub: { color: "#718096", fontSize: "0.875rem", maxWidth: "400px", margin: "0 auto", lineHeight: 1.6 },
  empty: { color: "#a0aec0", textAlign: "center", padding: "2rem" },
};

