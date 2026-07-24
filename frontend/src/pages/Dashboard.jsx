import { useEffect, useState } from "react";
import { api, getCached } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { isAdmin, user } = useAuth();
  const [tasks, setTasks] = useState(() => getCached("/tasks/") || []);
  const [stats, setStats] = useState(() => getCached("/stats") || null);
  const [loading, setLoading] = useState(!getCached("/tasks/"));
  const [userModal, setUserModal] = useState(null); // "admin" | "intern" | null
  const [userForm, setUserForm] = useState({ name: "", email: "", password: "" });
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");

  async function load() {
    try {
      const t = await api.getTasks();
      setTasks(t);
      if (isAdmin) {
        const s = await api.getStats();
        setStats(s);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [isAdmin]);

  async function handleCreateUser(e) {
    e.preventDefault();
    setUserError("");
    try {
      await api.register({ ...userForm, role: userModal });
      setUserSuccess(`${userModal === "admin" ? "Administrateur" : "Stagiaire"} créé avec succès !`);
      setUserForm({ name: "", email: "", password: "" });
      setTimeout(() => { setUserModal(null); setUserSuccess(""); load(); }, 1500);
    } catch (err) {
      setUserError(err.message);
    }
  }

  if (loading) return <div style={styles.loadingWrap}><div style={styles.spinner} /><p style={styles.loadingText}>Chargement...</p></div>;

  const now = new Date();
  const todoCount = tasks.filter(t => t.status === "todo").length;
  const inProgressCount = tasks.filter(t => t.status === "in_progress").length;
  const doneCount = tasks.filter(t => t.status === "done").length;
  const overdueCount = tasks.filter(t => t.deadline && new Date(t.deadline) < now && t.status !== "done").length;

  return (
    <div>
      <div style={styles.pageHeader}>
        <h1 style={styles.heading}>{isAdmin ? "Tableau de bord" : `Bonjour, ${user?.name}`}</h1>
        {isAdmin && (
          <div style={styles.quickActions}>
            <button style={styles.btnAdmin} onClick={() => { setUserModal("admin"); setUserForm({ name: "", email: "", password: "" }); setUserError(""); }}>
              + Ajouter un administrateur
            </button>
            <button style={styles.btnIntern} onClick={() => { setUserModal("intern"); setUserForm({ name: "", email: "", password: "" }); setUserError(""); }}>
              + Ajouter un stagiaire
            </button>
          </div>
        )}
      </div>

      {/* Quick add user modal */}
      {userModal && (
        <div style={styles.overlay} onClick={() => setUserModal(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>
              {userModal === "admin" ? "Nouvel administrateur" : "Nouveau stagiaire"}
            </h2>
            {userSuccess ? (
              <div style={styles.successBox}>{userSuccess}</div>
            ) : (
              <form onSubmit={handleCreateUser} style={styles.form}>
                <label style={styles.label}>Nom complet</label>
                <input style={styles.input} placeholder="ex: Oumayma Ben Ali" value={userForm.name}
                  onChange={e => setUserForm({ ...userForm, name: e.target.value })} required />
                <label style={styles.label}>Email</label>
                <input style={styles.input} type="email" placeholder="email@exemple.com" value={userForm.email}
                  onChange={e => setUserForm({ ...userForm, email: e.target.value })} required />
                <label style={styles.label}>Mot de passe</label>
                <input style={styles.input} type="password" placeholder="Minimum 6 caractères" value={userForm.password}
                  onChange={e => setUserForm({ ...userForm, password: e.target.value })} required />
                <div style={styles.roleChip}>
                  Rôle : <strong>{userModal === "admin" ? "Administrateur" : "Stagiaire"}</strong> (défini automatiquement)
                </div>
                {userError && <div style={styles.errorBox}>{userError}</div>}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  <button style={userModal === "admin" ? styles.btnAdmin : styles.btnIntern} type="submit">Créer</button>
                  <button style={styles.btnSec} type="button" onClick={() => setUserModal(null)}>Annuler</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <div style={styles.statsRow}>
        {isAdmin && stats && <StatCard label="Stagiaires" value={stats.interns.length} color="#059669" />}
        {isAdmin && stats && <StatCard label="Projets" value={stats.projects.length} color="#4f46e5" />}
        <StatCard label="À faire" value={todoCount} color="#d97706" />
        <StatCard label="En cours" value={inProgressCount} color="#2563eb" />
        <StatCard label="Terminées" value={doneCount} color="#16a34a" />
        {overdueCount > 0 && <StatCard label="En retard" value={overdueCount} color="#e53e3e" />}
      </div>

      {isAdmin && stats && stats.projects.length > 0 && (
        <>
          <h2 style={styles.sectionTitle}>Avancement des projets</h2>
          <div style={styles.progressGrid}>
            {stats.projects.map(p => (
              <div key={p.id} style={styles.progressCard}>
                <div style={styles.progressHeader}>
                  <span style={styles.projectName}>{p.name}</span>
                  <span style={styles.progressPct}>{p.progress}%</span>
                </div>
                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: `${p.progress}%` }} />
                </div>
                <div style={styles.progressMeta}>{p.done} / {p.total} tâches terminées</div>
              </div>
            ))}
          </div>
        </>
      )}

      
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ ...styles.card, borderTop: `4px solid ${color}` }}>
      <div style={{ ...styles.cardValue, color }}>{value}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  );
}

const styles = {
  loadingWrap: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4rem", gap: "1rem" },
  spinner: { width: "36px", height: "36px", border: "4px solid #e2e8f0", borderTop: "4px solid #4f46e5", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  loadingText: { color: "#718096", fontSize: "0.95rem" },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" },
  heading: { fontSize: "1.6rem", fontWeight: 700, color: "#1a202c", margin: 0 },
  quickActions: { display: "flex", gap: "0.6rem" },
  btnAdmin: { background: "#7c3aed", color: "#fff", border: "none", padding: "0.6rem 1.1rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", fontSize: "0.875rem" },
  btnIntern: { background: "#4f46e5", color: "#fff", border: "none", padding: "0.6rem 1.1rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", fontSize: "0.875rem" },
  btnSec: { background: "#e2e8f0", color: "#2d3748", border: "none", padding: "0.6rem 1.1rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: "12px", padding: "2rem", width: "440px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalTitle: { margin: "0 0 1.25rem", fontSize: "1.15rem", fontWeight: 700, color: "#1a202c" },
  form: { display: "flex", flexDirection: "column", gap: "0.4rem" },
  label: { fontSize: "0.8rem", fontWeight: 600, color: "#4a5568", marginTop: "0.4rem" },
  input: { padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.95rem" },
  roleChip: { background: "#f0f4ff", border: "1px solid #c7d2fe", color: "#4338ca", padding: "0.5rem 0.85rem", borderRadius: "8px", fontSize: "0.82rem", marginTop: "0.25rem" },
  errorBox: { background: "#fff5f5", border: "1px solid #fca5a5", color: "#c53030", padding: "0.6rem 0.85rem", borderRadius: "8px", fontSize: "0.85rem" },
  successBox: { background: "#f0fdf4", border: "1px solid #86efac", color: "#16a34a", padding: "1rem", borderRadius: "8px", textAlign: "center", fontWeight: 600 },
  statsRow: { display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" },
  card: { background: "#fff", borderRadius: "10px", padding: "1.25rem 1.5rem", minWidth: "130px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" },
  cardValue: { fontSize: "2rem", fontWeight: 700 },
  cardLabel: { color: "#718096", fontSize: "0.85rem", marginTop: "0.25rem" },
  sectionTitle: { fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem", color: "#2d3748", marginTop: "1.5rem" },
  progressGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem", marginBottom: "1rem" },
  progressCard: { background: "#fff", borderRadius: "10px", padding: "1rem 1.25rem", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" },
  progressHeader: { display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" },
  projectName: { fontWeight: 600, color: "#1a202c", fontSize: "0.9rem" },
  progressPct: { fontWeight: 700, color: "#4f46e5" },
  progressBar: { height: "8px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden", marginBottom: "0.35rem" },
  progressFill: { height: "100%", background: "#4f46e5", borderRadius: "999px" },
  progressMeta: { fontSize: "0.75rem", color: "#718096" },
  table: { background: "#fff", borderRadius: "10px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden", marginBottom: "1rem" },
  tableHeader: { display: "grid", padding: "0.75rem 1.25rem", background: "#f7fafc", fontWeight: 600, fontSize: "0.8rem", color: "#718096", textTransform: "uppercase" },
  tableRow: { display: "grid", padding: "0.85rem 1.25rem", borderTop: "1px solid #f0f0f0", alignItems: "center", fontSize: "0.9rem" },
  overdueRow: { background: "#fff5f5" },
  overdueTag: { fontSize: "0.65rem", background: "#fee2e2", color: "#e53e3e", padding: "0.1rem 0.4rem", borderRadius: "4px", marginLeft: "0.4rem", fontWeight: 700 },
  badge: { display: "inline-block", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600 },
  muted: { color: "#718096" },
  empty: { padding: "1.5rem", color: "#a0aec0", textAlign: "center" },
};
