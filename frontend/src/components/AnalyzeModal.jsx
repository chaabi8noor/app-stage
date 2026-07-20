import { useRef, useState } from "react";
import { api } from "../api/client";

const PRIORITY_OPTIONS = ["low", "medium", "high"];
const TYPE_OPTIONS = ["task", "bug", "feature", "story"];
const TYPE_ICONS = { task: "✓", bug: "🐛", feature: "✨", story: "📖" };
const POINTS = [1, 2, 3, 5, 8, 13];

export default function AnalyzeModal({ project, parts, onClose, onTasksCreated }) {
  const fileRef = useRef();
  const [selectedPart, setSelectedPart] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);        // AnalyzeResponse
  const [tasks, setTasks] = useState([]);             // editable suggestions
  const [selected, setSelected] = useState(new Set()); // which to approve
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState("");

  async function handleAnalyze(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      if (!selectedPart) {
        setError("Veuillez sélectionner une partie. Pour analyser le CDC global du projet, utilisez le bouton \"CDC Global\" depuis la page projet.");
        setLoading(false);
        return;
      }
      const res = await api.analyzePartCdc(project.id, selectedPart, file);
      setResult(res);
      const initialTasks = res.suggested_tasks.map((t, i) => ({ ...t, _id: i }));
      setTasks(initialTasks);
      setSelected(new Set(initialTasks.map(t => t._id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateTask(id, field, value) {
    setTasks(prev => prev.map(t => t._id === id ? { ...t, [field]: value } : t));
  }

  function removeTask(id) {
    setTasks(prev => prev.filter(t => t._id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function selectAll() { setSelected(new Set(tasks.map(t => t._id))); }
  function deselectAll() { setSelected(new Set()); }

  async function handleApprove() {
    const toCreate = tasks.filter(t => selected.has(t._id));
    if (toCreate.length === 0) return;
    setSaving(true);
    try {
      for (const task of toCreate) {
        // Find matching part by name
        const matchedPart = parts.find(p => p.name?.toLowerCase() === task.part_name?.toLowerCase())
          || parts.find(p => task.part_name && p.name?.toLowerCase().includes(task.part_name?.toLowerCase()))
          || (selectedPart ? parts.find(p => String(p.id) === String(selectedPart)) : null);
        if (matchedPart) {
          await api.addTaskToPart(project.id, matchedPart.id, {
            title: task.title,
            description: task.description,
            priority: task.priority,
            task_type: task.task_type,
            story_points: task.story_points || null,
            project_id: project.id,
          });
        } else {
          await api.createTask({
            title: task.title,
            description: task.description,
            priority: task.priority,
            task_type: task.task_type,
            story_points: task.story_points || null,
            project_id: project.id,
          });
        }
      }
      onTasksCreated(toCreate.length);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const priorityColor = (p) => ({ low: "#16a34a", medium: "#d97706", high: "#e53e3e" }[p] || "#718096");

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Génération de tâches par IA</h2>
            <p style={styles.subtitle}>Importez un cahier des charges — l'IA extraira les tâches pour validation</p>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Step 1: Upload */}
        {!result && (
          <form onSubmit={handleAnalyze} style={styles.uploadSection}>
            <div style={styles.step}>
              <div style={styles.stepNum}>1</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>Choisir la portée</div>
                <select style={styles.select} value={selectedPart} onChange={e => setSelectedPart(e.target.value)}>
                  <option value="">Global — pour tout le projet (tous les stagiaires)</option>
                  {parts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.assignee ? ` — ${p.assignee.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={styles.step}>
              <div style={styles.stepNum}>2</div>
              <div style={styles.stepContent}>
                <div style={styles.stepTitle}>Importer le document</div>
                <div
                  style={styles.dropZone}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const f = e.dataTransfer.files[0];
                    if (f) { fileRef.current.files = e.dataTransfer.files; setFileName(f.name); }
                  }}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.doc"
                    style={{ display: "none" }}
                    onChange={e => setFileName(e.target.files[0]?.name || "")}
                  />
                  {fileName ? (
                    <div>
                      <div style={styles.fileName}>{fileName}</div>
                      <div style={styles.fileHint}>Cliquer pour changer le fichier</div>
                    </div>
                  ) : (
                    <div>
                      <div style={styles.dropIcon}></div>
                      <div style={styles.dropText}>Déposer un PDF ou DOCX ici, ou cliquer pour parcourir</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button style={{ ...styles.analyzeBtn, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading || !fileName}>
              {loading ? (
                <span>🤖 Claude is reading the document<span style={styles.dots}>...</span></span>
              ) : (
                "Analyser avec l'IA"
              )}
            </button>

            {loading && (
              <div style={styles.loadingNote}>
                Cela peut prendre 10–30 secondes selon la taille du document
              </div>
            )}
          </form>
        )}

        {/* Step 2: Review results */}
        {result && (
          <div style={styles.resultsSection}>
            {/* Summary */}
            <div style={styles.summaryBox}>
              <div style={styles.summaryTitle}>Résumé du document</div>
              <p style={styles.summaryText}>{result.summary}</p>
              {result.parts_detected?.length > 0 && (
                <div style={styles.detectedTags}>
                  {result.parts_detected.map((p, i) => (
                    <span key={i} style={styles.detectedTag}>{p}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Controls */}
            <div style={styles.reviewHeader}>
              <div style={styles.reviewTitle}>
                {tasks.length} tâche{tasks.length !== 1 ? "s" : ""} suggérée{tasks.length !== 1 ? "s" : ""}
                <span style={styles.selectedCount}>{selected.size} sélectionnée{selected.size !== 1 ? "s" : ""}</span>
              </div>
              <div style={styles.reviewActions}>
                <button style={styles.smallBtn} onClick={selectAll}>Tout sélectionner</button>
                <button style={styles.smallBtn} onClick={deselectAll}>Tout désélectionner</button>
                <button style={styles.smallBtn} onClick={() => { setResult(null); setTasks([]); setFileName(""); }}>
                  ↩ Réimporter
                </button>
              </div>
            </div>

            {/* Task list */}
            <div style={styles.taskList}>
              {tasks.map(task => (
                <div key={task._id} style={{ ...styles.taskCard, ...(selected.has(task._id) ? styles.taskCardSelected : styles.taskCardUnselected) }}>
                  <div style={styles.taskCardHeader}>
                    <input
                      type="checkbox"
                      checked={selected.has(task._id)}
                      onChange={() => toggleSelect(task._id)}
                      style={{ cursor: "pointer", marginTop: "2px" }}
                    />
                    <div style={styles.taskCardBody}>
                      <input
                        style={styles.taskTitleInput}
                        value={task.title}
                        onChange={e => updateTask(task._id, "title", e.target.value)}
                      />
                      <textarea
                        style={styles.taskDescInput}
                        value={task.description}
                        rows={2}
                        onChange={e => updateTask(task._id, "description", e.target.value)}
                      />
                      <div style={styles.taskMeta}>
                        {/* Type */}
                        <select
                          style={{ ...styles.metaSelect, color: "#4f46e5" }}
                          value={task.task_type}
                          onChange={e => updateTask(task._id, "task_type", e.target.value)}
                        >
                          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
                        </select>
                        {/* Priority */}
                        <select
                          style={{ ...styles.metaSelect, color: priorityColor(task.priority) }}
                          value={task.priority}
                          onChange={e => updateTask(task._id, "priority", e.target.value)}
                        >
                          {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
                        </select>
                        {/* Story points */}
                        <select
                          style={styles.metaSelect}
                          value={task.story_points || ""}
                          onChange={e => updateTask(task._id, "story_points", e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">— pts</option>
                          {POINTS.map(p => <option key={p} value={p}>{p} pts</option>)}
                        </select>
                        {/* Part assignment */}
                        <select
                          style={{ ...styles.metaSelect, flex: 1 }}
                          value={task.part_name || ""}
                          onChange={e => updateTask(task._id, "part_name", e.target.value || null)}
                        >
                          <option value="">Aucune partie assignée</option>
                          {parts.map(p => <option key={p.id} value={p.name}>{p.name}{p.assignee ? ` (${p.assignee.name})` : ""}</option>)}
                        </select>
                      </div>
                    </div>
                    <button style={styles.removeBtn} onClick={() => removeTask(task._id)} title="Remove">✕</button>
                  </div>
                </div>
              ))}
            </div>

            {error && <div style={styles.error}>{error}</div>}

            {/* Approve button */}
            <div style={styles.approveRow}>
              <span style={styles.approveHint}>
                {selected.size} tâche{selected.size !== 1 ? "s" : ""} seront ajoutées à <strong>{project.name}</strong>
              </span>
              <button
                style={{ ...styles.approveBtn, opacity: selected.size === 0 || saving ? 0.6 : 1 }}
                onClick={handleApprove}
                disabled={selected.size === 0 || saving}
              >
                {saving ? "Ajout en cours..." : `Ajouter ${selected.size} tâche${selected.size !== 1 ? "s" : ""} au projet`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: "14px", width: "760px", maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column" },

  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "1.5rem 1.5rem 1rem", borderBottom: "1px solid #f0f0f0" },
  title: { margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#1a202c" },
  subtitle: { margin: "0.25rem 0 0", color: "#718096", fontSize: "0.875rem" },
  closeBtn: { background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "#718096" },

  uploadSection: { padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" },
  step: { display: "flex", gap: "1rem", alignItems: "flex-start" },
  stepNum: { width: "28px", height: "28px", borderRadius: "50%", background: "#4f46e5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem", flexShrink: 0, marginTop: "2px" },
  stepContent: { flex: 1 },
  stepTitle: { fontWeight: 600, color: "#1a202c", marginBottom: "0.5rem", fontSize: "0.95rem" },
  select: { width: "100%", padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.9rem", background: "#fff" },
  dropZone: { border: "2px dashed #c7d2fe", borderRadius: "10px", padding: "2rem", textAlign: "center", cursor: "pointer", background: "#fafafe", transition: "border-color 0.2s" },
  dropIcon: { fontSize: "2rem", marginBottom: "0.5rem" },
  dropText: { color: "#718096", fontSize: "0.9rem" },
  fileName: { fontWeight: 600, color: "#4f46e5", fontSize: "0.95rem" },
  fileHint: { color: "#a0aec0", fontSize: "0.8rem", marginTop: "0.25rem" },
  analyzeBtn: { background: "linear-gradient(135deg, #4f46e5, #7c3aed)", color: "#fff", border: "none", padding: "0.85rem 2rem", borderRadius: "10px", fontWeight: 700, fontSize: "1rem", cursor: "pointer" },
  loadingNote: { textAlign: "center", color: "#a0aec0", fontSize: "0.82rem" },
  dots: { display: "inline-block", animation: "none" },
  error: { background: "#fff5f5", border: "1px solid #fca5a5", color: "#c53030", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.875rem" },

  resultsSection: { padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" },
  summaryBox: { background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "10px", padding: "1rem 1.25rem" },
  summaryTitle: { fontWeight: 700, color: "#0369a1", marginBottom: "0.4rem", fontSize: "0.875rem" },
  summaryText: { margin: 0, color: "#1e40af", fontSize: "0.875rem", lineHeight: 1.5 },
  detectedTags: { display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.6rem" },
  detectedTag: { background: "#e0f2fe", color: "#0369a1", fontSize: "0.72rem", padding: "0.2rem 0.6rem", borderRadius: "999px", fontWeight: 600 },

  reviewHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  reviewTitle: { fontWeight: 700, color: "#1a202c", display: "flex", alignItems: "center", gap: "0.5rem" },
  selectedCount: { background: "#ede9fe", color: "#4f46e5", fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "999px", fontWeight: 700 },
  reviewActions: { display: "flex", gap: "0.4rem" },
  smallBtn: { background: "#f7f8fc", border: "1px solid #e2e8f0", color: "#4a5568", padding: "0.35rem 0.75rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem" },

  taskList: { display: "flex", flexDirection: "column", gap: "0.6rem", maxHeight: "400px", overflowY: "auto" },
  taskCard: { borderRadius: "8px", padding: "0.85rem", border: "2px solid transparent" },
  taskCardSelected: { border: "2px solid #c7d2fe", background: "#fafafe" },
  taskCardUnselected: { border: "2px solid #f0f0f0", background: "#fafafa", opacity: 0.6 },
  taskCardHeader: { display: "flex", gap: "0.75rem", alignItems: "flex-start" },
  taskCardBody: { flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" },
  taskTitleInput: { padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.9rem", fontWeight: 600, width: "100%", boxSizing: "border-box" },
  taskDescInput: { padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.82rem", resize: "vertical", fontFamily: "inherit", width: "100%", boxSizing: "border-box", color: "#4a5568" },
  taskMeta: { display: "flex", gap: "0.4rem", flexWrap: "wrap" },
  metaSelect: { padding: "0.3rem 0.5rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.78rem", background: "#fff", cursor: "pointer" },
  removeBtn: { background: "none", border: "none", color: "#e53e3e", cursor: "pointer", fontSize: "0.85rem", padding: "0.2rem", flexShrink: 0 },

  approveRow: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f0f0f0", paddingTop: "1rem", gap: "1rem" },
  approveHint: { color: "#718096", fontSize: "0.875rem" },
  approveBtn: { background: "#059669", color: "#fff", border: "none", padding: "0.75rem 1.5rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem", whiteSpace: "nowrap" },
};

