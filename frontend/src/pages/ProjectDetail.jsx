import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, clearCache, resolveApiBaseUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TaskModal from "../components/TaskModal";
import PartCdcModal from "../components/PartCdcModal";
import GlobalCdcModal from "../components/GlobalCdcModal";
import ImportCdcModal from "../components/ImportCdcModal";

const TASK_TYPES = ["task", "bug", "feature", "story"];
const TYPE_ICONS = { task: "T", bug: "B", feature: "F", story: "S" };
const TYPE_FR = { task: "Tâche", bug: "Bug", feature: "Fonctionnalité", story: "Story" };
const EMPTY_PART = { name: "", description: "", intern_ids: [], assignment_mode: "collaborative" };
const EMPTY_TASK = { title: "", description: "", priority: "medium", task_type: "task", deadline: "", start_date: "" };

export default function ProjectDetail() {
  const { id } = useParams();
  const { isAdmin, user: currentUser } = useAuth();
  const [project, setProject] = useState(null);
  const [parts, setParts] = useState([]);
  const [unassignedTasks, setUnassignedTasks] = useState([]);
  const [allInterns, setAllInterns] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [internFilter, setInternFilter] = useState(null);
  const [showGlobalCdc, setShowGlobalCdc] = useState(false);
  const [showImportCdc, setShowImportCdc] = useState(false);
  const [resources, setResources] = useState([]);
  const [showResources, setShowResources] = useState(false);
  const [resourceTab, setResourceTab] = useState("file"); // "file" | "link" | "note"
  const [resForm, setResForm] = useState({ name: "", url: "", note_text: "" });
  const [resFile, setResFile] = useState(null);
  const [archDraft, setArchDraft] = useState({ architecture: "", tech_stack: "", architecture_notes: "" });
  const [archSaving, setArchSaving] = useState(false);
  const [partCdcModal, setPartCdcModal] = useState(null); // part object
  const [expandedCdc, setExpandedCdc] = useState(null); // part_id
  const [collapsedParts, setCollapsedParts] = useState(new Set());
  const [instanceOwnerMap, setInstanceOwnerMap] = useState({}); // instance_id → intern user object
  function togglePart(partId) {
    setCollapsedParts(prev => {
      const next = new Set(prev);
      next.has(partId) ? next.delete(partId) : next.add(partId);
      return next;
    });
  }
  const [successMsg, setSuccessMsg] = useState("");

  // Part form (create or edit)
  const [partModal, setPartModal] = useState(null); // null | "create" | part object (edit)
  const [partForm, setPartForm] = useState(EMPTY_PART);

  // Task form per part
  const [activeTaskForm, setActiveTaskForm] = useState(null);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK);

  // Individual mode instances view
  const [instancesModal, setInstancesModal] = useState(null); // null | { part, instances }
  async function openInstances(part) {
    const instances = await api.getPartInstances(id, part.id);
    setInstancesModal({ part, instances });
  }

  async function load() {
    const [projs, p, allTasks] = await Promise.all([
      api.getProjects(),
      api.getParts(id),
      api.getTasks(id),
    ]);
    const proj = projs.find(x => x.id === Number(id));
    setProject(proj);
    if (proj) {
      // Parse stored tech_stack (JSON string) → flat [{name, category}]
      let parsedStack = [];
      if (proj.tech_stack) {
        try {
          const parsed = JSON.parse(proj.tech_stack);
          if (Array.isArray(parsed)) {
            for (const entry of parsed) {
              if (entry.technologies) {
                // Nested format from old suggest-architecture
                for (const t of entry.technologies) parsedStack.push({ name: t.name || t, category: entry.category || "Autre" });
              } else if (entry.name) {
                parsedStack.push({ name: entry.name, category: entry.category || "Autre" });
              }
            }
          } else if (typeof parsed === "string") {
            // Old plain-string format: "React, FastAPI"
            parsedStack = parsed.split(",").map(s => s.trim()).filter(Boolean).map(name => ({ name, category: "Autre" }));
          }
        } catch {
          // Fallback: raw comma string stored without JSON wrapping
          parsedStack = proj.tech_stack.split(",").map(s => s.trim()).filter(Boolean).map(name => ({ name, category: "Autre" }));
        }
      }
      setArchDraft({
        architecture: proj.architecture || "",
        tech_stack: parsedStack,
        architecture_notes: proj.architecture_notes || "",
      });
    }
    setParts(p);
    // Build instance_id → intern map for individual-mode parts (task owner badges)
    const individualParts = p.filter(pt => pt.assignment_mode === "individual");
    if (individualParts.length > 0) {
      const instanceEntries = await Promise.all(
        individualParts.map(pt => api.getPartInstances(id, pt.id).catch(() => []))
      );
      const ownerMap = {};
      instanceEntries.flat().forEach(inst => {
        ownerMap[inst.id] = inst.intern;
      });
      setInstanceOwnerMap(ownerMap);
    } else {
      setInstanceOwnerMap({});
    }
    // Only initialise collapsed state on first load (when set is empty)
    // so that status changes don't collapse parts the user has open
    setCollapsedParts(prev => {
      if (prev.size > 0) return prev;
      return new Set(p.map(pt => pt.id));
    });
    const partTaskIds = new Set(p.flatMap(pt => pt.tasks.map(t => t.id)));
    setUnassignedTasks(allTasks.filter(t => !partTaskIds.has(t.id)));
    const resData = await api.getResources(id).catch(() => []);
    setResources(resData);
    if (isAdmin) {
      const users = await api.getUsers();
      setAllInterns(users.filter(u => u.role === "intern"));
    }
  }

  useEffect(() => { load().catch(console.error); }, [id]);

  function openCreatePart() {
    setPartForm(EMPTY_PART);
    setPartModal("create");
  }

  function openEditPart(part) {
setPartForm({ 
  name: part.name, 
  description: part.description || "", 
  intern_ids: part.interns?.map(u => u.id) || [], 
  assignment_mode: part.assignment_mode || "collaborative" 
});
    setPartModal(part);
  }

  function closePartModal() {
    setPartModal(null);
    setPartForm(EMPTY_PART);
  }

  async function handleSubmitPart(e) {
    e.preventDefault();
    const data = {
      name: partForm.name,
      description: partForm.description || null,
      intern_ids: partForm.intern_ids,
      assignee_id: partForm.intern_ids[0] || null,
      assignment_mode: partForm.assignment_mode,
    };
    try {
      if (partModal === "create") {
        await api.createPart(id, data);
      } else {
        await api.updatePart(id, partModal.id, data);
      }
      closePartModal();
      clearCache();
      await load();
    } catch (err) {
      alert(err.message || "Erreur lors de la sauvegarde de la partie.");
    }
  }

  async function handleAssignmentModeChange(nextMode) {
    setPartForm(f => ({ ...f, assignment_mode: nextMode }));
    if (partModal === "create") return;

    try {
      const currentForm = { ...partForm, assignment_mode: nextMode };
      await api.updatePart(id, partModal.id, {
        name: currentForm.name,
        description: currentForm.description || null,
        intern_ids: currentForm.intern_ids,
        assignee_id: currentForm.intern_ids[0] || null,
        assignment_mode: nextMode,
      });
      clearCache();
      await load();
    } catch (err) {
      alert(err.message || "Erreur lors de la sauvegarde du mode d'assignation.");
    }
  }

  async function handleAddResource(e) {
    e.preventDefault();
    if (resourceTab === "file" && resFile) {
      await api.uploadResource(id, resFile);
    } else if (resourceTab === "link") {
      await api.addResourceLink(id, resForm.name, resForm.url);
    } else if (resourceTab === "note") {
      await api.addResourceNote(id, resForm.name, resForm.note_text);
    }
    setResForm({ name: "", url: "", note_text: "" });
    setResFile(null);
    const res = await api.getResources(id);
    setResources(res);
  }

  async function handleDeleteResource(resourceId) {
    await api.deleteResource(id, resourceId);
    setResources(r => r.filter(x => x.id !== resourceId));
  }

  async function handleSaveArchitecture() {
    setArchSaving(true);
    try {
      await api.saveArchitecture(id, {
        architecture: archDraft.architecture,
        tech_stack: archDraft.tech_stack, // array [{name, category}]
        architecture_notes: archDraft.architecture_notes,
      });
      setProject(p => ({ ...p, ...archDraft }));
    } catch {
      alert("Erreur lors de la sauvegarde.");
    } finally {
      setArchSaving(false);
    }
  }

  function toggleInternId(internId) {
    setPartForm(f => ({
      ...f,
      intern_ids: f.intern_ids.includes(internId)
        ? f.intern_ids.filter(i => i !== internId)
        : [...f.intern_ids, internId],
    }));
  }

  async function handleDeletePart(partId) {
    if (!window.confirm("Supprimer cette partie et toutes ses tâches ?")) return;
    await api.deletePart(id, partId);
    clearCache();
    await load();
  }

  async function handleCreateTask(e, partId) {
    e.preventDefault();
    await api.addTaskToPart(id, partId, { ...taskForm, project_id: Number(id), start_date: taskForm.start_date || null, deadline: taskForm.deadline || null });
    setTaskForm(EMPTY_TASK);
    setActiveTaskForm(null);
    clearCache();
    await load();
  }

  async function handleStatusChange(taskId, status) {
    await api.updateTask(taskId, { status });
    clearCache();
    await load();
  }

  const [openAssignMenu, setOpenAssignMenu] = useState(null); // task id

  async function handleToggleAssignee(e, taskId, userId, isAssigned) {
    e.stopPropagation();
    if (isAssigned) {
      await api.removeTaskAssignee(taskId, userId);
    } else {
      await api.addTaskAssignee(taskId, userId);
    }
    clearCache();
    await load();
  }

  async function handleDeleteTask(taskId) {
    if (!window.confirm("Supprimer cette tâche ?")) return;
    await api.deleteTask(taskId);
    clearCache();
    await load();
  }

  if (!project) return <p style={{ padding: "2rem", color: "#718096" }}>Chargement...</p>;

  const statusColor = (s) => ({ todo: "#f59e0b", in_progress: "#3b82f6", done: "#10b981" }[s]);

  return (
    <div>
      {/* Project header */}
      <div style={styles.projectHeader}>
        <div>
          <h1 style={styles.heading}>{project.name}</h1>
          {project.description && <p style={styles.desc}>{project.description}</p>}
          <div style={styles.projectMeta}>
            {project.github_url && isSafeUrl(project.github_url) && (
              <a href={project.github_url} target="_blank" rel="noreferrer noopener" style={styles.ghLink}>GitHub Repo →</a>
            )}
            {project.deadline && (
              <span style={styles.deadline}>Échéance : {new Date(project.deadline).toLocaleDateString("fr-FR")}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button style={styles.btnRes} onClick={() => setShowResources(o => !o)}>
            📁 Ressources {resources.length > 0 && <span style={styles.resBadge}>{resources.length}</span>}
          </button>
          {isAdmin && <>
            <button style={styles.btnGlobal} onClick={() => setShowGlobalCdc(true)}>CDC Global</button>
            <button style={styles.btnImport} onClick={() => setShowImportCdc(true)}>+ Importer CDC</button>
            <button style={styles.btn} onClick={openCreatePart}>+ Nouvelle partie</button>
          </>}
        </div>
      </div>

      {/* ── Resources Panel ── */}
      {showResources && (
        <ResourcesPanel
          projectId={id}
          resources={resources}
          isAdmin={isAdmin}
          resourceTab={resourceTab}
          setResourceTab={setResourceTab}
          resForm={resForm}
          setResForm={setResForm}
          resFile={resFile}
          setResFile={setResFile}
          onAdd={handleAddResource}
          onDelete={handleDeleteResource}
          onClose={() => setShowResources(false)}
        />
      )}

      {/* ── Main content (left) + Stack sidebar (right) ── */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {parts.length === 0 && (
            <div style={styles.emptyState}>
              {isAdmin
                ? 'Aucune partie — cliquez sur "+ Nouvelle partie" pour commencer.'
                : "Aucune partie ne vous est assignée pour le moment."}
            </div>
          )}

          {/* Unassigned tasks (from AI or manual) */}
          {unassignedTasks.length > 0 && (
            <div style={styles.unassignedSection}>
              <div style={styles.unassignedHeader}>
                <span style={styles.unassignedTitle}>Tâches non assignées ({unassignedTasks.length})</span>
                <span style={styles.unassignedHint}>Ces tâches n'ont pas de stagiaire — assignez-les ci-dessous</span>
              </div>
              <div style={styles.unassignedGrid}>
                {unassignedTasks.map(task => (
                  <div key={task.id} style={styles.unassignedCard} onClick={() => setSelectedTask(task)}>
                    <div style={styles.taskTitleRow}>
                      <span style={styles.typeIcon}>{TYPE_ICONS[task.task_type]}</span>
                      <span style={styles.taskTitle}>{task.title}</span>
                      {task.story_points && <span style={styles.pointsBadge}>{task.story_points}</span>}
                    </div>
                    {task.description && <div style={styles.taskDesc}>{task.description}</div>}
                    <div style={styles.taskMeta}>
                      <span style={{ ...styles.chip, ...priorityColor(task.priority) }}>{task.priority}</span>
                    </div>
                    {isAdmin && (
                      <div style={styles.assignRow} onClick={e => e.stopPropagation()}>
                        <select
                          style={styles.assignSelect}
                          defaultValue=""
                          onChange={async e => {
                            const internId = Number(e.target.value);
                            const part = parts.find(p => p.assignee?.id === internId);
                            if (part) {
                              await api.updateTask(task.id, { assignee_id: internId });
                              await api.addTaskToPart(id, part.id, {
                                title: task.title, description: task.description,
                                priority: task.priority, task_type: task.task_type,
                                story_points: task.story_points, project_id: Number(id),
                              });
                              await api.deleteTask(task.id);
                            } else {
                              await api.updateTask(task.id, { assignee_id: internId });
                            }
                            load();
                          }}
                        >
                          <option value="" disabled>Assigner à un stagiaire...</option>
                          {allInterns.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                        <select
                          style={styles.assignSelect}
                          defaultValue=""
                          onChange={async e => {
                            const partId = Number(e.target.value);
                            await api.addTaskToPart(id, partId, {
                              title: task.title, description: task.description,
                              priority: task.priority, task_type: task.task_type,
                              story_points: task.story_points, project_id: Number(id),
                            });
                            await api.deleteTask(task.id);
                            load();
                          }}
                        >
                          <option value="" disabled>Déplacer vers une partie...</option>
                          {parts.map(p => <option key={p.id} value={p.id}>{p.name}{p.assignee ? ` (${p.assignee.name})` : ""}</option>)}
                        </select>
                        <button style={styles.delBtn} onClick={() => handleDeleteTask(task.id)}>✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Parties / filtre (admin only) ── */}
          {isAdmin && parts.some(p => p.assignee) && (
            <div style={styles.teamPanel}>
              <div style={styles.teamHeader}>
                <span style={styles.teamTitle}>Parties du projet</span>
                <span style={styles.teamSub}>Cliquez sur une partie pour la mettre en avant</span>
              </div>
              <div style={styles.teamList}>
                <button
                  style={{ ...styles.internChip, ...(internFilter === null ? styles.internChipActive : {}) }}
                  onClick={() => setInternFilter(null)}
                >
                  <span style={{ ...styles.internAvatar, background: "#4f46e5" }}>✦</span>
                  <span>Toutes</span>
                  <span style={styles.internTaskCount}>{parts.reduce((s, p) => s + p.tasks.length, 0)}</span>
                </button>
                {parts.filter(p => p.assignee).map(p => {
                  const taskCount = p.tasks.length;
                  const doneCount = p.tasks.filter(t => t.status === "done").length;
                  const pct = taskCount > 0 ? Math.round(doneCount / taskCount * 100) : 0;
                  const active = internFilter === p.id;
                  const colors = ["#4f46e5","#059669","#d97706","#dc2626","#7c3aed","#0891b2"];
                  const color = colors[p.assignee.id % colors.length];
                  return (
                    <button
                      key={p.id}
                      style={{ ...styles.internChip, ...(active ? { ...styles.internChipActive, borderColor: color, background: color + "12" } : {}) }}
                      onClick={() => setInternFilter(active ? null : p.id)}
                    >
                      <span style={{ ...styles.internAvatar, background: color }}>{p.assignee.name[0].toUpperCase()}</span>
                      <div style={styles.internInfo}>
                        <span style={styles.internName}>{p.name}</span>
                        <span style={styles.internSub}>{p.assignee.name}</span>
                        <div style={styles.internMiniBar}>
                          <div style={{ ...styles.internMiniFill, width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                      <span style={{ ...styles.internTaskCount, background: active ? color : "#e2e8f0", color: active ? "#fff" : "#4a5568" }}>{taskCount}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Parts ── */}
          {parts.filter(part => internFilter === null || part.id === internFilter).map(part => {
            const displayTasks = isAdmin && part.assignment_mode === "individual"
              ? part.tasks.filter(t => t.instance_id != null)
              : part.tasks;
            const todoTasks = displayTasks.filter(t => t.status === "todo");
            const inProgressTasks = displayTasks.filter(t => t.status === "in_progress");
            const doneTasks = displayTasks.filter(t => t.status === "done");
            const total = displayTasks.length;
            const done = doneTasks.length;
            const progress = total > 0 ? Math.round((done / total) * 100) : 0;

            const partMembers = part.interns?.length > 0 ? part.interns : (part.assignee ? [part.assignee] : []);
            const partMemberIds = new Set(partMembers.map(u => u.id));
            const isPartMember = isAdmin || partMemberIds.has(currentUser?.id);

            const workload = partMembers.map(u => ({
              user: u,
              count: part.tasks.filter(t => t.assignees?.some(a => a.id === u.id)).length,
            }));

            const isCollapsed = collapsedParts.has(part.id);

            return (
              <div key={part.id} style={styles.partCard}>
                <div style={{ ...styles.partHeader, cursor: "pointer" }} onClick={() => togglePart(part.id)}>
                  <div style={styles.partLeft}>
                    <div style={styles.partName}>
                      <span style={{ marginRight: "0.5rem", fontSize: "0.8rem", color: "#a0aec0" }}>{isCollapsed ? "▶" : "▼"}</span>
                      {part.name}
                      {part.assignment_mode === "individual" && (
                        <span style={styles.modeBadge}>Individuel</span>
                      )}
                    </div>
                    {(part.interns?.length > 0 || part.assignee) && (
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.3rem" }}>
                        {(part.interns?.length > 0 ? part.interns : [part.assignee]).map(u => (
                          <div key={u.id} style={styles.internBadge}>
                            <div style={styles.avatar}>{u.name[0].toUpperCase()}</div>
                            <span>{u.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {workload.length > 0 && (
                      <div style={styles.workloadRow}>
                        {workload.map(w => (
                          <span key={w.user.id} style={styles.workloadChip}>
                            <span style={styles.workloadAvatar}>{w.user.name[0].toUpperCase()}</span>
                            {w.user.name.split(" ")[0]} · {w.count}
                          </span>
                        ))}
                      </div>
                    )}
                    {part.description && <div style={styles.partDesc}>{part.description}</div>}
                  </div>
                  <div style={styles.partRight}>
                    <div style={styles.progressRow}>
                      <span style={styles.progressPct}>{progress}%</span>
                      <div style={styles.progressBar}>
                        <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                      </div>
                      <span style={styles.taskCount}>{done}/{total}</span>
                    </div>
                    <div style={styles.partActions} onClick={e => e.stopPropagation()}>
                      {isAdmin && (
                        <button style={styles.cdcBtn} onClick={() => setPartCdcModal(part)}>
                          📄 CDC
                        </button>
                      )}
                      {isAdmin && part.assignment_mode === "individual" && (
                        <button style={{ ...styles.cdcBtn, background: "#ede9fe", color: "#7c3aed" }} onClick={() => openInstances(part)}>
                          👥 Instances
                        </button>
                      )}
                      {isAdmin && (
                        <button style={styles.editPartBtn} onClick={() => openEditPart(part)}>Modifier</button>
                      )}
                      {isAdmin && (
                        <button style={styles.deletePartBtn} onClick={() => handleDeletePart(part.id)}>Supprimer</button>
                      )}
                      <button style={styles.addTaskBtn} onClick={() => { setActiveTaskForm(activeTaskForm === part.id ? null : part.id); setCollapsedParts(prev => { const n = new Set(prev); n.delete(part.id); return n; }); }}>
                        + Tâche
                      </button>
                    </div>
                  </div>
                </div>

                {!isCollapsed && <>

                {part.cdc_filename && (
                  <div style={styles.cdcViewer}>
                    <button style={styles.cdcToggle} onClick={() => setExpandedCdc(expandedCdc === part.id ? null : part.id)}>
                      CDC : {part.cdc_filename} {expandedCdc === part.id ? "▲ Masquer" : "▼ Consulter"}
                    </button>
                    {expandedCdc === part.id && (
                      <pre style={styles.cdcText}>{part.cdc_text}</pre>
                    )}
                  </div>
                )}

                {activeTaskForm === part.id && (
                  <form onSubmit={e => handleCreateTask(e, part.id)} style={styles.taskForm}>
                    <input style={styles.input} placeholder="Titre de la tâche" value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} required />
                    <input style={styles.input} placeholder="Description (optionnelle)" value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} />
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <select style={styles.input} value={taskForm.task_type} onChange={e => setTaskForm({ ...taskForm, task_type: e.target.value })}>
                        {TASK_TYPES.map(t => <option key={t} value={t}>{TYPE_FR[t]}</option>)}
                      </select>
                      <select style={styles.input} value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })}>
                        <option value="low">Faible</option>
                        <option value="medium">Moyenne</option>
                        <option value="high">Haute</option>
                      </select>
                      <input style={styles.input} type="date" placeholder="Date de début" value={taskForm.start_date} onChange={e => setTaskForm({ ...taskForm, start_date: e.target.value })} />
                      <input style={styles.input} type="date" placeholder="Date limite" value={taskForm.deadline} onChange={e => setTaskForm({ ...taskForm, deadline: e.target.value })} />
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button style={styles.btn} type="submit">Ajouter la tâche</button>
                      <button style={styles.btnSec} type="button" onClick={() => { setActiveTaskForm(null); setTaskForm(EMPTY_TASK); }}>Annuler</button>
                    </div>
                  </form>
                )}

                <div style={styles.columns}>
                  {[
                    { key: "todo", label: "À faire", tasks: todoTasks },
                    { key: "in_progress", label: "En cours", tasks: inProgressTasks },
                    { key: "done", label: "Terminé", tasks: doneTasks },
                  ].map(col => (
                    <div key={col.key} style={styles.column}>
                      <div style={{ ...styles.colHeader, borderLeftColor: statusColor(col.key) }}>
                        {col.label} <span style={styles.colCount}>{col.tasks.length}</span>
                      </div>
                      {col.tasks.map(task => {
                        const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== "done";
                        return (
                          <div
                            key={task.id}
                            style={{ ...styles.taskCard, ...(isOverdue ? styles.overdueCard : {}) }}
                            onClick={() => setSelectedTask(task)}
                          >
                            {task.labels?.length > 0 && (
                              <div style={styles.labelBar}>
                                {task.labels.map(l => (
                                  <span key={l.id} style={{ ...styles.labelDot, background: l.color }} title={l.name} />
                                ))}
                              </div>
                            )}
                            {isOverdue && <div style={styles.overdueTag}>EN RETARD</div>}
                            <div style={styles.taskTitleRow}>
                              <span style={styles.typeIcon}>{TYPE_ICONS[task.task_type]}</span>
                              <span style={styles.taskTitle}>{task.title}</span>
                              {task.story_points && <span style={styles.pointsBadge}>{task.story_points}</span>}
                            </div>
                            {task.description && <div style={styles.taskDesc}>{task.description}</div>}
                            <div style={styles.taskMeta}>
                              <span style={{ ...styles.chip, ...priorityColor(task.priority) }}>{task.priority}</span>
                              {task.deadline && <span style={{ ...styles.chip, color: isOverdue ? "#e53e3e" : "#718096" }}>Échéance {new Date(task.deadline).toLocaleDateString("fr-FR")}</span>}
                              {task.subtasks?.length > 0 && (
                                <span style={styles.chip}>{task.subtasks.filter(s=>s.done).length}/{task.subtasks.length} ✓</span>
                              )}
                            </div>
                            {part.assignment_mode === "individual" && task.instance_id && instanceOwnerMap[task.instance_id] && (
                              <div style={styles.ownerBadge}>
                                <span style={styles.ownerAvatar}>
                                  {instanceOwnerMap[task.instance_id].name[0].toUpperCase()}
                                </span>
                                <span style={styles.ownerName}>{instanceOwnerMap[task.instance_id].name}</span>
                              </div>
                            )}
                            {isPartMember && part.assignment_mode === "collaborative" && (
  <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
    <div style={styles.taskAssigneeRow}>
      {(task.assignees?.length > 0 ? task.assignees : []).map(u => (
        <span key={u.id} style={{ ...styles.assigneeAvatar, title: u.name }} title={u.name}>
          {u.name[0].toUpperCase()}
        </span>
      ))}
      {task.assignees?.length === 0 && (
        <span style={styles.taskNoAssignee}>Non assigné</span>
      )}
      <button
        style={styles.claimBtn}
        onClick={e => { e.stopPropagation(); setOpenAssignMenu(openAssignMenu === task.id ? null : task.id); }}
      >
        Assigner ▾
      </button>
    </div>
    {openAssignMenu === task.id && (
      <div style={styles.assignDropdown} onClick={e => e.stopPropagation()}>
        {partMembers.map(u => {
          const isAssigned = task.assignees?.some(a => a.id === u.id);
          const isMe = u.id === currentUser?.id;
          return (
            <div
              key={u.id}
              style={{ ...styles.assignOption, background: isAssigned ? "#ede9fe" : "#fff" }}
              onClick={e => { handleToggleAssignee(e, task.id, u.id, isAssigned); setOpenAssignMenu(null); }}
            >
              <span style={{ ...styles.assigneeAvatar, width: "20px", height: "20px", fontSize: "0.65rem" }}>
                {u.name[0].toUpperCase()}
              </span>
              <span style={{ fontSize: "0.82rem", fontWeight: 600, flex: 1 }}>
                {u.name}{isMe ? " (Moi)" : ""}
              </span>
              {isAssigned && <span style={{ color: "#4f46e5", fontSize: "0.75rem" }}>✓</span>}
            </div>
          );
        })}
      </div>
    )}
  </div>
)}

{isPartMember && part.assignment_mode === "individual" && task.assignees?.length > 0 && (
  <div style={styles.taskAssigneeRow}>
    <span style={styles.assigneeAvatar} title={task.assignees[0].name}>
      {task.assignees[0].name[0].toUpperCase()}
    </span>
    <span style={{ fontSize: "0.72rem", color: "#718096" }}>{task.assignees[0].name}</span>
  </div>
)}
                            <div style={styles.taskActions} onClick={e => e.stopPropagation()}>
                              {[
                                { key: "todo", label: "À faire" },
                                { key: "in_progress", label: "En cours" },
                                { key: "done", label: "Terminé" },
                              ].filter(s => s.key !== task.status).map(s => (
                                <button key={s.key} style={styles.moveBtn} onClick={() => handleStatusChange(task.id, s.key)}>
                                  → {s.label}
                                </button>
                              ))}
                              {isAdmin && <button style={styles.delBtn} onClick={() => handleDeleteTask(task.id)}>✕</button>}
                            </div>
                          </div>
                        );
                      })}
                      {col.tasks.length === 0 && <div style={styles.colEmpty}>—</div>}
                    </div>
                  ))}
                </div>
                </>}
              </div>
            );
          })}

          {/* Add / Edit Intern Part modal */}
          {partModal && (
            <div style={styles.overlay} onClick={closePartModal}>
              <div style={styles.modal} onClick={e => e.stopPropagation()}>
                <h2 style={styles.modalTitle}>
                  {partModal === "create" ? "Nouvelle partie" : `Modifier : ${partModal.name}`}
                </h2>
                <form onSubmit={handleSubmitPart} style={styles.modalForm}>
                  <label style={styles.label}>Nom de la partie *</label>
                  <input style={styles.input} placeholder="ex. Frontend, Backend, Tests..." value={partForm.name} onChange={e => setPartForm({ ...partForm, name: e.target.value })} required />

                  <label style={styles.label}>Description</label>
                  <textarea style={{ ...styles.input, resize: "vertical", fontFamily: "inherit" }} rows={2} placeholder="Périmètre de travail..." value={partForm.description} onChange={e => setPartForm({ ...partForm, description: e.target.value })} />

                  <label style={styles.label}>
                    Stagiaires assignés <span style={{ color: "#a0aec0", fontWeight: 400 }}>(optionnel — modifiable plus tard)</span>
                  </label>
                  {allInterns.length === 0 ? (
                    <p style={{ fontSize: "0.82rem", color: "#a0aec0" }}>Aucun stagiaire disponible.</p>
                  ) : (
                    <div style={styles.internCheckList}>
                      {allInterns.map(u => {
                        const checked = partForm.intern_ids.includes(u.id);
                        const editingPartId = partModal !== "create" ? partModal.id : null;
                        const otherParts = parts.filter(pt =>
                          pt.id !== editingPartId &&
                          (pt.interns?.some(i => i.id === u.id) || pt.assignee?.id === u.id)
                        );
                        return (
                          <label key={u.id} style={{ ...styles.internCheckRow, background: checked ? "#f0f0ff" : "#fafafa", borderColor: checked ? "#4f46e5" : "#e2e8f0" }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleInternId(u.id)} style={{ accentColor: "#4f46e5" }} />
                            <div style={styles.avatar}>{u.name[0].toUpperCase()}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1a202c" }}>{u.name}</div>
                              <div style={{ fontSize: "0.72rem", color: "#718096" }}>{u.email}</div>
                              {otherParts.length > 0 && (
                                <div style={{ fontSize: "0.68rem", color: "#7c3aed", marginTop: "0.1rem" }}>
                                  Aussi sur : {otherParts.map(pt => pt.name).join(", ")}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <label style={styles.label}>Mode d'assignation</label>
                  <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.25rem" }}>
                    {[{ value: "collaborative", label: "Collaboration", desc: "Tâches partagées entre stagiaires" }, { value: "individual", label: "Individuel", desc: "Chaque stagiaire a ses propres tâches" }].map(opt => (
                      <label key={opt.value} style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.2rem", background: partForm.assignment_mode === opt.value ? "#ede9fe" : "#f7fafc", border: `2px solid ${partForm.assignment_mode === opt.value ? "#7c3aed" : "#e2e8f0"}`, borderRadius: "8px", padding: "0.6rem 0.75rem", cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <input type="radio" name="assignment_mode" value={opt.value} checked={partForm.assignment_mode === opt.value} onChange={e => handleAssignmentModeChange(e.target.value)} />
                          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{opt.label}</span>
                        </div>
                        <span style={{ fontSize: "0.72rem", color: "#718096" }}>{opt.desc}</span>
                      </label>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                    <button style={styles.btn} type="submit">{partModal === "create" ? "Créer la partie" : "Enregistrer"}</button>
                    <button style={styles.btnSec} type="button" onClick={closePartModal}>Annuler</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {instancesModal && (
            <div style={styles.overlay} onClick={() => setInstancesModal(null)}>
              <div style={{ ...styles.modal, width: "680px", maxHeight: "80vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Instances — {instancesModal.part.name}</h2>
                  <button style={styles.closeBtn} onClick={() => setInstancesModal(null)}>✕</button>
                </div>
                {instancesModal.instances.length === 0 ? (
                  <p style={{ color: "#a0aec0" }}>Aucune instance créée. Assignez des stagiaires à cette partie.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {instancesModal.instances.map(inst => {
                      const total = inst.tasks.length;
                      const done = inst.tasks.filter(t => t.status === "done").length;
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                      return (
                        <div key={inst.id} style={{ background: "#f7fafc", borderRadius: "10px", padding: "0.85rem 1rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#7c3aed", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.8rem" }}>{inst.intern.name[0].toUpperCase()}</div>
                              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{inst.intern.name}</span>
                            </div>
                            <span style={{ fontSize: "0.8rem", color: "#4f46e5", fontWeight: 700 }}>{pct}% · {done}/{total}</span>
                          </div>
                          <div style={{ height: 6, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: "#7c3aed", borderRadius: 999 }} />
                          </div>
                          {inst.tasks.length > 0 && (
                            <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                              {inst.tasks.map(t => (
                                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
                                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.status === "done" ? "#059669" : t.status === "in_progress" ? "#d97706" : "#a0aec0", flexShrink: 0 }} />
                                  <span style={{ flex: 1, color: "#2d3748" }}>{t.title}</span>
                                  <span style={{ color: "#718096", textTransform: "capitalize" }}>{t.status.replace("_", " ")}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {successMsg && (
            <div style={styles.successBanner}>
              ✅ {successMsg}
              <button style={styles.successClose} onClick={() => setSuccessMsg("")}>✕</button>
            </div>
          )}

        </div>

        <StackSidebar
          draft={archDraft}
          onChange={setArchDraft}
          onSave={handleSaveArchitecture}
          saving={archSaving}
          isAdmin={isAdmin}
        />
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          projectId={id}
          allInterns={allInterns}
          parts={parts}
          onClose={() => { setSelectedTask(null); clearCache(); load(); }}
          onStatusChange={handleStatusChange}
          onDelete={() => { setSelectedTask(null); clearCache(); load(); }}
        />
      )}

      {showImportCdc && (
        <ImportCdcModal
          projectId={id}
          interns={allInterns}
          onClose={() => setShowImportCdc(false)}
          onDone={() => { load(); setSuccessMsg("Partie créée depuis CDC avec succès !"); }}
        />
      )}

      {showGlobalCdc && (
        <GlobalCdcModal
          project={project}
          allInterns={allInterns}
          onClose={() => setShowGlobalCdc(false)}
          onSuccess={(nParts, nTasks) => {
            setSuccessMsg(`${nParts} partie${nParts !== 1 ? "s" : ""} et ${nTasks} tâche${nTasks !== 1 ? "s" : ""} créées avec succès !`);
            load();
          }}
        />
      )}

      {partCdcModal && (
        <PartCdcModal
          project={project}
          part={partCdcModal}
          onClose={() => setPartCdcModal(null)}
          onSuccess={(count) => {
            setSuccessMsg(`${count} tâche${count !== 1 ? "s" : ""} créées pour la partie "${partCdcModal.name}" !`);
            setPartCdcModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}


function priorityColor(p) {
  return { low: { background: "#d1fae5", color: "#065f46" }, medium: { background: "#fef3c7", color: "#92400e" }, high: { background: "#fee2e2", color: "#991b1b" } }[p] || {};
}

function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

async function downloadWithAuth(url, filename) {
  const token = localStorage.getItem("token");
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Erreur téléchargement");
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename || "fichier";
    a.click();
    URL.revokeObjectURL(objUrl);
  } catch (err) {
    alert(err.message);
  }
}

const styles = {
  projectHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" },
  heading: { fontSize: "1.6rem", fontWeight: 700, color: "#1a202c", margin: 0 },
  desc: { color: "#718096", marginTop: "0.25rem", marginBottom: "0.4rem" },
  projectMeta: { display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.4rem" },
  ghLink: { color: "#4f46e5", fontSize: "0.9rem", fontWeight: 600 },
  deadline: { fontSize: "0.85rem", color: "#e53e3e", fontWeight: 600 },
  btn: { background: "#4f46e5", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  btnGlobal: { background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  btnImport: { background: "#059669", color: "#fff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  cdcBtn: { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d", padding: "0.35rem 0.75rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" },
  cdcViewer: { borderTop: "1px solid #f0f0f0", padding: "0.75rem 1.25rem", background: "#fafafa" },
  cdcToggle: { background: "none", border: "1px solid #e2e8f0", color: "#4a5568", padding: "0.4rem 0.85rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 },
  cdcText: { marginTop: "0.75rem", background: "#f7f8fc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "1rem", fontSize: "0.78rem", color: "#4a5568", whiteSpace: "pre-wrap", maxHeight: "300px", overflowY: "auto", fontFamily: "inherit", lineHeight: 1.6 },
  successBanner: { position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)", background: "#059669", color: "#fff", padding: "0.75rem 1.5rem", borderRadius: "999px", fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.75rem", zIndex: 2000, boxShadow: "0 4px 20px rgba(0,0,0,0.2)" },
  successClose: { background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "0.85rem" },
  btnSec: { background: "#e2e8f0", color: "#2d3748", border: "none", padding: "0.6rem 1.2rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer" },

  emptyState: { background: "#fff", borderRadius: "10px", padding: "3rem", textAlign: "center", color: "#a0aec0", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", fontSize: "0.95rem" },

  teamPanel: { background: "#fff", borderRadius: "12px", padding: "1rem 1.25rem", marginBottom: "1.5rem", boxShadow: "0 1px 6px rgba(0,0,0,0.07)" },
  teamHeader: { display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.85rem" },
  teamTitle: { fontWeight: 700, fontSize: "0.95rem", color: "#1a202c" },
  teamSub: { fontSize: "0.78rem", color: "#a0aec0" },
  teamList: { display: "flex", gap: "0.6rem", flexWrap: "wrap" },
  internChip: { display: "flex", alignItems: "center", gap: "0.55rem", padding: "0.5rem 0.85rem 0.5rem 0.55rem", borderRadius: "999px", border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", transition: "all 0.15s", minWidth: 0 },
  internChipActive: { borderColor: "#4f46e5", background: "#f0f0ff", fontWeight: 600 },
  internAvatar: { width: "28px", height: "28px", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.78rem", fontWeight: 700, flexShrink: 0 },
  internInfo: { display: "flex", flexDirection: "column", gap: "0.1rem", minWidth: "70px" },
  internName: { fontSize: "0.82rem", color: "#1a202c", whiteSpace: "nowrap", fontWeight: 600 },
  internSub: { fontSize: "0.72rem", color: "#718096", whiteSpace: "nowrap" },
  internMiniBar: { height: "3px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden", width: "60px" },
  internMiniFill: { height: "100%", borderRadius: "999px" },
  internTaskCount: { fontSize: "0.72rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "999px", background: "#e2e8f0", color: "#4a5568", flexShrink: 0 },
  unassignedSection: { background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: "12px", padding: "1rem 1.25rem", marginBottom: "1.5rem" },
  unassignedHeader: { display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.85rem", flexWrap: "wrap" },
  unassignedTitle: { fontWeight: 700, color: "#92400e", fontSize: "0.95rem" },
  unassignedHint: { color: "#b45309", fontSize: "0.8rem" },
  unassignedGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" },
  unassignedCard: { background: "#fff", borderRadius: "8px", padding: "0.85rem", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", border: "1px solid #fde68a" },
  assignRow: { display: "flex", gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" },
  assignSelect: { flex: 1, padding: "0.35rem 0.5rem", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.78rem", background: "#fff", cursor: "pointer", minWidth: "120px" },

  partCard: { background: "#fff", borderRadius: "12px", padding: "1.25rem", marginBottom: "1.5rem", boxShadow: "0 1px 8px rgba(0,0,0,0.08)" },
  partHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" },
  partLeft: { flex: 1 },
  partRight: { minWidth: "220px", marginLeft: "1.5rem" },
  partName: { fontSize: "1.05rem", fontWeight: 700, color: "#1a202c", marginBottom: "0.4rem" },
  modeBadge: { marginLeft: "0.5rem", display: "inline-flex", alignItems: "center", padding: "0.12rem 0.45rem", borderRadius: "999px", background: "#ede9fe", color: "#6d28d9", fontSize: "0.68rem", fontWeight: 700, verticalAlign: "middle" },
  internBadge: { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" },
  avatar: { width: "26px", height: "26px", borderRadius: "50%", background: "#4f46e5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 },
  internEmail: { color: "#a0aec0", fontSize: "0.78rem" },
  partDesc: { color: "#718096", fontSize: "0.85rem", marginTop: "0.25rem" },
  progressRow: { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" },
  progressPct: { fontSize: "0.75rem", fontWeight: 700, color: "#4f46e5", minWidth: "32px" },
  progressBar: { flex: 1, height: "6px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" },
  progressFill: { height: "100%", background: "#4f46e5", borderRadius: "999px" },
  taskCount: { fontSize: "0.75rem", color: "#718096", whiteSpace: "nowrap" },
  partActions: { display: "flex", gap: "0.4rem" },
  addTaskBtn: { background: "#ede9fe", color: "#4f46e5", border: "none", padding: "0.35rem 0.75rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" },
  editPartBtn: { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0", padding: "0.35rem 0.75rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 },
  deletePartBtn: { background: "#fff5f5", color: "#c53030", border: "1px solid #fed7d7", padding: "0.35rem 0.75rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 },
  delPartBtn: { background: "#fff5f5", color: "#e53e3e", border: "1px solid #fca5a5", padding: "0.35rem 0.75rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.82rem" },

  taskForm: { background: "#f7f8fc", padding: "1rem", borderRadius: "8px", marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" },
  input: { padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.95rem", flex: 1 },

  columns: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" },
  column: { background: "#f7f8fc", borderRadius: "8px", padding: "0.75rem" },
  colHeader: { fontSize: "0.8rem", fontWeight: 700, color: "#4a5568", marginBottom: "0.65rem", paddingLeft: "0.5rem", borderLeft: "3px solid #e2e8f0", display: "flex", alignItems: "center", gap: "0.4rem" },
  colCount: { background: "#e2e8f0", borderRadius: "999px", padding: "0.05rem 0.4rem", fontSize: "0.7rem" },
  colEmpty: { color: "#cbd5e0", textAlign: "center", padding: "0.75rem 0", fontSize: "0.82rem" },

  taskCard: { background: "#fff", borderRadius: "8px", padding: "0.75rem", marginBottom: "0.5rem", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", border: "1px solid transparent", overflow: "hidden" },
  overdueCard: { border: "1px solid #fca5a5", background: "#fff5f5" },
  labelBar: { display: "flex", gap: "3px", marginBottom: "0.35rem" },
  labelDot: { height: "4px", flex: 1, borderRadius: "2px", minWidth: "18px", maxWidth: "40px" },
  overdueTag: { fontSize: "0.62rem", fontWeight: 700, color: "#e53e3e", marginBottom: "0.2rem", letterSpacing: "0.04em" },
  taskTitleRow: { display: "flex", alignItems: "flex-start", gap: "0.3rem", marginBottom: "0.2rem" },
  typeIcon: { fontSize: "0.75rem", flexShrink: 0, marginTop: "1px" },
  taskTitle: { fontWeight: 600, color: "#1a202c", fontSize: "0.875rem", flex: 1 },
  pointsBadge: { background: "#ede9fe", color: "#4f46e5", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700, padding: "0.1rem 0.4rem", flexShrink: 0 },
  taskDesc: { fontSize: "0.77rem", color: "#718096", marginBottom: "0.4rem" },
  taskMeta: { display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.4rem" },
  chip: { fontSize: "0.68rem", padding: "0.12rem 0.45rem", borderRadius: "999px", background: "#e2e8f0", fontWeight: 600 },
  taskActions: { display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.35rem" },
  taskAssigneeRow: { display: "flex", alignItems: "center", gap: "0.3rem", marginTop: "0.4rem", flexWrap: "wrap" },
  assigneeAvatar: { width: "18px", height: "18px", borderRadius: "50%", background: "#4f46e5", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 700, flexShrink: 0 },
  taskNoAssignee: { fontSize: "0.68rem", color: "#a0aec0", fontStyle: "italic" },
  claimBtn: { fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: "5px", border: "1px solid #4f46e5", background: "#ede9fe", color: "#4f46e5", cursor: "pointer", fontWeight: 600 },
  assignDropdown: { position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "170px", overflow: "hidden" },
  assignOption: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", cursor: "pointer", borderBottom: "1px solid #f0f0f0" },
  workloadRow: { display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.3rem" },
  workloadChip: { display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.7rem", color: "#4a5568", background: "#f1f5f9", borderRadius: "999px", padding: "0.1rem 0.5rem" },
  workloadAvatar: { width: "14px", height: "14px", borderRadius: "50%", background: "#4f46e5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.55rem", fontWeight: 700, flexShrink: 0 },
  moveBtn: { fontSize: "0.68rem", padding: "0.15rem 0.4rem", borderRadius: "5px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#4a5568" },
  delBtn: { fontSize: "0.68rem", padding: "0.15rem 0.4rem", borderRadius: "5px", border: "1px solid #fca5a5", background: "#fff5f5", cursor: "pointer", color: "#e53e3e", marginLeft: "auto" },

  ownerBadge: { display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.35rem" },
  ownerAvatar: { width: "16px", height: "16px", borderRadius: "50%", background: "#7c3aed", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.55rem", fontWeight: 700, flexShrink: 0 },
  ownerName: { fontSize: "0.68rem", color: "#7c3aed", fontWeight: 600 },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "#fff", borderRadius: "12px", padding: "2rem", width: "460px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalTitle: { margin: "0 0 1.25rem", fontSize: "1.15rem", fontWeight: 700, color: "#1a202c" },
  modalForm: { display: "flex", flexDirection: "column", gap: "0.4rem" },
  label: { fontSize: "0.8rem", fontWeight: 600, color: "#4a5568", marginTop: "0.4rem" },
  hint: { fontWeight: 400, color: "#a0aec0" },

  btnArch: { background: "#f7f8fc", color: "#1a202c", border: "1px solid #e2e8f0", padding: "0.6rem 1.1rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  btnRes: { background: "#0891b2", color: "#fff", border: "none", padding: "0.6rem 1.1rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "0.4rem" },
  resBadge: { background: "rgba(255,255,255,0.3)", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 700, padding: "0.05rem 0.4rem" },

  internCheckList: { display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "220px", overflowY: "auto", padding: "0.25rem 0" },
  internCheckRow: { display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.75rem", borderRadius: "8px", border: "1.5px solid #e2e8f0", cursor: "pointer" },
};

// ── Stack & Architecture Panel ────────────────────────────────────────────────
const STACK_CATEGORIES = ["Frontend", "Backend", "Database", "Mobile", "AI", "Autre"];
const CATEGORY_COLORS = {
  Frontend: { bg: "#ede9fe", color: "#4f46e5" },
  Backend: { bg: "#d1fae5", color: "#065f46" },
  Database: { bg: "#fef3c7", color: "#92400e" },
  Mobile: { bg: "#fee2e2", color: "#991b1b" },
  AI: { bg: "#e0f2fe", color: "#0369a1" },
  Autre: { bg: "#f1f5f9", color: "#475569" },
};

function StackSidebar({ draft, onChange, onSave, saving, isAdmin }) {
  const [addName, setAddName] = useState("");
  const [addCat, setAddCat] = useState("Frontend");
  const stack = Array.isArray(draft.tech_stack) ? draft.tech_stack : [];

  function addTech(e) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    if (stack.some(t => t.name.toLowerCase() === name.toLowerCase())) { setAddName(""); return; }
    onChange(d => ({ ...d, tech_stack: [...(Array.isArray(d.tech_stack) ? d.tech_stack : []), { name, category: addCat }] }));
    setAddName("");
  }

  function removeTech(name) {
    onChange(d => ({ ...d, tech_stack: (Array.isArray(d.tech_stack) ? d.tech_stack : []).filter(t => t.name !== name) }));
  }

  const grouped = {};
  for (const t of stack) {
    const cat = t.category || "Autre";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  }

  return (
    <div style={ss.sidebar}>
      <div style={ss.title}>🏗 Stack technique</div>

      {isAdmin && (
        <form onSubmit={addTech} style={ss.addForm}>
          <input
            style={ss.addInput}
            placeholder="Ex: React"
            value={addName}
            onChange={e => setAddName(e.target.value)}
          />
          <select style={ss.addSelect} value={addCat} onChange={e => setAddCat(e.target.value)}>
            {STACK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" style={ss.addBtn}>+ Ajouter</button>
        </form>
      )}

      {Object.keys(grouped).length > 0 ? (
        <div style={ss.categoryList}>
          {STACK_CATEGORIES.filter(c => grouped[c]).map(cat => (
            <div key={cat} style={ss.categoryBox}>
              <div style={ss.categoryLabel}>{cat}</div>
              <div style={ss.chips}>
                {grouped[cat].map(t => {
                  const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Autre;
                  return (
                    <span key={t.name} style={{ ...ss.chip, background: colors.bg, color: colors.color }}>
                      {t.name}
                      {isAdmin && (
                        <button style={ss.removeChip} onClick={() => removeTech(t.name)} title="Retirer">✕</button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={ss.hint}>Aucune technologie renseignée.</p>
      )}

      <div style={ss.noteBox}>
        <label style={ss.noteLabel}>Note</label>
        {isAdmin ? (
          <textarea
            style={ss.noteInput}
            placeholder="Contraintes, points de vigilance..."
            value={draft.architecture_notes}
            onChange={e => onChange(d => ({ ...d, architecture_notes: e.target.value }))}
          />
        ) : (
          <p style={ss.noteReadonly}>{draft.architecture_notes || "Aucune note."}</p>
        )}
      </div>

      {isAdmin && (
        <button style={ss.saveBtn} onClick={onSave} disabled={saving}>
          {saving ? "..." : "Enregistrer"}
        </button>
      )}
    </div>
  );
}

const ss = {
  sidebar: { width: "280px", flexShrink: 0, background: "#fff", borderRadius: "12px", padding: "1.1rem", boxShadow: "0 1px 8px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0", position: "sticky", top: "1.5rem" },
  title: { fontWeight: 700, fontSize: "0.95rem", color: "#1a202c", marginBottom: "0.85rem" },
  addForm: { display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "0.9rem" },
  addInput: { padding: "0.45rem 0.7rem", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "0.82rem" },
  addSelect: { padding: "0.45rem 0.7rem", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "0.8rem", background: "#fff" },
  addBtn: { background: "#4f46e5", color: "#fff", border: "none", padding: "0.45rem 0.8rem", borderRadius: "7px", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem" },
  categoryList: { display: "flex", flexDirection: "column", gap: "0.7rem" },
  categoryBox: {},
  categoryLabel: { fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#718096", marginBottom: "0.3rem" },
  chips: { display: "flex", gap: "0.3rem", flexWrap: "wrap" },
  chip: { display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.74rem", fontWeight: 600, padding: "0.2rem 0.55rem", borderRadius: "999px" },
  removeChip: { background: "none", border: "none", cursor: "pointer", fontSize: "0.6rem", lineHeight: 1, padding: 0, opacity: 0.7, color: "inherit" },
  hint: { fontSize: "0.78rem", color: "#a0aec0" },
  noteBox: { marginTop: "1rem", borderTop: "1px solid #f0f0f0", paddingTop: "0.85rem" },
  noteLabel: { fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#718096", display: "block", marginBottom: "0.35rem" },
  noteInput: { width: "100%", minHeight: "80px", padding: "0.55rem 0.7rem", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "0.8rem", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" },
  noteReadonly: { fontSize: "0.8rem", color: "#4a5568", whiteSpace: "pre-wrap", margin: 0 },
  saveBtn: { marginTop: "0.85rem", width: "100%", background: "#4f46e5", color: "#fff", border: "none", padding: "0.5rem", borderRadius: "7px", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" },
};

// ── Resources Panel ───────────────────────────────────────────────────────────
const MIME_ICONS = { "application/pdf": "📄", "image/png": "🖼", "image/jpeg": "🖼", "application/zip": "🗜" };
function mimeIcon(mime) { return MIME_ICONS[mime] || "📎"; }

function ResourcesPanel({ projectId, resources, isAdmin, resourceTab, setResourceTab, resForm, setResForm, setResFile, onAdd, onDelete, onClose }) {
  const BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL, import.meta.env.DEV);

  return (
    <div style={rp.panel}>
      <div style={rp.header}>
        <span style={rp.title}>📁 Ressources du projet</span>
        <button style={rp.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* File list */}
      <div style={rp.list}>
        {resources.length === 0 && <div style={rp.empty}>Aucune ressource partagée pour l'instant.</div>}
        {resources.map(r => (
          <div key={r.id} style={rp.row}>
            <span style={rp.icon}>
              {r.resource_type === "link" ? "🔗" : r.resource_type === "note" ? "📝" : mimeIcon(r.file_mime)}
            </span>
            <div style={rp.info}>
              <div style={rp.name}>{r.name}</div>
              <div style={rp.meta}>{r.uploaded_by} · {new Date(r.created_at).toLocaleDateString("fr-FR")}</div>
              {r.resource_type === "note" && r.note_text && (
                <div style={rp.noteText}>{r.note_text}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              {r.resource_type === "link" && isSafeUrl(r.url) && (
                <a href={r.url} target="_blank" rel="noreferrer noopener" style={rp.actionBtn}>Ouvrir</a>
              )}
              {r.resource_type === "file" && (
                <button style={rp.actionBtn} onClick={() => downloadWithAuth(`${BASE}/projects/${projectId}/resources/${r.id}/download`, r.name)}>Télécharger</button>
              )}
              {isAdmin && (
                <button style={rp.delBtn} onClick={() => onDelete(r.id)}>✕</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add form (admin only) */}
      {isAdmin && (
        <div style={rp.addSection}>
          <div style={rp.tabs}>
            {[["file","📎 Fichier"], ["link","🔗 Lien"], ["note","📝 Note"]].map(([k, label]) => (
              <button key={k} style={{ ...rp.tab, ...(resourceTab === k ? rp.tabActive : {}) }} onClick={() => setResourceTab(k)}>{label}</button>
            ))}
          </div>
          <form onSubmit={onAdd} style={rp.form}>
            {resourceTab === "file" && (
              <input type="file" accept=".pdf,.docx,.doc,.xlsx,.png,.jpg,.zip" onChange={e => setResFile(e.target.files[0])} required style={rp.fileInput} />
            )}
            {resourceTab === "link" && (<>
              <input style={rp.input} placeholder="Nom du lien" value={resForm.name} onChange={e => setResForm(f => ({ ...f, name: e.target.value }))} required />
              <input style={rp.input} placeholder="https://..." value={resForm.url} onChange={e => setResForm(f => ({ ...f, url: e.target.value }))} required />
            </>)}
            {resourceTab === "note" && (<>
              <input style={rp.input} placeholder="Titre de la note" value={resForm.name} onChange={e => setResForm(f => ({ ...f, name: e.target.value }))} required />
              <textarea style={{ ...rp.input, minHeight: "70px", resize: "vertical" }} placeholder="Contenu..." value={resForm.note_text} onChange={e => setResForm(f => ({ ...f, note_text: e.target.value }))} required />
            </>)}
            <button type="submit" style={rp.submitBtn}>+ Ajouter</button>
          </form>
        </div>
      )}
    </div>
  );
}

const rp = {
  panel: { background: "#fff", borderRadius: "12px", padding: "1.25rem 1.5rem", marginBottom: "1.5rem", boxShadow: "0 1px 8px rgba(0,0,0,0.08)", border: "1px solid #bae6fd" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" },
  title: { fontWeight: 700, fontSize: "1rem", color: "#1a202c" },
  closeBtn: { background: "none", border: "1px solid #e2e8f0", color: "#718096", borderRadius: "6px", padding: "0.3rem 0.6rem", cursor: "pointer" },
  list: { display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" },
  empty: { color: "#a0aec0", fontSize: "0.85rem", textAlign: "center", padding: "1rem" },
  row: { display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.65rem 0.85rem", background: "#f7f8fc", borderRadius: "8px" },
  icon: { fontSize: "1.2rem", flexShrink: 0, marginTop: "2px" },
  info: { flex: 1, minWidth: 0 },
  name: { fontWeight: 600, fontSize: "0.88rem", color: "#1a202c", marginBottom: "0.15rem" },
  meta: { fontSize: "0.72rem", color: "#a0aec0" },
  noteText: { fontSize: "0.78rem", color: "#4a5568", marginTop: "0.3rem", whiteSpace: "pre-wrap" },
  actionBtn: { fontSize: "0.75rem", color: "#0891b2", fontWeight: 600, background: "#e0f2fe", padding: "0.2rem 0.6rem", borderRadius: "5px", textDecoration: "none", cursor: "pointer", border: "none" },
  delBtn: { fontSize: "0.72rem", color: "#e53e3e", background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: "5px", padding: "0.2rem 0.5rem", cursor: "pointer" },
  addSection: { borderTop: "1px solid #e2e8f0", paddingTop: "0.85rem" },
  tabs: { display: "flex", gap: "0.35rem", marginBottom: "0.75rem" },
  tab: { padding: "0.35rem 0.85rem", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#f7f8fc", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: "#718096" },
  tabActive: { background: "#0891b2", color: "#fff", border: "1px solid #0891b2" },
  form: { display: "flex", flexDirection: "column", gap: "0.4rem" },
  input: { padding: "0.55rem 0.85rem", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "0.88rem" },
  fileInput: { fontSize: "0.85rem", color: "#4a5568" },
  submitBtn: { background: "#0891b2", color: "#fff", border: "none", padding: "0.5rem 1rem", borderRadius: "7px", fontWeight: 600, cursor: "pointer", alignSelf: "flex-start" },
};
