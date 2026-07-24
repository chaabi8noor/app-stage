import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const STATUS_OPTIONS = ["todo", "in_progress", "done"];
const STATUS_FR = { all: "Tout", todo: "À faire", in_progress: "En cours", done: "Terminé" };
const PRIORITY_FR = { low: "Faible", medium: "Moyenne", high: "Haute" };

const EMPTY_FORM = { title: "", description: "", deadline: "", project_id: "", part_id: "" };
const PAGE_SIZE = 7;

export default function Tasks() {
  const { isAdmin } = useAuth();

  // Data
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterIntern, setFilterIntern] = useState("");
  const [page, setPage] = useState(1);

  // Meta lists
  const [projects, setProjects] = useState([]);
  const [allInterns, setAllInterns] = useState([]);
  const [parts, setParts] = useState([]);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Build filter params for backend
  function buildParams(pg = page) {
    const p = { page: pg, page_size: PAGE_SIZE };
    if (filterStatus !== "all") p.status = filterStatus;
    if (filterPriority) p.priority = filterPriority;
    if (filterProject) p.project_id = filterProject;
    if (filterIntern) p.assignee_id = filterIntern;
    if (search.trim()) p.search = search.trim();
    return p;
  }

  async function fetchTasks(pg = page) {
    setLoading(true);
    setError("");
    try {
      const res = await api.getTasksPaginated(buildParams(pg));
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
      setTotalPages(res.pages ?? 1);
    } catch (err) {
      setError("Impossible de charger les tâches.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Load meta lists once
  useEffect(() => {
    async function init() {
      const p = await api.getProjects();
      setProjects(p);
      if (isAdmin) {
        const users = await api.getUsers();
        setAllInterns(users.filter(u => u.role === "intern"));
      }
    }
    init().catch(console.error);
  }, [isAdmin]);

  // Fetch tasks whenever filters or page change
  useEffect(() => {
    fetchTasks(page);
  }, [filterStatus, filterPriority, filterProject, filterIntern, page]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchTasks(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 when filters change (not search — that's handled above)
  useEffect(() => { setPage(1); }, [filterStatus, filterPriority, filterProject, filterIntern]);

  async function handleProjectChange(projectId) {
    setForm(f => ({ ...f, project_id: projectId, part_id: "" }));
    if (!projectId) { setParts([]); return; }
    const p = await api.getParts(projectId);
    setParts(p);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) { setFormError("Le titre est obligatoire."); return; }
    if (!form.part_id) { setFormError("Choisissez une partie."); return; }
    setSaving(true);
    setFormError("");
    try {
      await api.createTask({
        title: form.title.trim(),
        description: form.description.trim() || null,
        deadline: form.deadline || null,
        project_id: Number(form.project_id),
        part_id: Number(form.part_id),
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchTasks(1);
    } catch (err) {
      setFormError(err.message || "Erreur lors de la création.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(taskId, status) {
    await api.updateTask(taskId, { status });
    fetchTasks(page);
  }

  async function handleDelete(taskId) {
    if (!window.confirm("Supprimer cette tâche ?")) return;
    await api.deleteTask(taskId);
    fetchTasks(page);
  }

  const hasActiveFilter = filterPriority || filterProject || filterIntern || search;
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1 style={styles.heading}>Tâches</h1>
        {!isAdmin && (
          <button style={styles.addBtn} onClick={() => { setShowForm(true); setFormError(""); setForm(EMPTY_FORM); }}>+ Ajouter une tâche</button>
        )}
      </div>

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", color: "#1a202c" }}>Nouvelle tâche</h3>
          <form onSubmit={handleSubmit}>
            <div style={styles.formRow}>
              <label style={styles.label}>Titre *</label>
              <input style={styles.input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Implémenter la page de connexion" />
            </div>
            <div style={styles.formRow}>
              <label style={styles.label}>Description</label>
              <textarea style={{ ...styles.input, minHeight: "70px", resize: "vertical" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Détails optionnels..." />
            </div>
            <div style={styles.formRow}>
              <label style={styles.label}>Projet *</label>
              <select style={styles.input} value={form.project_id} onChange={e => handleProjectChange(e.target.value)}>
                <option value="">— Choisir un projet —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={styles.formRow}>
              <label style={styles.label}>Partie *</label>
              <select style={styles.input} value={form.part_id} onChange={e => setForm(f => ({ ...f, part_id: e.target.value }))} disabled={!form.project_id}>
                <option value="">— Choisir une partie —</option>
                {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={styles.formRow}>
              <label style={styles.label}>Échéance</label>
              <input type="date" style={styles.input} value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
            </div>
            {formError && <p style={{ color: "#e53e3e", fontSize: "0.85rem", margin: "0.5rem 0" }}>{formError}</p>}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowForm(false)}>Annuler</button>
              <button type="submit" style={styles.submitBtn} disabled={saving}>{saving ? "Enregistrement..." : "Créer la tâche"}</button>
            </div>
          </form>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: "0.75rem" }}>
        <input style={styles.searchInput} placeholder="Rechercher par titre..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        {["all", ...STATUS_OPTIONS].map(s => (
          <button key={s} style={{ ...styles.filterBtn, ...(filterStatus === s ? styles.filterActive : {}) }} onClick={() => setFilterStatus(s)}>
            {STATUS_FR[s]}
          </button>
        ))}
        <select style={styles.filterSelect} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">Toutes priorités</option>
          <option value="high">Haute</option>
          <option value="medium">Moyenne</option>
          <option value="low">Faible</option>
        </select>
        {isAdmin && (
          <>
            <select style={styles.filterSelect} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
              <option value="">Tous les projets</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select style={styles.filterSelect} value={filterIntern} onChange={e => setFilterIntern(e.target.value)}>
              <option value="">Tous les stagiaires</option>
              {allInterns.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </>
        )}
        {hasActiveFilter && (
          <button style={styles.clearBtn} onClick={() => { setSearch(""); setFilterPriority(""); setFilterProject(""); setFilterIntern(""); }}>
            ✕ Réinitialiser
          </button>
        )}
        <span style={styles.count}>
          {loading ? "..." : `${total} tâche${total !== 1 ? "s" : ""}`}
        </span>
      </div>

      {error && <p style={{ color: "#e53e3e", padding: "1rem" }}>{error}</p>}

      <div style={styles.list}>
        {loading && items.length === 0 && (
          <p style={{ color: "#a0aec0", padding: "1.5rem" }}>Chargement...</p>
        )}
        {!loading && items.length === 0 && (
          <p style={{ color: "#a0aec0", padding: "1.5rem" }}>
            {hasActiveFilter || filterStatus !== "all" ? "Aucune tâche pour ces filtres." : "Aucune tâche."}
          </p>
        )}
        {items.map(task => (
          <div key={task.id} style={styles.row}>
            <div style={styles.rowMain}>
              <div style={styles.taskTitle}>{task.title}</div>
              {task.description && <div style={styles.taskDesc}>{task.description}</div>}
              <div style={styles.meta}>
                <span style={styles.chip}>{projectMap[task.project_id] || `Projet #${task.project_id}`}</span>
                {task.assignees?.length > 0 ? (
                  task.assignees.map(u => <span key={u.id} style={styles.chip}>{u.name}</span>)
                ) : task.assignee ? (
                  <span style={styles.chip}>{task.assignee.name}</span>
                ) : null}
                {task.deadline && <span style={{ ...styles.chip, color: "#e53e3e" }}>Échéance {new Date(task.deadline).toLocaleDateString("fr-FR")}</span>}
                <span style={{ ...styles.chip, ...priorityColor(task.priority) }}>{PRIORITY_FR[task.priority] || task.priority}</span>
              </div>
            </div>
            <div style={styles.rowActions}>
              <select style={styles.statusSelect} value={task.status} onChange={e => handleStatus(task.id, e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_FR[s]}</option>)}
              </select>
              {isAdmin && <button style={styles.delBtn} onClick={() => handleDelete(task.id)}>Supprimer</button>}
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button style={styles.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Précédent</button>
          <div style={styles.pageNumbers}>
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const p = totalPages <= 10 ? i + 1 : Math.max(1, page - 4) + i;
              return p <= totalPages ? (
                <button key={p} style={{ ...styles.pageNum, ...(p === page ? styles.pageNumActive : {}) }} onClick={() => setPage(p)}>{p}</button>
              ) : null;
            })}
          </div>
          <button style={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Suivant →</button>
          <span style={{ fontSize: "0.78rem", color: "#a0aec0" }}>Page {page}/{totalPages}</span>
        </div>
      )}
    </div>
  );
}

function priorityColor(p) {
  return { low: { background: "#d1fae5", color: "#065f46" }, medium: { background: "#fef3c7", color: "#92400e" }, high: { background: "#fee2e2", color: "#991b1b" } }[p] || {};
}

const styles = {
  heading: { fontSize: "1.6rem", fontWeight: 700, color: "#1a202c", margin: 0 },
  addBtn: { padding: "0.5rem 1.1rem", borderRadius: "8px", background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" },
  formCard: { background: "#fff", borderRadius: "10px", boxShadow: "0 1px 6px rgba(0,0,0,0.1)", padding: "1.25rem", marginBottom: "1.5rem" },
  formRow: { marginBottom: "0.75rem" },
  label: { display: "block", fontSize: "0.82rem", color: "#4a5568", marginBottom: "0.3rem", fontWeight: 500 },
  input: { width: "100%", padding: "0.45rem 0.7rem", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "0.9rem", boxSizing: "border-box" },
  cancelBtn: { padding: "0.45rem 1rem", borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "0.85rem" },
  submitBtn: { padding: "0.45rem 1.1rem", borderRadius: "7px", background: "#4f46e5", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" },
  filters: { display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" },
  filterBtn: { padding: "0.4rem 1rem", borderRadius: "999px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "0.85rem" },
  filterActive: { background: "#4f46e5", color: "#fff", border: "1px solid #4f46e5" },
  filterSelect: { padding: "0.4rem 0.75rem", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", fontSize: "0.85rem", cursor: "pointer" },
  clearBtn: { padding: "0.4rem 0.75rem", borderRadius: "8px", border: "1px solid #fca5a5", background: "#fff5f5", color: "#e53e3e", fontSize: "0.82rem", cursor: "pointer" },
  count: { marginLeft: "auto", fontSize: "0.8rem", color: "#a0aec0" },
  list: { background: "#fff", borderRadius: "10px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid #f0f0f0" },
  rowMain: { flex: 1 },
  rowActions: { display: "flex", gap: "0.5rem", alignItems: "center" },
  taskTitle: { fontWeight: 600, color: "#1a202c" },
  taskDesc: { fontSize: "0.82rem", color: "#718096" },
  meta: { display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.4rem" },
  chip: { fontSize: "0.72rem", padding: "0.15rem 0.5rem", borderRadius: "999px", background: "#e2e8f0", color: "#4a5568" },
  statusSelect: { padding: "0.4rem 0.75rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.85rem", cursor: "pointer" },
  delBtn: { padding: "0.4rem 0.75rem", borderRadius: "8px", border: "1px solid #feb2b2", background: "#fff5f5", color: "#e53e3e", cursor: "pointer", fontSize: "0.85rem" },
  searchInput: { width: "100%", padding: "0.55rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.9rem", boxSizing: "border-box" },
  pagination: { display: "flex", justifyContent: "center", alignItems: "center", gap: "0.75rem", marginTop: "1.25rem" },
  pageBtn: { padding: "0.5rem 1rem", borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", color: "#4a5568", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" },
  pageNumbers: { display: "flex", gap: "0.25rem" },
  pageNum: { width: "32px", height: "32px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", color: "#4a5568", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" },
  pageNumActive: { background: "#4f46e5", color: "#fff", borderColor: "#4f46e5" },
};
