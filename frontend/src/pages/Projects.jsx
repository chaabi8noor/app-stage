import { useEffect, useState } from "react";
import { api, getCached } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const EMPTY_FORM = { name: "", description: "", github_url: "", start_date: "", deadline: "" };

const AVATAR_COLORS = ["#4f46e5","#059669","#d97706","#e53e3e","#7c3aed","#0284c7","#be185d","#0f766e"];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function Projects() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState(() => getCached("/projects/") || []);
  const [loading, setLoading] = useState(!getCached("/projects/"));
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);


  async function load() {
    try {
      const p = await api.getProjects();
      setProjects(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  
  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingProject(null);
    setShowForm(true);
  }

  function openEdit(e, project) {
    e.stopPropagation();
    setEditingProject(project);
    setForm({
      name: project.name,
      description: project.description || "",
      github_url: project.github_url || "",
      start_date: project.start_date ? project.start_date.slice(0, 10) : "",
      deadline: project.deadline ? project.deadline.slice(0, 10) : "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingProject(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const data = { ...form, start_date: form.start_date || null, deadline: form.deadline || null };
    try {
      if (editingProject) {
        await api.updateProject(editingProject.id, data);
      } else {
        await api.createProject(data);
      }
      closeForm();
      load();
    } catch (err) {
      alert(err.message || "Erreur lors de la sauvegarde.");
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!window.confirm("Supprimer ce projet et toutes ses données ?")) return;
    try {
      await api.deleteProject(id);
      load();
    } catch (err) {
      alert(err.message || "Erreur lors de la suppression.");
    }
  }

  if (loading) return <p style={{ padding: "2rem", color: "#718096" }}>Chargement...</p>;

  const totalInterns = new Set(
    projects.flatMap(p => p.parts?.map(pt => pt.assignee?.id).filter(Boolean))
  ).size;
async function handleDuplicate(e, project) {
    e.stopPropagation();
    const name = window.prompt("Nom du projet dupliqué :", `${project.name} (copie)`);
    if (!name) return;
    try {
      const newProject = await api.duplicateProject(project.id, name);
      load();
      navigate(`/projects/${newProject.id}`);
    } catch(err) {
      alert(err.message || "Erreur lors de la duplication.");
    }
  }

  return (
    <div>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.heading}>Projets</h1>
          <p style={styles.subheading}>{projects.length} projet{projects.length !== 1 ? "s" : ""} · {totalInterns} stagiaire{totalInterns !== 1 ? "s" : ""} assigné{totalInterns !== 1 ? "s" : ""}</p>
        </div>
        {isAdmin && <button style={styles.btn} onClick={openCreate}>+ Nouveau projet</button>}
      </div>

      {/* Modal création / modification */}
      {showForm && (
        <div style={styles.overlay} onClick={closeForm}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 style={styles.modalTitle}>{editingProject ? "Modifier le projet" : "Nouveau projet"}</h2>
            <form onSubmit={handleSubmit} style={styles.form}>
              <label style={styles.label}>Nom du projet *</label>
              <input style={styles.input} placeholder="ex. CRM Bâtiment" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />

              <label style={styles.label}>Description</label>
              <textarea style={{ ...styles.input, resize: "vertical", fontFamily: "inherit" }} rows={3} placeholder="De quoi s'agit-il ?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />

              <label style={styles.label}>URL du dépôt GitHub</label>
              <input style={styles.input} placeholder="https://github.com/org/repo" value={form.github_url} onChange={e => setForm({ ...form, github_url: e.target.value })} />

              <div style={{ display: "flex", gap: "1rem" }}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Date de début</label>
                  <input style={styles.input} type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Date limite</label>
                  <input style={styles.input} type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
                </div>
              </div>

              {!editingProject && (
                <p style={styles.hint}>Après avoir créé le projet, ouvrez-le pour assigner des stagiaires et leurs parties.</p>
              )}

              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button style={styles.btn} type="submit">{editingProject ? "Enregistrer" : "Créer le projet"}</button>
                <button style={styles.btnSec} type="button" onClick={closeForm}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {projects.length === 0 && (
        <div style={styles.empty}>Aucun projet pour l'instant. Créez-en un pour commencer.</div>
      )}

      <div style={styles.grid}>
        {projects.map(p => {
          const parts = p.parts || [];
          const totalTasks = parts.reduce((s, pt) => s + pt.task_count, 0);
          const doneTasks = parts.reduce((s, pt) => s + pt.done_count, 0);
          const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
          const isOverdue = p.deadline && new Date(p.deadline) < new Date();

          const uniqueAssignees = Object.values(
            parts.reduce((acc, pt) => {
              if (pt.assignee) acc[pt.assignee.id] = pt.assignee;
              return acc;
            }, {})
          );

          return (
            <div key={p.id} style={styles.card} onClick={() => navigate(`/projects/${p.id}`)}>
              {/* Title + actions */}
              <div style={styles.cardTop}>
                <span style={styles.cardTitle}>{p.name}</span>
                {isAdmin && (
                  <div style={styles.cardMenu} onClick={e => e.stopPropagation()}>
                    <button style={styles.cardMenu} onClick={e => handleDuplicate(e, p)} title="Dupliquer">📄</button>
                    <button style={styles.iconBtn} onClick={e => openEdit(e, p)} title="Modifier">✏️</button>
                    <button style={styles.iconBtn} onClick={e => handleDelete(e, p.id)} title="Supprimer">✕</button>
                  </div>
                )}
              </div>
              {/* Avatars + count */}
              <div style={styles.teamRow}>
                {uniqueAssignees.length > 0 ? (
                  <>
                    <div style={styles.avatarStack}>
                      {uniqueAssignees.slice(0, 5).map((u, i) => (
                        <div
                          key={u.id}
                          title={u.name}
                          style={{ ...styles.avatar, background: avatarColor(u.name), marginLeft: i > 0 ? "-7px" : 0, zIndex: uniqueAssignees.length - i }}
                        >
                          {u.name[0].toUpperCase()}
                        </div>
                      ))}
                      {uniqueAssignees.length > 5 && (
                        <div style={{ ...styles.avatar, background: "#9ca3af", marginLeft: "-7px" }}>+{uniqueAssignees.length - 5}</div>
                      )}
                    </div>
                    <span style={styles.internCount}>{uniqueAssignees.length} stagiaire{uniqueAssignees.length > 1 ? "s" : ""}</span>
                  </>
                ) : (
                  <span style={styles.noInterns}>Aucun stagiaire</span>
                )}

                {p.deadline && (
                  <span style={{ ...styles.deadlineTag, ...(isOverdue ? styles.deadlineOver : {}) }}>
                    {isOverdue ? "⚠ " : ""}{new Date(p.deadline).toLocaleDateString("fr-FR")}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div style={styles.progressSection}>
                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                </div>
                <span style={styles.progressLabel}>{progress}%</span>
                <span style={styles.tasksMini}>{doneTasks}/{totalTasks}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" },
  heading: { fontSize: "1.6rem", fontWeight: 700, color: "#1a202c", margin: 0 },
  subheading: { color: "#718096", fontSize: "0.875rem", marginTop: "0.25rem" },
  btn: { background: "#4f46e5", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  btnSec: { background: "#e2e8f0", color: "#2d3748", border: "none", padding: "0.6rem 1.2rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: "12px", padding: "2rem", width: "500px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalTitle: { margin: "0 0 1.25rem", fontSize: "1.2rem", fontWeight: 700, color: "#1a202c" },
  form: { display: "flex", flexDirection: "column", gap: "0.4rem" },
  label: { fontSize: "0.8rem", fontWeight: 600, color: "#4a5568", marginTop: "0.4rem" },
  input: { padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.95rem" },
  hint: { fontSize: "0.8rem", color: "#718096", background: "#f7fafc", padding: "0.6rem 0.85rem", borderRadius: "6px", margin: "0.25rem 0 0" },

  empty: { background: "#fff", borderRadius: "10px", padding: "3rem", textAlign: "center", color: "#a0aec0", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "0.85rem" },

  card: { background: "#fff", borderRadius: "10px", padding: "1rem 1.1rem", boxShadow: "0 1px 5px rgba(0,0,0,0.07)", cursor: "pointer", display: "flex", flexDirection: "column", gap: "0.65rem", transition: "box-shadow 0.15s" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" },
  cardTitle: { fontWeight: 700, fontSize: "0.95rem", color: "#1a202c", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  cardMenu: { display: "flex", gap: "0.15rem", flexShrink: 0 },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", padding: "0.15rem 0.3rem", borderRadius: "4px", opacity: 0.5, color: "#4a5568" },

  teamRow: { display: "flex", alignItems: "center", gap: "0.5rem" },
  avatarStack: { display: "flex", alignItems: "center" },
  avatar: { width: "26px", height: "26px", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700, border: "2px solid #fff", flexShrink: 0 },
  internCount: { fontSize: "0.75rem", color: "#4a5568", fontWeight: 600 },
  noInterns: { fontSize: "0.75rem", color: "#a0aec0", fontStyle: "italic" },
  deadlineTag: { marginLeft: "auto", fontSize: "0.7rem", color: "#718096", whiteSpace: "nowrap" },
  deadlineOver: { color: "#e53e3e", fontWeight: 700 },

  progressSection: { display: "flex", alignItems: "center", gap: "0.45rem" },
  progressBar: { flex: 1, height: "4px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" },
  progressFill: { height: "100%", background: "#4f46e5", borderRadius: "999px" },
  progressLabel: { fontSize: "0.7rem", fontWeight: 700, color: "#4f46e5", minWidth: "26px" },
  tasksMini: { fontSize: "0.68rem", color: "#a0aec0", whiteSpace: "nowrap" },
};
