import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const TYPE_META = {
  task:    { label: "Tâche",            color: "#6366f1", bg: "#ede9fe" },
  bug:     { label: "Bug",              color: "#e53e3e", bg: "#fff5f5" },
  feature: { label: "Fonctionnalité",   color: "#059669", bg: "#d1fae5" },
  story:   { label: "Story",            color: "#d97706", bg: "#fef3c7" },
};
const PRIORITY_META = {
  low:    { label: "Faible",   color: "#059669", bg: "#d1fae5" },
  medium: { label: "Moyenne",  color: "#d97706", bg: "#fef3c7" },
  high:   { label: "Haute",    color: "#dc2626", bg: "#fee2e2" },
};
const STATUS_FR = { todo: "À faire", in_progress: "En cours", done: "Terminé" };
const POINTS = [1, 2, 3, 5, 8, 13];

function toDateInput(iso) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function TaskModal({ task: initialTask, onClose, onStatusChange, onDelete, projectId, allInterns = [], parts = [] }) {
  const { user, isAdmin } = useAuth();
  const [task, setTask] = useState(initialTask);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initialTask.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(initialTask.description || "");
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [tab, setTab] = useState("comments");
  const [newSubtask, setNewSubtask] = useState("");
  const [projectLabels, setProjectLabels] = useState([]);
  const [newLabel, setNewLabel] = useState({ name: "", color: "#6366f1" });
  const [showLabelForm, setShowLabelForm] = useState(false);

  const pid = projectId || task.project_id;

  async function load() {
    const [c, a, t, labels] = await Promise.all([
      api.getComments(task.id),
      api.getActivity(task.id),
      api.getTasks().then(tasks => tasks.find(t => t.id === task.id)),
      api.getLabels(pid),
    ]);
    setComments(c);
    setActivity(a);
    if (t) { setTask(t); setDescDraft(t.description || ""); }
    setProjectLabels(labels);
  }

  useEffect(() => { load(); }, [task.id]);

  async function patch(fields) {
    await api.updateTask(task.id, fields);
    load();
  }

  async function handleSaveTitle() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === task.title) { setEditingTitle(false); return; }
    setTask(t => ({ ...t, title: trimmed }));
    setEditingTitle(false);
    await patch({ title: trimmed });
  }

  async function handleSaveDesc() {
    setEditingDesc(false);
    if (descDraft === (task.description || "")) return;
    setTask(t => ({ ...t, description: descDraft }));
    await patch({ description: descDraft || null });
  }

  async function handleAddSubtask(e) {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    const title = newSubtask.trim();
    const tempId = Date.now();
    setTask(t => ({ ...t, subtasks: [...(t.subtasks || []), { id: tempId, title, done: false }] }));
    setNewSubtask("");
    const created = await api.createSubtask(task.id, title);
    setTask(t => ({ ...t, subtasks: t.subtasks.map(s => s.id === tempId ? { ...s, id: created.id } : s) }));
  }

  async function handleToggleSubtask(subtaskId, done) {
    setTask(t => ({ ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, done } : s) }));
    await api.toggleSubtask(task.id, subtaskId, done);
  }

  async function handleDeleteSubtask(subtaskId) {
    setTask(t => ({ ...t, subtasks: t.subtasks.filter(s => s.id !== subtaskId) }));
    await api.deleteSubtask(task.id, subtaskId);
  }

  async function handleToggleLabel(labelId) {
    const current = task.labels.map(l => l.id);
    const updated = current.includes(labelId) ? current.filter(id => id !== labelId) : [...current, labelId];
    await patch({ label_ids: updated });
  }

  async function handleCreateLabel(e) {
    e.preventDefault();
    await api.createLabel(pid, newLabel);
    setNewLabel({ name: "", color: "#6366f1" });
    setShowLabelForm(false);
    load();
  }

  const subtaskDone = task.subtasks?.filter(s => s.done).length || 0;
  const subtaskTotal = task.subtasks?.length || 0;
  const subtaskPct = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : 0;
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== "done";
  const typeMeta = TYPE_META[task.task_type] || TYPE_META.task;
  const priorityMeta = PRIORITY_META[task.priority] || PRIORITY_META.medium;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div style={s.header}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={s.typeLine}>
              <span style={{ ...s.typeBadge, background: typeMeta.bg, color: typeMeta.color }}>{typeMeta.label}</span>
              <span style={{ ...s.typeBadge, background: priorityMeta.bg, color: priorityMeta.color }}>{priorityMeta.label}</span>
              <span style={s.taskId}>#{task.id}</span>
              {isOverdue && <span style={s.overdueTag}>EN RETARD</span>}
            </div>
            {editingTitle ? (
              <input
                style={s.titleInput}
                value={titleDraft}
                autoFocus
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={e => { if (e.key === "Enter") handleSaveTitle(); if (e.key === "Escape") { setTitleDraft(task.title); setEditingTitle(false); } }}
              />
            ) : (
              <h2 style={s.title} onClick={() => isAdmin && setEditingTitle(true)} title={isAdmin ? "Cliquez pour modifier" : ""}>
                {task.title} {isAdmin && <span style={s.editHint}>✎</span>}
              </h2>
            )}
            {task.labels?.length > 0 && (
              <div style={s.labelStrip}>
                {task.labels.map(l => (
                  <span key={l.id} style={{ ...s.labelChip, background: l.color + "22", color: l.color, borderColor: l.color + "55" }}>{l.name}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignSelf: "flex-start", flexShrink: 0 }}>
            {(isAdmin || task.created_by?.id === user?.id) && (
              <button style={s.deleteBtn} onClick={async () => {
                if (!window.confirm("Supprimer cette tâche ?")) return;
                await api.deleteTask(task.id);
                onDelete ? onDelete() : onClose();
              }}>🗑 Supprimer</button>
            )}
            <button style={s.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={s.body}>
          {/* ── Left column ── */}
          <div style={s.leftCol}>

            {/* Description */}
            <div style={s.section}>
              <div style={s.sectionTitle}>Description</div>
              {editingDesc ? (
                <textarea
                  style={s.descTextarea}
                  value={descDraft}
                  autoFocus
                  onChange={e => setDescDraft(e.target.value)}
                  onBlur={handleSaveDesc}
                  placeholder="Ajouter une description..."
                  rows={4}
                />
              ) : (
                <div
                  style={{ ...s.descBox, cursor: isAdmin ? "pointer" : "default" }}
                  onClick={() => isAdmin && setEditingDesc(true)}
                  title={isAdmin ? "Cliquer pour modifier" : ""}
                >
                  {task.description
                    ? <>{task.description} {isAdmin && <span style={s.editHint}>✎</span>}</>
                    : isAdmin
                      ? <span style={{ color: "#a0aec0" }}>+ Ajouter une description...</span>
                      : <span style={{ color: "#a0aec0" }}>Aucune description.</span>
                  }
                </div>
              )}
            </div>

            {/* Subtasks */}
            <div style={s.section}>
              <div style={s.sectionTitle}>
                Sous-tâches
                {subtaskTotal > 0 && <span style={s.subtaskProgress}>{subtaskDone}/{subtaskTotal}</span>}
              </div>
              {subtaskTotal > 0 && (
                <div style={s.subtaskBar}><div style={{ ...s.subtaskFill, width: `${subtaskPct}%` }} /></div>
              )}
              {task.subtasks?.map(sub => (
                <div key={sub.id} style={s.subtaskRow}>
                  <input type="checkbox" checked={sub.done} onChange={() => handleToggleSubtask(sub.id, !sub.done)} style={{ cursor: "pointer" }} />
                  <span style={{ ...s.subtaskTitle, textDecoration: sub.done ? "line-through" : "none", color: sub.done ? "#a0aec0" : "#1a202c" }}>{sub.title}</span>
                  <button style={s.delSubBtn} onClick={() => handleDeleteSubtask(sub.id)}>✕</button>
                </div>
              ))}
              <form onSubmit={handleAddSubtask} style={s.subtaskForm}>
                <input style={s.subtaskInput} placeholder="Ajouter une sous-tâche..." value={newSubtask} onChange={e => setNewSubtask(e.target.value)} />
                <button style={s.addSubBtn} type="submit">+</button>
              </form>
            </div>

            {/* Tabs */}
            <div style={s.tabs}>
              {["comments", "activity"].map(t => (
                <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
                  {t === "comments" ? `Commentaires (${comments.length})` : "Activité"}
                </button>
              ))}
            </div>

            {tab === "comments" && (
              <div>
                <div style={s.commentList}>
                  {comments.length === 0 && <p style={s.empty}>Aucun commentaire.</p>}
                  {comments.map(c => (
                    <div key={c.id} style={s.comment}>
                      <div style={s.commentHeader}>
                        <div style={s.commentAvatar}>{c.author.name[0]}</div>
                        <strong style={{ fontSize: "0.85rem" }}>{c.author.name}</strong>
                        <span style={s.time}>{new Date(c.created_at).toLocaleString()}</span>
                        {(c.author.id === user?.id || isAdmin) && (
                          <button style={s.delComment} onClick={() => api.deleteComment(task.id, c.id).then(load)}>✕</button>
                        )}
                      </div>
                      <p style={s.commentBody}>{c.content}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={async e => { e.preventDefault(); if (!newComment.trim()) return; await api.addComment(task.id, newComment); setNewComment(""); load(); }} style={s.commentForm}>
                  <textarea style={s.textarea} placeholder="Écrire un commentaire..." value={newComment} onChange={e => setNewComment(e.target.value)} rows={2} />
                  <button style={s.submitBtn} type="submit">Publier</button>
                </form>
              </div>
            )}

            {tab === "activity" && (
              <div style={s.commentList}>
                {activity.length === 0 && <p style={s.empty}>Aucune activité.</p>}
                {activity.map(a => (
                  <div key={a.id} style={s.activityRow}>
                    <span style={s.activityDot} />
                    <span style={{ fontSize: "0.85rem" }}><strong>{a.user.name}</strong> {a.action}</span>
                    <span style={s.time}>{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <div style={s.rightCol}>

            {/* Status */}
            <div style={s.sideSection}>
              <div style={s.sideSectionTitle}>Statut</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {["todo", "in_progress", "done"].map(st => (
                  <button key={st} style={{ ...s.sideBtn, ...(task.status === st ? s.sideBtnActive : {}) }}
                    onClick={() => { onStatusChange && onStatusChange(task.id, st); setTask(t => ({ ...t, status: st })); }}>
                    {STATUS_FR[st]}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority — admin editable */}
            <div style={s.sideSection}>
              <div style={s.sideSectionTitle}>Priorité</div>
              {isAdmin ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {["low", "medium", "high"].map(p => {
                    const m = PRIORITY_META[p];
                    return (
                      <button key={p} style={{ ...s.sideBtn, ...(task.priority === p ? { background: m.bg, color: m.color, borderColor: m.color + "44", fontWeight: 700 } : {}) }}
                        onClick={() => { setTask(t => ({ ...t, priority: p })); patch({ priority: p }); }}>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span style={{ ...s.typeBadge, background: priorityMeta.bg, color: priorityMeta.color }}>{priorityMeta.label}</span>
              )}
            </div>

            {/* Task type — admin editable */}
            {isAdmin && (
              <div style={s.sideSection}>
                <div style={s.sideSectionTitle}>Type</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {["task", "bug", "feature", "story"].map(tp => {
                    const m = TYPE_META[tp];
                    return (
                      <button key={tp} style={{ ...s.sideBtn, ...(task.task_type === tp ? { background: m.bg, color: m.color, borderColor: m.color + "44", fontWeight: 700 } : {}) }}
                        onClick={() => { setTask(t => ({ ...t, task_type: tp })); patch({ task_type: tp }); }}>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dates — admin editable */}
            <div style={s.sideSection}>
              <div style={s.sideSectionTitle}>Dates</div>
              <div style={s.dateLine}>
                <span style={s.dateLabel}>Début</span>
                {isAdmin ? (
                  <input type="date" style={s.dateInput} value={toDateInput(task.start_date)}
                    onChange={e => { setTask(t => ({ ...t, start_date: e.target.value })); patch({ start_date: e.target.value || null }); }} />
                ) : (
                  <span>{task.start_date ? new Date(task.start_date).toLocaleDateString("fr-FR") : "—"}</span>
                )}
              </div>
              <div style={{ ...s.dateLine, color: isOverdue ? "#e53e3e" : "inherit" }}>
                <span style={s.dateLabel}>Fin</span>
                {isAdmin ? (
                  <input type="date" style={{ ...s.dateInput, ...(isOverdue ? { color: "#e53e3e" } : {}) }} value={toDateInput(task.deadline)}
                    onChange={e => { setTask(t => ({ ...t, deadline: e.target.value })); patch({ deadline: e.target.value || null }); }} />
                ) : (
                  <span>{task.deadline ? new Date(task.deadline).toLocaleDateString("fr-FR") : "—"}</span>
                )}
              </div>
            </div>

            {/* Story points */}
            <div style={s.sideSection}>
              <div style={s.sideSectionTitle}>Points d'effort</div>
              <div style={s.pointsRow}>
                {POINTS.map(p => (
                  <button key={p} style={{ ...s.pointBtn, ...(task.story_points === p ? s.pointBtnActive : {}) }}
                    onClick={() => { patch({ story_points: task.story_points === p ? null : p }); }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Assignee */}
            {isAdmin && (
              <div style={s.sideSection}>
                <div style={s.sideSectionTitle}>Assigné à</div>
                {task.assignee && (
                  <div style={s.internBadge}>
                    <div style={s.avatar}>{task.assignee.name[0]}</div>
                    <span style={{ fontSize: "0.85rem" }}>{task.assignee.name}</span>
                  </div>
                )}
                {allInterns.length > 0 && (
                  <select style={{ ...s.sideBtn, marginTop: "0.5rem", width: "100%", cursor: "pointer" }}
                    value={task.assignee?.id || ""}
                    onChange={e => { const v = e.target.value ? Number(e.target.value) : null; patch({ assignee_id: v }); }}>
                    <option value="">— Aucun assigné</option>
                    {allInterns.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                )}
                {parts.length > 0 && (
                  <select style={{ ...s.sideBtn, marginTop: "0.4rem", width: "100%", cursor: "pointer" }}
                    value={task.part_id || ""}
                    onChange={e => { const v = e.target.value ? Number(e.target.value) : null; patch({ part_id: v }); }}>
                    <option value="">— Aucune partie</option>
                    {parts.map(p => <option key={p.id} value={p.id}>{p.name}{p.assignee ? ` (${p.assignee.name})` : ""}</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Labels */}
            <div style={s.sideSection}>
              <div style={s.sideSectionTitle}>Étiquettes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {projectLabels.map(l => {
                  const active = task.labels?.some(tl => tl.id === l.id);
                  return (
                    <div key={l.id} style={s.labelRow}>
                      <button style={{ ...s.labelToggle, background: active ? l.color : "#f0f0f0", color: active ? "#fff" : "#4a5568" }}
                        onClick={() => handleToggleLabel(l.id)}>
                        <span style={{ ...s.labelDot, background: l.color }} />{l.name}
                      </button>
                      {isAdmin && <button style={s.delLabelBtn} onClick={() => api.deleteLabel(pid, l.id).then(load)}>✕</button>}
                    </div>
                  );
                })}
              </div>
              {isAdmin && (showLabelForm ? (
                <form onSubmit={handleCreateLabel} style={s.labelForm}>
                  <input style={s.labelNameInput} placeholder="Nom de l'étiquette" value={newLabel.name} onChange={e => setNewLabel({ ...newLabel, name: e.target.value })} required />
                  <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                    <input type="color" value={newLabel.color} onChange={e => setNewLabel({ ...newLabel, color: e.target.value })} style={s.colorPicker} />
                    <button style={s.addSubBtn} type="submit">OK</button>
                    <button style={s.delLabelBtn} type="button" onClick={() => setShowLabelForm(false)}>✕</button>
                  </div>
                </form>
              ) : (
                <button style={s.newLabelBtn} onClick={() => setShowLabelForm(true)}>+ Nouvelle étiquette</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: "14px", width: "900px", maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column" },
  header: { display: "flex", gap: "1rem", padding: "1.25rem 1.5rem 0.75rem", borderBottom: "1px solid #f0f0f0" },
  typeLine: { display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.4rem", flexWrap: "wrap" },
  typeBadge: { fontSize: "0.7rem", fontWeight: 700, padding: "0.2rem 0.55rem", borderRadius: "6px", textTransform: "uppercase", letterSpacing: "0.04em" },
  taskId: { fontSize: "0.75rem", color: "#a0aec0" },
  overdueTag: { fontSize: "0.65rem", background: "#fee2e2", color: "#dc2626", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 700 },
  title: { margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#1a202c", cursor: "pointer", wordBreak: "break-word" },
  titleInput: { fontSize: "1.1rem", fontWeight: 700, border: "none", borderBottom: "2px solid #4f46e5", outline: "none", width: "100%", padding: "0.1rem 0", background: "transparent" },
  editHint: { fontSize: "0.75rem", color: "#a0aec0", marginLeft: "0.3rem", opacity: 0.6 },
  labelStrip: { display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.5rem" },
  labelChip: { fontSize: "0.7rem", padding: "0.15rem 0.55rem", borderRadius: "999px", border: "1px solid", fontWeight: 600 },
  deleteBtn: { padding: "0.35rem 0.7rem", borderRadius: "7px", border: "1px solid #fca5a5", background: "#fff5f5", color: "#e53e3e", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, whiteSpace: "nowrap" },
  closeBtn: { background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "#718096" },
  body: { display: "flex", flex: 1 },
  leftCol: { flex: 1, padding: "1.25rem 1.5rem", overflowY: "auto", minWidth: 0 },
  rightCol: { width: "230px", borderLeft: "1px solid #f0f0f0", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.1rem", flexShrink: 0, overflowY: "auto" },

  section: { marginBottom: "1.25rem" },
  sectionTitle: { fontSize: "0.78rem", fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.5rem" },

  descBox: { background: "#f7fafc", padding: "0.75rem", borderRadius: "8px", fontSize: "0.875rem", color: "#4a5568", minHeight: "48px", lineHeight: 1.6 },
  descTextarea: { width: "100%", padding: "0.65rem", borderRadius: "8px", border: "1px solid #4f46e5", fontSize: "0.875rem", resize: "vertical", fontFamily: "inherit", outline: "none", boxSizing: "border-box" },

  subtaskProgress: { background: "#e2e8f0", borderRadius: "999px", padding: "0.1rem 0.45rem", fontSize: "0.7rem", fontWeight: 700 },
  subtaskBar: { height: "4px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden", marginBottom: "0.6rem" },
  subtaskFill: { height: "100%", background: "#4f46e5", borderRadius: "999px" },
  subtaskRow: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0" },
  subtaskTitle: { flex: 1, fontSize: "0.875rem" },
  delSubBtn: { background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: "0.7rem" },
  subtaskForm: { display: "flex", gap: "0.4rem", marginTop: "0.4rem" },
  subtaskInput: { flex: 1, padding: "0.4rem 0.65rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.85rem" },
  addSubBtn: { background: "#4f46e5", color: "#fff", border: "none", borderRadius: "6px", padding: "0.4rem 0.75rem", cursor: "pointer", fontWeight: 700 },

  tabs: { display: "flex", gap: "0.25rem", borderBottom: "2px solid #e2e8f0", marginBottom: "1rem" },
  tab: { padding: "0.45rem 0.85rem", border: "none", background: "none", cursor: "pointer", fontSize: "0.875rem", color: "#718096", borderBottom: "2px solid transparent", marginBottom: "-2px" },
  tabActive: { color: "#4f46e5", borderBottomColor: "#4f46e5", fontWeight: 600 },
  commentList: { maxHeight: "200px", overflowY: "auto", marginBottom: "1rem" },
  empty: { color: "#a0aec0", textAlign: "center", padding: "0.75rem 0", fontSize: "0.85rem" },
  comment: { padding: "0.65rem", borderRadius: "8px", background: "#f7fafc", marginBottom: "0.5rem" },
  commentHeader: { display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.25rem" },
  commentAvatar: { width: "22px", height: "22px", borderRadius: "50%", background: "#4f46e5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, flexShrink: 0 },
  time: { fontSize: "0.72rem", color: "#a0aec0", flex: 1 },
  commentBody: { margin: 0, fontSize: "0.85rem", color: "#2d3748" },
  delComment: { background: "none", border: "none", cursor: "pointer", color: "#e53e3e", fontSize: "0.72rem" },
  commentForm: { display: "flex", gap: "0.5rem", alignItems: "flex-end" },
  textarea: { flex: 1, padding: "0.6rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.875rem", resize: "none", fontFamily: "inherit" },
  submitBtn: { padding: "0.55rem 1rem", background: "#4f46e5", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" },
  activityRow: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.45rem 0", borderBottom: "1px solid #f0f0f0" },
  activityDot: { width: "7px", height: "7px", borderRadius: "50%", background: "#4f46e5", flexShrink: 0 },

  sideSection: { paddingBottom: "0.85rem", marginBottom: "0.85rem", borderBottom: "1px solid #f0f0f0" },
  sideSectionTitle: { fontSize: "0.7rem", fontWeight: 700, color: "#a0aec0", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" },
  sideBtn: { padding: "0.38rem 0.75rem", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: "pointer", fontSize: "0.82rem", textAlign: "left" },
  sideBtnActive: { background: "#4f46e5", color: "#fff", borderColor: "#4f46e5", fontWeight: 600 },
  dateLine: { display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", marginBottom: "0.4rem" },
  dateLabel: { fontSize: "0.7rem", fontWeight: 600, color: "#a0aec0", minWidth: "30px" },
  dateInput: { flex: 1, padding: "0.3rem 0.4rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.8rem", cursor: "pointer" },
  pointsRow: { display: "flex", gap: "0.3rem", flexWrap: "wrap" },
  pointBtn: { width: "30px", height: "30px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" },
  pointBtnActive: { background: "#4f46e5", color: "#fff", borderColor: "#4f46e5" },
  internBadge: { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" },
  avatar: { width: "24px", height: "24px", borderRadius: "50%", background: "#4f46e5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 },
  labelRow: { display: "flex", alignItems: "center", gap: "0.3rem" },
  labelToggle: { flex: 1, display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.3rem 0.6rem", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 },
  labelDot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  delLabelBtn: { background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: "0.7rem", padding: "0.2rem" },
  labelForm: { marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.3rem" },
  labelNameInput: { padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.82rem" },
  colorPicker: { width: "28px", height: "28px", borderRadius: "4px", border: "1px solid #e2e8f0", padding: "1px", cursor: "pointer" },
  newLabelBtn: { marginTop: "0.5rem", background: "none", border: "1px dashed #cbd5e0", color: "#718096", padding: "0.35rem 0.5rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.78rem", width: "100%" },
};
