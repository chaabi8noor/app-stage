import { useState } from "react";
import { api } from "../api/client";

const FIBONACCI = [1, 2, 3, 5, 8, 13];
const PRIORITY_FR = { low: "Faible", medium: "Moyen", high: "Élevé" };
const TYPE_FR = { task: "Tâche", bug: "Bug", feature: "Fonctionnalité", story: "Story" };

export default function ImportCdcModal({ projectId, interns, onClose, onDone }) {
  const [step, setStep] = useState(1); // 1=form, 2=review, 3=done
  const [partName, setPartName] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assignmentMode, setAssignmentMode] = useState("collaborative");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState(null); // {part_id, tasks}
  const [tasks, setTasks] = useState([]);

  async function handleImport(e) {
    e.preventDefault();
    if (!file) return setError("Veuillez sélectionner un fichier CDC.");
    if (!partName.trim()) return setError("Veuillez entrer un nom de partie.");
    setLoading(true);
    setError("");
    let createdPartId = null;
    try {
      // 1. Create part
      const part = await api.createPart(projectId, {
        name: partName,
        assignee_id: assigneeId ? Number(assigneeId) : null,
        assignment_mode: assignmentMode,
      });
      createdPartId = part.id;
      // 2. Analyze CDC for that part
      const result = await api.analyzePartCdc(projectId, part.id, file);
      setProposal({ part_id: part.id, part_name: part.name });
      setTasks((result.suggested_tasks || result.tasks || []).map((t, i) => ({ ...t, _id: i })));
      setStep(2);
    } catch (err) {
      // If analysis failed after creating the part, remove the orphan part
      if (createdPartId) {
        await api.deletePart(projectId, createdPartId).catch(() => {});
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    setLoading(true);
    try {
      await api.approveTasks(projectId, proposal.part_id, tasks);
      setStep(3);
      setTimeout(() => { onDone(); onClose(); }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function updateTask(idx, field, value) {
    setTasks(tasks.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }

  function updateSubtask(taskIdx, stIdx, value) {
    setTasks(tasks.map((t, i) => i === taskIdx
      ? { ...t, subtasks: t.subtasks.map((s, j) => j === stIdx ? { ...s, title: value } : s) }
      : t
    ));
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.title}>Importer un CDC comme nouvelle partie</div>
            <div style={s.sub}>
              {step === 1 && "Remplissez les informations de la partie et uploadez le CDC"}
              {step === 2 && `Vérifiez les tâches générées pour "${proposal?.part_name}"`}
              {step === 3 && "Partie et tâches créées avec succès !"}
            </div>
          </div>
          <button style={s.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Step indicators */}
        <div style={s.steps}>
          {["Informations", "Révision", "Terminé"].map((label, i) => (
            <div key={i} style={s.stepItem}>
              <div style={{ ...s.stepDot, background: step > i + 1 ? "#10b981" : step === i + 1 ? "#4f46e5" : "#e2e8f0", color: step >= i + 1 ? "#fff" : "#94a3b8" }}>
                {step > i + 1 ? "✓" : i + 1}
              </div>
              <span style={{ ...s.stepLabel, color: step === i + 1 ? "#4f46e5" : "#94a3b8" }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={s.body}>
          {/* Step 1 — Form */}
          {step === 1 && (
            <form onSubmit={handleImport} style={s.form}>
              <label style={s.label}>Nom de la partie *</label>
              <input style={s.input} placeholder="ex: Module Frontend, API REST, Base de données..." value={partName}
                onChange={e => setPartName(e.target.value)} required />

              <label style={s.label}>Assigner un stagiaire</label>
              <select style={s.input} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                <option value="">— Aucun pour l'instant</option>
                {interns.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>

              <label style={s.label}>Mode d'assignation</label>
              <div style={s.modeRow}>
                {[{ value: "collaborative", label: "Collaborative" }, { value: "individual", label: "Individuel" }].map(opt => (
                  <label key={opt.value} style={{ ...s.modeCard, ...(assignmentMode === opt.value ? s.modeCardActive : {}) }}>
                    <input type="radio" name="assignmentMode" value={opt.value} checked={assignmentMode === opt.value} onChange={e => setAssignmentMode(e.target.value)} />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              <label style={s.label}>Fichier CDC (PDF ou DOCX) *</label>
              <div style={s.fileZone} onClick={() => document.getElementById("cdc-file-input").click()}>
                {file
                  ? <><div style={s.fileName}>{file.name}</div><div style={s.fileSub}>{(file.size / 1024).toFixed(0)} Ko — cliquez pour changer</div></>
                  : <><div style={s.fileIcon}>+</div><div style={s.fileSub}>Cliquez pour sélectionner un PDF ou DOCX</div></>
                }
                <input id="cdc-file-input" type="file" accept=".pdf,.docx" style={{ display: "none" }}
                  onChange={e => setFile(e.target.files[0])} />
              </div>

              {error && <div style={s.error}>{error}</div>}

              <div style={s.footer}>
                <button type="button" style={s.btnSec} onClick={onClose}>Annuler</button>
                <button type="submit" style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
                  {loading ? "Analyse en cours..." : "Analyser le CDC"}
                </button>
              </div>
            </form>
          )}

          {/* Step 2 — Review */}
          {step === 2 && (
            <div>
              <div style={s.reviewInfo}>
                {tasks.length} tâche{tasks.length > 1 ? "s" : ""} générée{tasks.length > 1 ? "s" : ""} — modifiez si nécessaire avant d'approuver.
              </div>
              <div style={s.taskList}>
                {tasks.map((task, idx) => (
                  <div key={idx} style={s.taskCard}>
                    <input style={s.taskInput} value={task.title}
                      onChange={e => updateTask(idx, "title", e.target.value)} />
                    <textarea style={s.taskDesc} rows={2} value={task.description || ""}
                      onChange={e => updateTask(idx, "description", e.target.value)} />
                    <div style={s.taskMeta}>
                      <select style={s.miniSelect} value={task.task_type || "task"} onChange={e => updateTask(idx, "task_type", e.target.value)}>
                        {Object.entries(TYPE_FR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <select style={s.miniSelect} value={task.priority || "medium"} onChange={e => updateTask(idx, "priority", e.target.value)}>
                        {Object.entries(PRIORITY_FR).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <select style={s.miniSelect} value={task.story_points || ""} onChange={e => updateTask(idx, "story_points", e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Points</option>
                        {FIBONACCI.map(n => <option key={n} value={n}>{n} pt</option>)}
                      </select>
                    </div>
                    {task.subtasks?.length > 0 && (
                      <div style={s.subtaskList}>
                        {task.subtasks.map((st, si) => (
                          <input key={si} style={s.subtaskInput} value={st.title}
                            onChange={e => updateSubtask(idx, si, e.target.value)} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {error && <div style={s.error}>{error}</div>}
              <div style={s.footer}>
                <button style={s.btnSec} onClick={() => setStep(1)}>Retour</button>
                <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={handleApprove} disabled={loading}>
                  {loading ? "Création..." : `Approuver et créer (${tasks.length} tâches)`}
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Done */}
          {step === 3 && (
            <div style={s.doneBox}>
              <div style={s.doneCheck}>✓</div>
              <div style={s.doneTitle}>Partie créée avec succès !</div>
              <div style={s.doneSub}>{tasks.length} tâches ajoutées à la partie "{proposal?.part_name}"</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 },
  modal: { background: "#fff", borderRadius: "14px", width: "680px", maxWidth: "96vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "1.5rem 1.5rem 1rem", borderBottom: "1px solid #e2e8f0" },
  title: { fontWeight: 700, fontSize: "1.1rem", color: "#1a202c" },
  sub: { fontSize: "0.82rem", color: "#718096", marginTop: "0.2rem" },
  closeBtn: { background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "#94a3b8", lineHeight: 1 },
  steps: { display: "flex", gap: "0", padding: "1rem 1.5rem", borderBottom: "1px solid #f0f0f0" },
  stepItem: { display: "flex", alignItems: "center", gap: "0.4rem", flex: 1 },
  stepDot: { width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 },
  stepLabel: { fontSize: "0.78rem", fontWeight: 600 },
  body: { flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem" },
  form: { display: "flex", flexDirection: "column", gap: "0.5rem" },
  label: { fontSize: "0.8rem", fontWeight: 600, color: "#4a5568", marginTop: "0.4rem" },
  input: { padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.95rem", width: "100%", boxSizing: "border-box" },
  modeRow: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  modeCard: { flex: 1, minWidth: "160px", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 0.75rem", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: "0.85rem", color: "#4a5568" },
  modeCardActive: { borderColor: "#4f46e5", background: "#ede9fe", color: "#4f46e5", fontWeight: 600 },
  fileZone: { border: "2px dashed #c7d2fe", borderRadius: "10px", padding: "1.5rem", textAlign: "center", cursor: "pointer", background: "#f8f9ff" },
  fileIcon: { fontSize: "1.5rem", color: "#4f46e5", marginBottom: "0.4rem" },
  fileName: { fontWeight: 600, color: "#4f46e5", fontSize: "0.9rem" },
  fileSub: { fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.25rem" },
  error: { background: "#fff5f5", border: "1px solid #fca5a5", color: "#c53030", padding: "0.65rem 1rem", borderRadius: "8px", fontSize: "0.85rem" },
  footer: { display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1.25rem" },
  btn: { background: "#4f46e5", color: "#fff", border: "none", padding: "0.65rem 1.4rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "0.9rem" },
  btnSec: { background: "#f1f5f9", color: "#4a5568", border: "none", padding: "0.65rem 1.2rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer" },
  reviewInfo: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "0.75rem 1rem", fontSize: "0.85rem", color: "#1d4ed8", marginBottom: "1rem" },
  taskList: { display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "45vh", overflowY: "auto" },
  taskCard: { border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem" },
  taskInput: { fontWeight: 600, fontSize: "0.9rem", border: "none", borderBottom: "1px solid #e2e8f0", padding: "0.3rem 0", outline: "none", color: "#1a202c" },
  taskDesc: { fontSize: "0.82rem", color: "#4a5568", border: "1px solid #f0f0f0", borderRadius: "6px", padding: "0.4rem 0.6rem", resize: "none", fontFamily: "inherit" },
  taskMeta: { display: "flex", gap: "0.4rem", flexWrap: "wrap" },
  miniSelect: { padding: "0.25rem 0.5rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.78rem", color: "#4a5568" },
  subtaskList: { display: "flex", flexDirection: "column", gap: "0.25rem", paddingLeft: "0.75rem", borderLeft: "2px solid #e2e8f0" },
  subtaskInput: { fontSize: "0.8rem", border: "none", borderBottom: "1px dashed #e2e8f0", padding: "0.2rem 0", outline: "none", color: "#718096" },
  doneBox: { textAlign: "center", padding: "3rem 1rem" },
  doneCheck: { fontSize: "3rem", color: "#10b981", marginBottom: "0.75rem" },
  doneTitle: { fontSize: "1.2rem", fontWeight: 700, color: "#1a202c", marginBottom: "0.4rem" },
  doneSub: { color: "#718096", fontSize: "0.9rem" },
};
