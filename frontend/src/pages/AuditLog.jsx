import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";

const ACTION_META = {
  login:           { label: "Connexion",         color: "#059669", bg: "#d1fae5" },
  logout:          { label: "Déconnexion",        color: "#0891b2", bg: "#cffafe" },
  login_failed:    { label: "Échec connexion",    color: "#dc2626", bg: "#fee2e2" },
  task_created:    { label: "Tâche créée",        color: "#4f46e5", bg: "#ede9fe" },
  task_deleted:    { label: "Tâche supprimée",    color: "#b45309", bg: "#fef3c7" },
  project_created: { label: "Projet créé",        color: "#0891b2", bg: "#cffafe" },
  project_deleted: { label: "Projet supprimé",    color: "#dc2626", bg: "#fee2e2" },
  user_created:    { label: "Utilisateur créé",   color: "#7c3aed", bg: "#ede9fe" },
};

function formatDuration(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function ActionBadge({ action }) {
  const meta = ACTION_META[action] || { label: action, color: "#4a5568", bg: "#e2e8f0" };
  return (
    <span style={{ ...s.badge, background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback((p = page) => {
    setLoading(true);
    api.getAuditLogs(p, 50)
      .then(data => {
        setLogs(data.logs);
        setTotal(data.total);
        setPages(data.pages);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(page); }, [page]);

  const actionTypes = ["all", ...Object.keys(ACTION_META)];

  const filtered = logs.filter(l => {
    if (filter !== "all" && l.action !== filter) return false;
    if (search && !l.user_name.toLowerCase().includes(search.toLowerCase()) &&
        !(l.entity_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <h1 style={s.heading}>Journal d'audit</h1>
      <p style={s.sub}>Toutes les actions importantes effectuées dans l'application.</p>

      <div style={s.toolbar}>
        <input
          style={s.search}
          placeholder="Rechercher par utilisateur ou entité..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={s.select} value={filter} onChange={e => setFilter(e.target.value)}>
          {actionTypes.map(a => (
            <option key={a} value={a}>
              {a === "all" ? "Toutes les actions" : (ACTION_META[a]?.label || a)}
            </option>
          ))}
        </select>
        <span style={s.count}>{total} entrée{total !== 1 ? "s" : ""} au total</span>
      </div>

      {loading ? (
        <p style={{ color: "#718096", padding: "2rem" }}>Chargement...</p>
      ) : (
        <>
          <div style={s.table}>
            <div style={s.tableHeader}>
              <span style={{ flex: 1.2 }}>Date & heure</span>
              <span style={{ flex: 1 }}>Action</span>
              <span style={{ flex: 1 }}>Utilisateur</span>
              <span style={{ flex: 1 }}>Entité</span>
              <span style={{ flex: 0.8 }}>Durée session</span>
            </div>

            {filtered.length === 0 && (
              <div style={s.empty}>Aucune entrée trouvée.</div>
            )}

            {filtered.map(log => (
              <div key={log.id} style={s.row}>
                <span style={{ ...s.cell, flex: 1.2, color: "#4a5568", fontSize: "0.82rem" }}>
                  {new Date(log.created_at).toLocaleString("fr-FR")}
                </span>
                <span style={{ ...s.cell, flex: 1 }}>
                  <ActionBadge action={log.action} />
                </span>
                <span style={{ ...s.cell, flex: 1, fontWeight: 600, color: "#1a202c" }}>
                  {log.user_name}
                </span>
                <span style={{ ...s.cell, flex: 1, color: "#718096", fontSize: "0.85rem" }}>
                  {log.entity_name ? (
                    <span>
                      <span style={{ color: "#a0aec0", fontSize: "0.75rem", marginRight: "0.3rem" }}>
                        {log.entity_type}
                      </span>
                      {log.entity_name}
                    </span>
                  ) : "—"}
                </span>
                <span style={{ ...s.cell, flex: 0.8, color: "#718096", fontSize: "0.8rem" }}>
                  {formatDuration(log.session_duration) || "—"}
                </span>
              </div>
            ))}
          </div>

          {pages > 1 && (
            <div style={s.pagination}>
              <button style={s.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Précédent</button>
              <span style={s.pageInfo}>Page {page} / {pages}</span>
              <button style={s.pageBtn} disabled={page === pages} onClick={() => setPage(p => p + 1)}>Suivant →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s = {
  heading: { fontSize: "1.6rem", fontWeight: 700, color: "#1a202c", margin: 0 },
  sub: { color: "#718096", fontSize: "0.9rem", marginTop: "0.3rem", marginBottom: "1.5rem" },
  toolbar: { display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" },
  search: { flex: 1, minWidth: "180px", padding: "0.5rem 0.85rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.9rem", outline: "none" },
  select: { padding: "0.5rem 0.75rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.85rem", background: "#fff", cursor: "pointer" },
  count: { fontSize: "0.82rem", color: "#a0aec0", whiteSpace: "nowrap" },
  table: { background: "#fff", borderRadius: "10px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", overflow: "hidden" },
  tableHeader: { display: "flex", padding: "0.65rem 1.25rem", background: "#f7f8fc", borderBottom: "1px solid #e2e8f0", fontSize: "0.75rem", fontWeight: 700, color: "#a0aec0", textTransform: "uppercase", letterSpacing: "0.05em" },
  row: { display: "flex", alignItems: "center", padding: "0.85rem 1.25rem", borderBottom: "1px solid #f0f0f0" },
  cell: { display: "flex", alignItems: "center" },
  empty: { padding: "2rem", textAlign: "center", color: "#a0aec0" },
  badge: { fontSize: "0.72rem", fontWeight: 700, padding: "0.2rem 0.6rem", borderRadius: "999px" },
  pagination: { display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", marginTop: "1.25rem" },
  pageBtn: { padding: "0.45rem 1rem", borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "0.85rem", color: "#4a5568" },
  pageInfo: { fontSize: "0.85rem", color: "#718096" },
};
