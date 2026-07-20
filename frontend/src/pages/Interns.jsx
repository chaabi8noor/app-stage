import { useEffect, useState, useMemo } from "react";
import { api } from "../api/client";

const PAGE_SIZE = 6;

export default function Interns() {
  const [interns, setInterns] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "intern" });
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [projects, setProjects] = useState([]);
  // Search / filter / pagination
  const [search, setSearch] = useState("");
  const [filterStatus] = useState("all"); // "all" | "active" | "inactive"
  const [page, setPage] = useState(1);
  const [filterProject, setFilterProject] = useState("all"); // "all" or project ID
  const [internProjctsMap, setInternProjectsMap] = useState({}); // Map of intern ID to project name
  async function load() {
    const users = await api.getUsers();
    setInterns(users.filter(u => u.role === "intern"));
  }

  useEffect(() => { load().catch(console.error); }, []);

  //load projects 
  useEffect(() => {
  async function loadProjectsAndMembership() {
    try {
      const projs = await api.getProjects();
      setProjects(projs);

      // Fetch parts for every project, build intern → project_ids map
      const map = {};
      await Promise.all(projs.map(async proj => {
        const parts = await api.getParts(proj.id);
        parts.forEach(part => {
          const members = part.interns?.length > 0 ? part.interns : (part.assignee ? [part.assignee] : []);
          members.forEach(u => {
            if (!map[u.id]) map[u.id] = new Set();
            map[u.id].add(proj.id);
          });
        });
      }));
      setInternProjectsMap(map);
    } catch (err) {
      console.error("Erreur lors du chargement des projets :", err);
    }
  }
  loadProjectsAndMembership();
}, []);

  // Reset to page 1 when search/filter changes
  useEffect(() => { setPage(1); }, [search, filterStatus]);

  const filtered = useMemo(() => {
    return interns.filter(u => {
      const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
                          u.email.toLowerCase().includes(search.toLowerCase());
      const matchProject = filterProject === "all" ||
                          internProjctsMap[u.id]?.has(Number(filterProject));
      return matchSearch && matchProject;
    });
  }, [interns, search, filterProject, internProjctsMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await api.register(form);
      setForm({ name: "", email: "", password: "", role: "intern" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(intern) {
    setEditingId(intern.id);
    setEditForm({ name: intern.name, email: intern.email });
  }

  async function handleSaveEdit(id) {
    try {
      await api.updateUser(id, editForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || "Erreur lors de la modification.");
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Retirer ce stagiaire ?")) return;
    try {
      await api.deleteUser(id);
      load();
    } catch (err) {
      setError(err.message || "Erreur lors de la suppression.");
    }
  }
console.log("map:", internProjctsMap);
console.log("filterProject:", filterProject, typeof filterProject);
console.log("interns:", interns.map(i => i.id));
  return (
    <div>
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>Stagiaires</h1>
          <p style={styles.sub}>
            {filtered.length} stagiaire{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== interns.length && ` sur ${interns.length}`}
          </p>
        </div>
        <button style={styles.btn} onClick={() => setShowForm(!showForm)}>+ Ajouter un stagiaire</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={styles.form}>
          <input style={styles.input} placeholder="Nom complet" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <input style={styles.input} type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          <input style={styles.input} type="password" placeholder="Mot de passe" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          <select style={styles.input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="intern">Stagiaire</option>
            <option value="admin">Administrateur</option>
          </select>
          {error && <p style={styles.error}>{error}</p>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button style={styles.btn} type="submit">Ajouter</button>
            <button style={styles.btnSec} type="button" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </form>
      )}

      {/* Search + filter bar */}
      <div style={styles.toolbar}>
        <input
          style={styles.searchInput}
          placeholder="Rechercher par nom ou email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        
        <div>
          <h3>Filter by Project</h3>
          <select style={styles.input} value={filterProject} onChange={e => setFilterProject(e.target.value)}>
            <option value="all">Tous les projets</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={styles.table}>
        <div style={styles.tableHeader}>
          <span>Nom</span><span>Email</span><span>Actions</span>
        </div>

        {paginated.map(intern => (
          <div key={intern.id} style={styles.tableRow}>
            {editingId === intern.id ? (
              <>
                <input style={styles.editInput} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom" />
                <input style={styles.editInput} value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="Email" />
                <span />
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button style={styles.saveBtn} onClick={() => handleSaveEdit(intern.id)}>✓ Enregistrer</button>
                  <button style={styles.cancelEditBtn} onClick={() => setEditingId(null)}>Annuler</button>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontWeight: 600 }}>{intern.name}</span>
                <span style={styles.muted}>{intern.email}</span>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button style={styles.editBtn} onClick={() => startEdit(intern)}>✏ Modifier</button>
                  <button style={styles.delBtn} onClick={() => handleDelete(intern.id)}>Retirer</button>
                </div>
              </>
            )}
          </div>
        ))}

        {paginated.length === 0 && (
          <p style={styles.empty}>
            {search || filterStatus !== "all" ? "Aucun résultat pour cette recherche." : "Aucun stagiaire pour le moment."}
          </p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button style={styles.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Précédent</button>
          <div style={styles.pageNumbers}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                style={{ ...styles.pageNum, ...(p === page ? styles.pageNumActive : {}) }}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <button style={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Suivant →</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" },
  heading: { fontSize: "1.6rem", fontWeight: 700, color: "#1a202c", margin: 0 },
  sub: { color: "#718096", fontSize: "0.875rem", marginTop: "0.25rem" },
  btn: { background: "#4f46e5", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer" },
  btnSec: { background: "#e2e8f0", color: "#2d3748", border: "none", padding: "0.6rem 1.2rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer" },
  form: { background: "#fff", padding: "1.5rem", borderRadius: "10px", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" },
  input: { padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.95rem" },
  error: { color: "#e53e3e", fontSize: "0.875rem", margin: 0 },

  toolbar: { display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" },
  searchInput: { flex: 1, minWidth: "220px", padding: "0.6rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.9rem" },
  filterGroup: { display: "flex", gap: "0.35rem" },
  filterBtn: { padding: "0.5rem 0.9rem", borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", color: "#4a5568", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" },
  filterBtnActive: { background: "#4f46e5", color: "#fff", borderColor: "#4f46e5" },

  table: { background: "#fff", borderRadius: "10px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" },
  tableHeader: { display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1.5fr", padding: "0.75rem 1.25rem", background: "#f7fafc", fontWeight: 600, fontSize: "0.8rem", color: "#718096", textTransform: "uppercase" },
  tableRow: { display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1.5fr", padding: "0.85rem 1.25rem", borderTop: "1px solid #f0f0f0", alignItems: "center" },
  muted: { color: "#718096", fontSize: "0.9rem" },
  badge: { display: "inline-block", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 600 },
  active: { background: "#d1fae5", color: "#065f46" },
  inactive: { background: "#fee2e2", color: "#991b1b" },
  editInput: { padding: "0.35rem 0.65rem", borderRadius: "6px", border: "1px solid #c7d2fe", fontSize: "0.88rem", outline: "none", width: "100%" },
  editBtn: { background: "#ede9fe", border: "1px solid #c4b5fd", color: "#4f46e5", padding: "0.3rem 0.75rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 },
  saveBtn: { background: "#d1fae5", border: "1px solid #6ee7b7", color: "#065f46", padding: "0.3rem 0.75rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600 },
  cancelEditBtn: { background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#4a5568", padding: "0.3rem 0.75rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem" },
  delBtn: { background: "#fff5f5", border: "1px solid #feb2b2", color: "#e53e3e", padding: "0.3rem 0.75rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem" },
  empty: { padding: "1.5rem", color: "#a0aec0", textAlign: "center" },

  pagination: { display: "flex", justifyContent: "center", alignItems: "center", gap: "0.75rem", marginTop: "1.25rem" },
  pageBtn: { padding: "0.5rem 1rem", borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", color: "#4a5568", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" },
  pageNumbers: { display: "flex", gap: "0.25rem" },
  pageNum: { width: "32px", height: "32px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", color: "#4a5568", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" },
  pageNumActive: { background: "#4f46e5", color: "#fff", borderColor: "#4f46e5" },
};
