import { useEffect, useState } from "react";
import { api, getCached } from "../api/client";
import { useAuth } from "../context/AuthContext";
import TaskModal from "../components/TaskModal";

const COLUMNS = [
  { key: "todo", label: "À faire", color: "#f59e0b" },
  { key: "in_progress", label: "En cours", color: "#3b82f6" },
  { key: "done", label: "Terminé", color: "#10b981" },
];

const PRIORITY_FR = { low: "Faible", medium: "Moyenne", high: "Haute" };
const TYPE_ICONS = { task: "✓", bug: "🐛", feature: "✨", story: "📖" };

export default function Kanban() {
  const { user: currentUser } = useAuth();
  const [tasks, setTasks] = useState(() => getCached("/tasks/") || []);
  const [partMembersMap, setPartMembersMap] = useState({}); // part_id → [user]
  const [partModes, setPartModes] = useState({}); // part_id → assignment_mode
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(!getCached("/tasks/"));
  const [openAssignMenu, setOpenAssignMenu] = useState(null); // task id

  async function load() {
    try {
      const t = await api.getTasks();
      setTasks(t);
      // Build part members map from unique part_ids in tasks
      const partIds = [...new Set(t.map(tk => tk.part_id).filter(Boolean))];
      const memberMap = {};
      const modeMap = {};
      await Promise.all(partIds.map(async pid => {
        // Get all parts for the project this part belongs to
        const task = t.find(tk => tk.part_id === pid);
        if (!task) return;
        const parts = await api.getParts(task.project_id);
        const part = parts.find(p => p.id === pid);
        if (part) {
          memberMap[pid] = part.interns || (part.assignee ? [part.assignee] : []);
          modeMap[pid] = part.assignment_mode;
        }
      }));
      setPartMembersMap(memberMap);
      setPartModes(modeMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleStatusChange(taskId, status) {
    await api.updateTask(taskId, { status });
    load();
  }

  async function handleToggleAssignee(e, taskId, userId, isAssigned) {
    e.stopPropagation();
    if (isAssigned) {
      await api.removeTaskAssignee(taskId, userId);
    } else {
      await api.addTaskAssignee(taskId, userId);
    }
    setOpenAssignMenu(null);
    load();
  }

  if (loading) return <p style={{ padding: "2rem", color: "#718096" }}>Chargement...</p>;

  const now = new Date();
  const overdueCount = tasks.filter(t => t.deadline && new Date(t.deadline) < now && t.status !== "done").length;

  return (
    <div onClick={() => setOpenAssignMenu(null)}>
      <h1 style={styles.heading}>Mon Tableau Kanban</h1>
      <p style={styles.sub}>
        {tasks.length} tâche{tasks.length !== 1 ? "s" : ""}
        {overdueCount > 0 && <span style={styles.overdueCount}> · {overdueCount} en retard</span>}
      </p>

      {tasks.length === 0 && (
        <div style={styles.emptyState}>
          Aucune tâche pour le moment. Vos tâches apparaîtront ici une fois assignées.
        </div>
      )}

      <div style={styles.board}>
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.key);
          return (
            <div key={col.key} style={styles.column}>
              <div style={{ ...styles.colHeader, borderTop: `3px solid ${col.color}` }}>
                <span style={{ color: col.color, fontWeight: 700 }}>{col.label}</span>
                <span style={styles.count}>{colTasks.length}</span>
              </div>

              {colTasks.map(task => {
                const isOverdue = task.deadline && new Date(task.deadline) < now && task.status !== "done";
                const partMembers = (task.part_id && partMembersMap[task.part_id]) || [];

                return (
                  <div
                    key={task.id}
                    style={{ ...styles.card, ...(isOverdue ? styles.overdueCard : {}) }}
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
                    <div style={styles.titleRow}>
                      <span style={styles.typeIcon}>{TYPE_ICONS[task.task_type] || "✓"}</span>
                      <span style={styles.cardTitle}>{task.title}</span>
                      {task.story_points && <span style={styles.pointsBadge}>{task.story_points}</span>}
                    </div>
                    {task.description && <div style={styles.cardDesc}>{task.description}</div>}
                    <div style={styles.cardMeta}>
                      <span style={{ ...styles.chip, ...priorityColor(task.priority) }}>{PRIORITY_FR[task.priority] || task.priority}</span>
                      {task.deadline && (
                        <span style={{ ...styles.chip, color: isOverdue ? "#e53e3e" : "#718096" }}>
                          Échéance {new Date(task.deadline).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                      {task.subtasks?.length > 0 && (
                        <span style={styles.chip}>{task.subtasks.filter(s => s.done).length}/{task.subtasks.length} ✓</span>
                      )}
                    </div>

                    {/* Assignee row */}
                    {partMembers.length > 0 && partModes[task.part_id] === "collaborative" && (
                      <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
                        <div style={styles.assigneeRow}>
                          {(task.assignees?.length > 0 ? task.assignees : []).map(u => (
                            <span key={u.id} style={styles.avatar} title={u.name}>
                              {u.name[0].toUpperCase()}
                            </span>
                          ))}
                          {(!task.assignees || task.assignees.length === 0) && (
                            <span style={styles.noAssignee}>Non assigné</span>
                          )}
                          <button
                            style={styles.assignBtn}
                            onClick={e => { e.stopPropagation(); setOpenAssignMenu(openAssignMenu === task.id ? null : task.id); }}
                          >
                            Assigner ▾
                          </button>
                        </div>

                        {openAssignMenu === task.id && (
                          <div style={styles.dropdown} onClick={e => e.stopPropagation()}>
                            {partMembers.map(u => {
                              const isAssigned = task.assignees?.some(a => a.id === u.id);
                              const isMe = u.id === currentUser?.id;
                              return (
                                <div
                                  key={u.id}
                                  style={{ ...styles.dropdownOption, background: isAssigned ? "#ede9fe" : "#fff" }}
                                  onClick={e => handleToggleAssignee(e, task.id, u.id, isAssigned)}
                                >
                                  <span style={styles.avatar}>{u.name[0].toUpperCase()}</span>
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

                    <div style={styles.moveRow}>
                      {["todo", "in_progress", "done"].filter(s => s !== col.key).map(s => (
                        <button key={s} style={styles.moveBtn} onClick={e => { e.stopPropagation(); handleStatusChange(task.id, s); }}>
                          → {s === "todo" ? "À faire" : s === "in_progress" ? "En cours" : "Terminé"}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {colTasks.length === 0 && (
                <div style={styles.empty}>Aucune tâche</div>
              )}
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => { setSelectedTask(null); load(); }}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

function priorityColor(p) {
  return { low: { background: "#d1fae5", color: "#065f46" }, medium: { background: "#fef3c7", color: "#92400e" }, high: { background: "#fee2e2", color: "#991b1b" } }[p] || {};
}

const styles = {
  heading: { fontSize: "1.6rem", fontWeight: 700, color: "#1a202c", margin: 0 },
  sub: { color: "#718096", marginBottom: "1.5rem", marginTop: "0.25rem" },
  overdueCount: { color: "#e53e3e", fontWeight: 600 },
  emptyState: { background: "#fff", borderRadius: "10px", padding: "3rem", textAlign: "center", color: "#a0aec0", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", marginBottom: "1.5rem" },
  board: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", alignItems: "start" },
  column: { background: "#f7f8fc", borderRadius: "10px", padding: "0.75rem" },
  colHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", borderRadius: "8px 8px 0 0", marginBottom: "0.75rem", background: "#fff" },
  count: { background: "#e2e8f0", color: "#4a5568", borderRadius: "999px", padding: "0.1rem 0.5rem", fontSize: "0.8rem", fontWeight: 700 },
  card: { background: "#fff", borderRadius: "8px", padding: "0.85rem", marginBottom: "0.65rem", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", border: "1px solid transparent" },
  overdueCard: { border: "1px solid #fca5a5", background: "#fff5f5" },
  labelBar: { display: "flex", gap: "3px", marginBottom: "0.35rem" },
  labelDot: { height: "4px", flex: 1, borderRadius: "2px", minWidth: "18px", maxWidth: "40px" },
  overdueTag: { fontSize: "0.62rem", fontWeight: 700, color: "#e53e3e", marginBottom: "0.2rem", letterSpacing: "0.04em" },
  titleRow: { display: "flex", alignItems: "flex-start", gap: "0.3rem", marginBottom: "0.25rem" },
  typeIcon: { fontSize: "0.75rem", flexShrink: 0, marginTop: "1px" },
  cardTitle: { fontWeight: 600, color: "#1a202c", fontSize: "0.9rem", flex: 1 },
  pointsBadge: { background: "#ede9fe", color: "#4f46e5", borderRadius: "999px", fontSize: "0.65rem", fontWeight: 700, padding: "0.1rem 0.4rem" },
  cardDesc: { fontSize: "0.78rem", color: "#718096", marginBottom: "0.5rem" },
  cardMeta: { display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.5rem" },
  chip: { fontSize: "0.68rem", padding: "0.15rem 0.45rem", borderRadius: "999px", background: "#e2e8f0", fontWeight: 600 },
  assigneeRow: { display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.4rem", flexWrap: "wrap" },
  avatar: { width: "20px", height: "20px", borderRadius: "50%", background: "#4f46e5", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: 700, flexShrink: 0 },
  noAssignee: { fontSize: "0.68rem", color: "#a0aec0", fontStyle: "italic" },
  assignBtn: { fontSize: "0.68rem", padding: "0.15rem 0.5rem", borderRadius: "5px", border: "1px solid #4f46e5", background: "#ede9fe", color: "#4f46e5", cursor: "pointer", fontWeight: 600, marginLeft: "auto" },
  dropdown: { position: "absolute", top: "calc(100% + 2px)", left: 0, zIndex: 200, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: "170px", overflow: "hidden" },
  dropdownOption: { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", cursor: "pointer", borderBottom: "1px solid #f0f0f0" },
  moveRow: { display: "flex", gap: "0.3rem", flexWrap: "wrap" },
  moveBtn: { fontSize: "0.68rem", padding: "0.15rem 0.4rem", borderRadius: "5px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#4a5568" },
  empty: { color: "#cbd5e0", textAlign: "center", padding: "1.5rem 0", fontSize: "0.85rem" },
};
