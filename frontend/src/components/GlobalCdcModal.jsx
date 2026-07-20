import { useRef, useState } from "react";
import { api } from "../api/client";

const PRIORITY_FR = { low: "Faible", medium: "Moyenne", high: "Haute" };
const TYPE_ICONS = { task: "✓", bug: "🐛", feature: "✨", story: "📖" };

export default function GlobalCdcModal({ project, allInterns, onClose, onSuccess }) {
  const fileRef = useRef();
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [parts, setParts] = useState([]);
  const [expandedPart, setExpandedPart] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleAnalyze(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.analyzeGlobalCdc(project.id, file);
      setResult(res);
      const init = res.proposed_parts.map((p, i) => ({
        ...p,
        _id: i,
        assignment_mode: p.assignment_mode || "collaborative",
        intern_ids: [],
        tasks: p.tasks.map((t, j) => ({ ...t, _id: j, selected: true })),
        selected: true,
      }));
      setParts(init);
      setExpandedPart(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updatePart(id, field, value) {
    setParts(prev => prev.map(p => p._id === id ? { ...p, [field]: value } : p));
  }

  function updateTask(partId, taskId, field, value) {
    setParts(prev => prev.map(p => p._id === partId
      ? { ...p, tasks: p.tasks.map(t => t._id === taskId ? { ...t, [field]: value } : t) }
      : p
    ));
  }

  function toggleTask(partId, taskId) {
    setParts(prev => prev.map(p => p._id === partId
      ? { ...p, tasks: p.tasks.map(t => t._id === taskId ? { ...t, selected: !t.selected } : t) }
      : p
    ));
  }

  function updateSubtask(partId, taskId, idx, value) {
    setParts(prev => prev.map(p => p._id === partId
      ? { ...p, tasks: p.tasks.map(t => t._id === taskId
          ? { ...t, subtasks: t.subtasks.map((s, i) => i === idx ? value : s) }
          : t) }
      : p
    ));
  }

  async function handleCreate() {
    const selectedParts = parts.filter(p => p.selected).map(p => ({
      name: p.name,
      description: p.description,
      intern_ids: p.intern_ids || [],
      assignment_mode: p.assignment_mode || "collaborative",
      tasks: p.tasks.filter(t => t.selected).map(t => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        task_type: t.task_type,
        story_points: t.story_points || null,
        subtasks: (t.subtasks || []).filter(s => s.trim()),
      })),
    }));

    if (!selectedParts.length) return;
    setSaving(true);
    try {
      const res = await api.createFromProposal(project.id, selectedParts);
      onSuccess(res.created_parts, res.created_tasks, res.created_subtasks);
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const totalTasks = parts.reduce((s, p) => s + p.tasks.filter(t => t.selected).length, 0);
  const totalParts = parts.filter(p => p.selected).length;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.header}>
          <div>
            <h2 style={s.title}>📊 Analyse CDC Global</h2>
            <p style={s.sub}>L'IA propose la structure complète : parties, stagiaires nécessaires et tâches</p>
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Upload */}
        {!result && (
          <form onSubmit={handleAnalyze} style={s.uploadForm}>
            <div style={s.infoBox}>
              <strong>Mode : CDC Global</strong> — Vous n'avez pas de CDC par partie. Importez le cahier des charges global du projet et l'IA décomposera automatiquement le projet en parties et proposera les tâches pour chaque partie.
            </div>
            <div
              style={s.dropZone}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { fileRef.current.files = e.dataTransfer.files; setFileName(f.name); } }}
            >
              <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" style={{ display: "none" }} onChange={e => setFileName(e.target.files[0]?.name || "")} />
              {fileName
                ? <div><div style={s.fileName}>{fileName}</div><div style={s.fileHint}>Cliquer pour changer</div></div>
                : <div><div style={s.dropIcon}></div><div style={s.dropText}>CDC Global — PDF ou DOCX</div></div>
              }
            </div>
            {error && <div style={s.error}>{error}</div>}
            <button style={{ ...s.analyzeBtn, opacity: loading || !fileName ? 0.65 : 1 }} type="submit" disabled={loading || !fileName}>
              {loading ? "Analyse en cours..." : "Analyser le CDC Global"}
            </button>
            {loading && <p style={s.loadingNote}>Analyse complète du projet — peut prendre 20–45 secondes</p>}
          </form>
        )}

        {/* Proposal review */}
        {result && (
          <div style={s.proposal}>
            <div style={s.summary}>
              <div style={s.summaryTitle}>Résumé du projet</div>
              <p style={s.summaryText}>{result.summary}</p>
            </div>

            {/* AI Conflict warnings */}
            {result.stack_conflicts?.length > 0 && (
              <div style={s.conflictBox}>
                <div style={s.conflictTitle}>⚠️ Conflits détectés entre l'IA et le CDC</div>
                {result.stack_conflicts.map((c, i) => (
                  <div key={i} style={s.conflictRow}>
                    <span style={s.conflictBad}>L'IA a suggéré : <strong>{c.ai_suggested}</strong></span>
                    <span style={s.conflictArrow}>→</span>
                    <span style={s.conflictGood}>CDC mentionne : <strong>{c.cdc_specifies.join(", ")}</strong></span>
                    <span style={s.conflictCat}>[{c.category}]</span>
                  </div>
                ))}
                <p style={s.conflictNote}>Vérifiez ces choix avant de valider — le CDC fait autorité.</p>
              </div>
            )}

            {/* Detected stack from CDC */}
            {result.detected_stack?.length > 0 && (
              <div style={s.detectedBox}>
                <div style={s.detectedTitle}>🔍 Technologies détectées dans le CDC</div>
                <div style={s.detectedChips}>
                  {result.detected_stack.map(t => (
                    <span key={t.name} style={{ ...s.detectedChip, ...(DETECT_COLORS[t.category] || DETECT_COLORS.Autre) }}>
                      {t.name} <span style={s.detectedSrc}>CDC</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={s.proposalStats}>
              <span style={s.stat}><strong>{parts.length}</strong> parties proposées</span>
              <span style={s.stat}><strong>{parts.reduce((s,p) => s + p.tasks.length, 0)}</strong> tâches au total</span>
              <span style={s.stat}><strong>{parts.reduce((s,p) => s + (p.recommended_interns||1), 0)}</strong> stagiaires recommandés</span>
              <span style={s.statSel}>{totalParts} parties · {totalTasks} tâches sélectionnées</span>
              <button style={s.smBtn} onClick={() => { setResult(null); setFileName(""); }}>↩ Réimporter</button>
            </div>

            <div style={s.partsList}>
              {parts.map((part, pi) => (
                <div key={part._id} style={{ ...s.partCard, ...(part.selected ? {} : s.partUnsel) }}>
                  {/* Part header */}
                  <div style={s.partHeader}>
                    <input
                      type="checkbox"
                      checked={part.selected}
                      onChange={() => updatePart(part._id, "selected", !part.selected)}
                      style={{ cursor: "pointer", flexShrink: 0, marginTop: "2px" }}
                    />
                    <div style={s.partInfo}>
                      <input style={s.partNameInput} value={part.name} onChange={e => updatePart(part._id, "name", e.target.value)} />
                      <input style={s.partDescInput} value={part.description} onChange={e => updatePart(part._id, "description", e.target.value)} />
                      <div style={s.partMeta}>
                        {part.skills_required?.map((sk, i) => <span key={i} style={s.skill}>{sk}</span>)}
                        <span style={s.internReco}>
                          👥 {part.recommended_interns} stagiaire{part.recommended_interns > 1 ? "s" : ""} recommandé{part.recommended_interns > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div style={s.partAssign}>
                      <label style={s.assignLabel}>
                        Stagiaires ({part.recommended_interns} recommandé{part.recommended_interns > 1 ? "s" : ""}) :
                      </label>
                      <div style={s.internCheckList}>
                        {allInterns.map(u => {
                          const checked = (part.intern_ids || []).includes(u.id);
                          return (
                            <label key={u.id} style={{ ...s.internCheckRow, background: checked ? "#f0f0ff" : "#fafafa", borderColor: checked ? "#4f46e5" : "#e2e8f0" }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const ids = part.intern_ids || [];
                                  updatePart(part._id, "intern_ids", checked ? ids.filter(i => i !== u.id) : [...ids, u.id]);
                                }}
                                style={{ accentColor: "#4f46e5" }}
                              />
                              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#1a202c" }}>{u.name}</span>
                            </label>
                          );
                        })}
                      </div>
                      {(part.intern_ids || []).length > 1 && (
                        <p style={s.collab}>✓ {part.intern_ids.length} stagiaires — tâches distribuées automatiquement</p>
                      )}

                      <label style={s.assignLabel}>Mode d'assignation</label>
                      <select
                        style={s.modeSelect}
                        value={part.assignment_mode || "collaborative"}
                        onChange={e => updatePart(part._id, "assignment_mode", e.target.value)}
                      >
                        <option value="collaborative">Collaborative</option>
                        <option value="individual">Individuel</option>
                      </select>
                    </div>
                    <button
                      style={s.expandBtn}
                      onClick={() => setExpandedPart(expandedPart === part._id ? null : part._id)}
                    >
                      {expandedPart === part._id ? "▲" : "▼"} {part.tasks.filter(t => t.selected).length}/{part.tasks.length} tâches
                    </button>
                  </div>

                  {/* Tasks (expandable) */}
                  {expandedPart === part._id && (
                    <div style={s.taskList}>
                      {part.tasks.map(task => (
                        <div key={task._id} style={{ ...s.taskCard, ...(task.selected ? s.taskSel : s.taskUnsel) }}>
                          <div style={s.taskRow}>
                            <input type="checkbox" checked={task.selected} onChange={() => toggleTask(part._id, task._id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                            <div style={s.taskBody}>
                              <input style={s.titleInput} value={task.title} onChange={e => updateTask(part._id, task._id, "title", e.target.value)} />
                              <p style={s.taskDesc}>{task.description}</p>
                              <div style={s.taskMeta}>
                                <span style={{ ...s.typeChip }}>{TYPE_ICONS[task.task_type]} {task.task_type}</span>
                                <span style={{ ...s.prioChip, ...prioColor(task.priority) }}>{PRIORITY_FR[task.priority]}</span>
                                {task.story_points && <span style={s.ptsChip}>{task.story_points} pts</span>}
                              </div>
                              {task.subtasks?.length > 0 && (
                                <div style={s.subtasks}>
                                  {task.subtasks.map((sub, idx) => (
                                    <div key={idx} style={s.subtaskRow}>
                                      <span style={s.bullet}>-</span>
                                      <input style={s.subtaskInput} value={sub} onChange={e => updateSubtask(part._id, task._id, idx, e.target.value)} />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && <div style={s.error}>{error}</div>}

            <div style={s.createRow}>
              <div style={s.createInfo}>
                <span>Créer <strong>{totalParts} partie{totalParts !== 1 ? "s" : ""}</strong> avec <strong>{totalTasks} tâche{totalTasks !== 1 ? "s" : ""}</strong> dans le projet <strong>{project.name}</strong></span>
              </div>
              <button
                style={{ ...s.createBtn, opacity: !totalParts || saving ? 0.6 : 1 }}
                onClick={handleCreate}
                disabled={!totalParts || saving}
              >
                {saving ? "Création en cours..." : `Créer tout (${totalParts} parties · ${totalTasks} tâches)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function prioColor(p) {
  return { low: { background: "#d1fae5", color: "#065f46" }, medium: { background: "#fef3c7", color: "#92400e" }, high: { background: "#fee2e2", color: "#991b1b" } }[p] || {};
}

const DETECT_COLORS = {
  Frontend: { background: "#ede9fe", color: "#4f46e5" },
  Backend: { background: "#d1fae5", color: "#065f46" },
  Database: { background: "#fef3c7", color: "#92400e" },
  Mobile: { background: "#fee2e2", color: "#991b1b" },
  AI: { background: "#e0f2fe", color: "#0369a1" },
  Autre: { background: "#f1f5f9", color: "#475569" },
};

const s = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: "14px", width: "900px", maxWidth: "97vw", maxHeight: "94vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.25)" },
  header: { display: "flex", justifyContent: "space-between", padding: "1.5rem 1.5rem 1rem", borderBottom: "1px solid #f0f0f0" },
  title: { margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#1a202c" },
  sub: { margin: "0.25rem 0 0", color: "#718096", fontSize: "0.85rem" },
  closeBtn: { background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "#718096" },
  uploadForm: { padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" },
  infoBox: { background: "#ede9fe", border: "1px solid #c4b5fd", borderRadius: "8px", padding: "0.85rem 1rem", fontSize: "0.875rem", color: "#4c1d95", lineHeight: 1.5 },
  dropZone: { border: "2px dashed #c7d2fe", borderRadius: "10px", padding: "2.5rem", textAlign: "center", cursor: "pointer", background: "#fafafe" },
  dropIcon: { fontSize: "2.5rem", marginBottom: "0.5rem" },
  dropText: { color: "#718096", fontSize: "0.95rem" },
  fileName: { fontWeight: 600, color: "#4f46e5", fontSize: "1rem" },
  fileHint: { color: "#a0aec0", fontSize: "0.8rem", marginTop: "0.25rem" },
  analyzeBtn: { background: "linear-gradient(135deg,#4f46e5,#7c3aed)", color: "#fff", border: "none", padding: "0.9rem", borderRadius: "10px", fontWeight: 700, fontSize: "1rem", cursor: "pointer" },
  loadingNote: { textAlign: "center", color: "#a0aec0", fontSize: "0.82rem", margin: 0 },
  error: { background: "#fff5f5", border: "1px solid #fca5a5", color: "#c53030", padding: "0.75rem 1rem", borderRadius: "8px", fontSize: "0.875rem" },
  proposal: { padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" },
  summary: { background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "10px", padding: "1rem 1.25rem" },
  summaryTitle: { fontWeight: 700, color: "#0369a1", marginBottom: "0.4rem", fontSize: "0.875rem" },
  summaryText: { margin: 0, color: "#1e40af", fontSize: "0.875rem", lineHeight: 1.5 },
  proposalStats: { display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" },
  stat: { fontSize: "0.875rem", color: "#4a5568" },
  statSel: { fontSize: "0.875rem", color: "#4f46e5", fontWeight: 700, background: "#ede9fe", padding: "0.2rem 0.6rem", borderRadius: "6px", marginLeft: "auto" },
  smBtn: { background: "#f7f8fc", border: "1px solid #e2e8f0", color: "#4a5568", padding: "0.35rem 0.65rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.78rem" },
  partsList: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  partCard: { background: "#fff", border: "2px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" },
  partUnsel: { opacity: 0.5 },
  partHeader: { display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "1rem", background: "#f7f8fc" },
  partInfo: { flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" },
  partNameInput: { padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.95rem", fontWeight: 700, width: "100%", boxSizing: "border-box" },
  partDescInput: { padding: "0.35rem 0.6rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.82rem", width: "100%", boxSizing: "border-box", color: "#718096" },
  partMeta: { display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" },
  skill: { background: "#e0f2fe", color: "#0369a1", fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: "999px", fontWeight: 600 },
  internReco: { fontSize: "0.78rem", color: "#059669", fontWeight: 600, background: "#d1fae5", padding: "0.15rem 0.5rem", borderRadius: "999px" },
  partAssign: { display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: "200px" },
  assignLabel: { fontSize: "0.72rem", fontWeight: 600, color: "#718096" },
  internCheckList: { display: "flex", flexDirection: "column", gap: "0.3rem", maxHeight: "130px", overflowY: "auto" },
  internCheckRow: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0.5rem", borderRadius: "6px", border: "1.5px solid #e2e8f0", cursor: "pointer" },
  collab: { fontSize: "0.72rem", color: "#059669", background: "#d1fae5", padding: "0.25rem 0.5rem", borderRadius: "5px", margin: 0 },
  modeSelect: { width: "100%", padding: "0.55rem 0.7rem", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "0.8rem", background: "#fff" },
  expandBtn: { background: "#ede9fe", border: "none", color: "#4f46e5", padding: "0.4rem 0.75rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap", alignSelf: "center" },
  taskList: { padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "350px", overflowY: "auto" },
  taskCard: { borderRadius: "8px", padding: "0.75rem", border: "2px solid transparent" },
  taskSel: { border: "2px solid #c7d2fe", background: "#fafafe" },
  taskUnsel: { border: "2px solid #f0f0f0", background: "#f9f9f9", opacity: 0.5 },
  taskRow: { display: "flex", gap: "0.65rem", alignItems: "flex-start" },
  taskBody: { flex: 1 },
  titleInput: { padding: "0.35rem 0.6rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.875rem", fontWeight: 600, width: "100%", boxSizing: "border-box", marginBottom: "0.3rem" },
  taskDesc: { margin: "0 0 0.4rem", fontSize: "0.8rem", color: "#718096", lineHeight: 1.4 },
  taskMeta: { display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.4rem" },
  typeChip: { fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: "999px", background: "#ede9fe", color: "#4f46e5", fontWeight: 600 },
  prioChip: { fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: "999px", fontWeight: 600 },
  ptsChip: { fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: "999px", background: "#e2e8f0", color: "#4a5568", fontWeight: 600 },
  subtasks: { background: "#f0f4f8", borderRadius: "6px", padding: "0.5rem 0.75rem" },
  subtaskRow: { display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.25rem" },
  bullet: { color: "#4f46e5", fontSize: "0.68rem", flexShrink: 0 },
  subtaskInput: { flex: 1, padding: "0.25rem 0.4rem", borderRadius: "4px", border: "1px solid #e2e8f0", fontSize: "0.78rem", fontFamily: "inherit" },
  createRow: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f0f0f0", paddingTop: "1rem", gap: "1rem" },
  createInfo: { fontSize: "0.875rem", color: "#4a5568" },
  createBtn: { background: "#059669", color: "#fff", border: "none", padding: "0.8rem 1.5rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem", whiteSpace: "nowrap" },

  // Conflict & detected stack styles
  conflictBox: { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "10px", padding: "0.85rem 1rem", marginBottom: "0.85rem" },
  conflictTitle: { fontWeight: 700, color: "#c2410c", fontSize: "0.88rem", marginBottom: "0.5rem" },
  conflictRow: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", marginBottom: "0.3rem", flexWrap: "wrap" },
  conflictBad: { color: "#dc2626" },
  conflictArrow: { color: "#9ca3af" },
  conflictGood: { color: "#065f46" },
  conflictCat: { fontSize: "0.72rem", color: "#9ca3af", background: "#f3f4f6", borderRadius: "999px", padding: "0.1rem 0.4rem" },
  conflictNote: { fontSize: "0.75rem", color: "#9a3412", margin: "0.4rem 0 0", fontStyle: "italic" },

  detectedBox: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "0.75rem 1rem", marginBottom: "0.85rem" },
  detectedTitle: { fontWeight: 700, color: "#065f46", fontSize: "0.85rem", marginBottom: "0.5rem" },
  detectedChips: { display: "flex", gap: "0.4rem", flexWrap: "wrap" },
  detectedChip: { display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", fontWeight: 600, padding: "0.2rem 0.6rem", borderRadius: "999px" },
  detectedSrc: { fontSize: "0.62rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em" },
};

