import { useRef, useState } from "react";
import { api } from "../api/client";

const PRIORITY_FR = { low: "Faible", medium: "Moyenne", high: "Haute" };
const TYPE_ICONS = { task: "✓", bug: "🐛", feature: "✨", story: "📖" };
const POINTS = [1, 2, 3, 5, 8, 13];

export default function PartCdcModal({ project, part, onClose, onSuccess }) {
  const fileRef = useRef();
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  async function handleAnalyze(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.analyzePartCdc(project.id, part.id, file);
      setResult(res);
      const init = res.suggested_tasks.map((t, i) => ({ ...t, _id: i }));
      setTasks(init);
      setSelected(new Set(init.map(t => t._id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function update(id, field, value) {
    setTasks(prev => prev.map(t => t._id === id ? { ...t, [field]: value } : t));
  }

  function updateSubtask(taskId, idx, value) {
    setTasks(prev => prev.map(t => t._id === taskId
      ? { ...t, subtasks: t.subtasks.map((s, i) => i === idx ? value : s) }
      : t
    ));
  }

  function addSubtask(taskId) {
    setTasks(prev => prev.map(t => t._id === taskId
      ? { ...t, subtasks: [...t.subtasks, "Nouvelle sous-tâche"] }
      : t
    ));
  }

  function removeSubtask(taskId, idx) {
    setTasks(prev => prev.map(t => t._id === taskId
      ? { ...t, subtasks: t.subtasks.filter((_, i) => i !== idx) }
      : t
    ));
  }

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleApprove() {
    const toCreate = tasks.filter(t => selected.has(t._id)).map(t => ({
      title: t.title,
      description: t.description,
      priority: t.priority,
      task_type: t.task_type,
      story_points: t.story_points || null,
      subtasks: t.subtasks.filter(s => s.trim()),
    }));
    if (!toCreate.length) return;
    setSaving(true);
    try {
      await api.approveTasks(project.id, part.id, toCreate);
      onSuccess(toCreate.length);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <div>
            <div style={s.partTag}>Partie : {part.name}{part.assignee ? ` — ${part.assignee.name}` : ""}</div>
            <h2 style={s.title}>CDC de cette partie</h2>
            <p style={s.sub}>Importez le cahier des charges — l'IA générera les tâches et sous-tâches détaillées</p>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* CDC already saved */}
        {part.cdc_filename && !result && (
          <div style={s.savedCdc}>
            <span style={s.savedIcon}>📄</span>
            <span>CDC enregistré : <strong>{part.cdc_filename}</strong></span>
            <span style={s.savedHint}>Importez un nouveau fichier pour remplacer</span>
          </div>
        )}

        {/* Upload form */}
        {!result && (
          <form onSubmit={handleAnalyze} style={s.uploadForm}>
            <div
              style={s.dropZone}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { fileRef.current.files = e.dataTransfer.files; setFileName(f.name); } }}
            >
              <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" style={{ display: "none" }} onChange={e => setFileName(e.target.files[0]?.name || "")} />
              {fileName
                ? <div><div style={s.fileName}>{fileName}</div><div style={s.fileHint}>Cliquer pour changer</div></div>
                : <div><div style={s.dropIcon}></div><div style={s.dropText}>Déposer le CDC ici (PDF ou DOCX)</div></div>
              }
            </div>
            {error && <div style={s.error}>{error}</div>}
            <button style={{ ...s.analyzeBtn, opacity: loading || !fileName ? 0.65 : 1 }} type="submit" disabled={loading || !fileName}>
              {loading ? "Analyse en cours..." : "Analyser et générer les tâches"}
            </button>
            {loading && <p style={s.loadingNote}>Cela peut prendre 15–30 secondes selon la taille du document</p>}
          </form>
        )}

        {/* Review */}
        {result && (
          <div style={s.results}>
            <div style={s.summary}>
              <div style={s.summaryTitle}>Résumé du CDC</div>
              <p style={s.summaryText}>{result.summary}</p>
              {result.parts_detected?.length > 0 && (
                <div style={s.tags}>{result.parts_detected.map((p, i) => <span key={i} style={s.tag}>{p}</span>)}</div>
              )}
            </div>

            <div style={s.reviewBar}>
              <span style={s.reviewTitle}>{tasks.length} tâches générées <span style={s.selCount}>{selected.size} sélectionnées</span></span>
              <div style={s.reviewBtns}>
                <button style={s.smBtn} onClick={() => setSelected(new Set(tasks.map(t => t._id)))}>Tout sélectionner</button>
                <button style={s.smBtn} onClick={() => setSelected(new Set())}>Tout désélectionner</button>
                <button style={s.smBtn} onClick={() => { setResult(null); setFileName(""); }}>↩ Réimporter</button>
              </div>
            </div>

            <div style={s.taskList}>
              {tasks.map(task => (
                <div key={task._id} style={{ ...s.taskCard, ...(selected.has(task._id) ? s.taskSel : s.taskUnsel) }}>
                  <div style={s.taskTop}>
                    <input type="checkbox" checked={selected.has(task._id)} onChange={() => toggle(task._id)} style={{ cursor: "pointer", marginTop: "3px", flexShrink: 0 }} />
                    <div style={s.taskBody}>
                      <input style={s.titleInput} value={task.title} onChange={e => update(task._id, "title", e.target.value)} />
                      <textarea style={s.descInput} rows={2} value={task.description} onChange={e => update(task._id, "description", e.target.value)} />

                      {/* Meta row */}
                      <div style={s.metaRow}>
                        <span style={s.metaLabel}>Type:</span>
                        <select style={s.metaSel} value={task.task_type} onChange={e => update(task._id, "task_type", e.target.value)}>
                          {["task","bug","feature","story"].map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                        </select>
                        <span style={s.metaLabel}>Priorité:</span>
                        <select style={s.metaSel} value={task.priority} onChange={e => update(task._id, "priority", e.target.value)}>
                          {["low","medium","high"].map(p => <option key={p} value={p}>{PRIORITY_FR[p]}</option>)}
                        </select>
                        <span style={s.metaLabel}>Points:</span>
                        <select style={s.metaSel} value={task.story_points || ""} onChange={e => update(task._id, "story_points", e.target.value ? Number(e.target.value) : null)}>
                          <option value="">—</option>
                          {POINTS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>

                      {/* Subtasks */}
                      <div style={s.subtasksSection}>
                        <div style={s.subtasksTitle}>Sous-tâches ({task.subtasks.length})</div>
                        {task.subtasks.map((sub, idx) => (
                          <div key={idx} style={s.subtaskRow}>
                            <span style={s.subtaskBullet}>-</span>
                            <input
                              style={s.subtaskInput}
                              value={sub}
                              onChange={e => updateSubtask(task._id, idx, e.target.value)}
                            />
                            <button style={s.delSubBtn} onClick={() => removeSubtask(task._id, idx)}>✕</button>
                          </div>
                        ))}
                        <button style={s.addSubBtn} onClick={() => addSubtask(task._id)}>+ Ajouter une sous-tâche</button>
                      </div>
                    </div>
                    <button style={s.removeBtn} onClick={() => setTasks(prev => prev.filter(t => t._id !== task._id))}>X</button>
                  </div>
                </div>
              ))}
            </div>

            {error && <div style={s.error}>{error}</div>}

            <div style={s.approveRow}>
              <span style={s.approveHint}>{selected.size} tâche{selected.size !== 1 ? "s" : ""} seront ajoutées à la partie <strong>{part.name}</strong></span>
              <button
                style={{ ...s.approveBtn, opacity: !selected.size || saving ? 0.6 : 1 }}
                onClick={handleApprove}
                disabled={!selected.size || saving}
              >
                {saving ? "Création en cours..." : `Créer ${selected.size} tâche${selected.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: "14px", width: "800px", maxWidth: "96vw", maxHeight: "93vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column" },
  header: { display: "flex", justifyContent: "space-between", padding: "1.5rem 1.5rem 1rem", borderBottom: "1px solid #f0f0f0" },
  partTag: { fontSize: "0.78rem", fontWeight: 700, color: "#4f46e5", background: "#ede9fe", padding: "0.2rem 0.6rem", borderRadius: "6px", display: "inline-block", marginBottom: "0.4rem" },
  title: { margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#1a202c" },
  sub: { margin: "0.25rem 0 0", color: "#718096", fontSize: "0.85rem" },
  closeBtn: { background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "#718096", alignSelf: "flex-start" },
  savedCdc: { margin: "0 1.5rem", padding: "0.75rem 1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.85rem", color: "#15803d" },
  savedIcon: { fontSize: "1.1rem" },
  savedHint: { color: "#a0aec0", marginLeft: "auto" },
  uploadForm: { padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" },
  dropZone: { border: "2px dashed #c7d2fe", borderRadius: "10px", padding: "2rem", textAlign: "center", cursor: "pointer", background: "#fafafe" },
  dropIcon: { fontSize: "2rem", marginBottom: "0.5rem" },
  dropText: { color: "#718096", fontSize: "0.9rem" },
  fileName: { fontWeight: 600, color: "#4f46e5" },
  fileHint: { color: "#a0aec0", fontSize: "0.8rem", marginTop: "0.25rem" },
  analyzeBtn: { background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "#fff", border: "none", padding: "0.85rem", borderRadius: "10px", fontWeight: 700, fontSize: "1rem", cursor: "pointer" },
  loadingNote: { textAlign: "center", color: "#a0aec0", fontSize: "0.82rem", margin: 0 },
  error: { background: "#fff5f5", border: "1px solid #fca5a5", color: "#c53030", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.875rem" },
  results: { padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" },
  summary: { background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "10px", padding: "1rem 1.25rem" },
  summaryTitle: { fontWeight: 700, color: "#0369a1", marginBottom: "0.4rem", fontSize: "0.875rem" },
  summaryText: { margin: 0, color: "#1e40af", fontSize: "0.875rem", lineHeight: 1.5 },
  tags: { display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.6rem" },
  tag: { background: "#e0f2fe", color: "#0369a1", fontSize: "0.72rem", padding: "0.2rem 0.6rem", borderRadius: "999px", fontWeight: 600 },
  reviewBar: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  reviewTitle: { fontWeight: 700, color: "#1a202c", display: "flex", alignItems: "center", gap: "0.5rem" },
  selCount: { background: "#ede9fe", color: "#4f46e5", fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "999px", fontWeight: 700 },
  reviewBtns: { display: "flex", gap: "0.4rem" },
  smBtn: { background: "#f7f8fc", border: "1px solid #e2e8f0", color: "#4a5568", padding: "0.35rem 0.65rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.78rem" },
  taskList: { display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "420px", overflowY: "auto" },
  taskCard: { borderRadius: "10px", padding: "1rem", border: "2px solid transparent" },
  taskSel: { border: "2px solid #c7d2fe", background: "#fafafe" },
  taskUnsel: { border: "2px solid #f0f0f0", background: "#fafafa", opacity: 0.55 },
  taskTop: { display: "flex", gap: "0.75rem", alignItems: "flex-start" },
  taskBody: { flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" },
  titleInput: { padding: "0.45rem 0.7rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.9rem", fontWeight: 600, width: "100%", boxSizing: "border-box" },
  descInput: { padding: "0.45rem 0.7rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.82rem", resize: "vertical", fontFamily: "inherit", width: "100%", boxSizing: "border-box", color: "#4a5568" },
  metaRow: { display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" },
  metaLabel: { fontSize: "0.75rem", color: "#718096", fontWeight: 600 },
  metaSel: { padding: "0.28rem 0.5rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.78rem", background: "#fff", cursor: "pointer" },
  subtasksSection: { background: "#f7f8fc", borderRadius: "8px", padding: "0.75rem" },
  subtasksTitle: { fontSize: "0.75rem", fontWeight: 700, color: "#4a5568", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.04em" },
  subtaskRow: { display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem" },
  subtaskBullet: { color: "#4f46e5", fontSize: "0.7rem", flexShrink: 0 },
  subtaskInput: { flex: 1, padding: "0.3rem 0.5rem", borderRadius: "5px", border: "1px solid #e2e8f0", fontSize: "0.8rem", fontFamily: "inherit" },
  delSubBtn: { background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: "0.7rem", padding: "0.1rem" },
  addSubBtn: { background: "none", border: "1px dashed #cbd5e0", color: "#718096", padding: "0.3rem 0.6rem", borderRadius: "5px", cursor: "pointer", fontSize: "0.75rem", marginTop: "0.25rem" },
  removeBtn: { background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", padding: "0.2rem", flexShrink: 0, opacity: 0.6 },
  approveRow: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f0f0f0", paddingTop: "1rem", gap: "1rem" },
  approveHint: { color: "#718096", fontSize: "0.875rem" },
  approveBtn: { background: "#059669", color: "#fff", border: "none", padding: "0.75rem 1.5rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem", whiteSpace: "nowrap" },
};

