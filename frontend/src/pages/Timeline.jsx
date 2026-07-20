import { useEffect, useState } from "react";
import { api } from "../api/client";
import TaskModal from "../components/TaskModal";

const STATUS_COLOR = {
  todo: { bg: "#e2e8f0", fill: "#94a3b8", label: "À faire" },
  in_progress: { bg: "#dbeafe", fill: "#3b82f6", label: "En cours" },
  done: { bg: "#d1fae5", fill: "#10b981", label: "Terminé" },
};

const AVATAR_COLORS = ["#4f46e5","#059669","#d97706","#e53e3e","#7c3aed","#0284c7","#be185d","#0f766e"];
function avatarColor(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getWeeks(start, end) {
  const weeks = [];
  let cur = new Date(start);
  cur.setDate(cur.getDate() - cur.getDay() + 1); // Monday
  while (cur <= end) {
    weeks.push(new Date(cur));
    cur = addDays(cur, 7);
  }
  return weeks;
}

export default function Timeline() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [parts, setParts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const today = new Date();

  useEffect(() => {
    api.getProjects().then(setProjects).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    Promise.all([api.getParts(selectedProject), api.getTasks(selectedProject)])
      .then(([p, t]) => { setParts(p); setTasks(t); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedProject]);

  // Compute date range
  const datesWithTasks = tasks.filter(t => t.start_date || t.deadline);
  const minDate = datesWithTasks.length
    ? new Date(Math.min(...datesWithTasks.map(t => new Date(t.start_date || t.deadline))))
    : addDays(today, -7);
  const maxDate = datesWithTasks.length
    ? new Date(Math.max(...datesWithTasks.map(t => new Date(t.deadline || t.start_date))))
    : addDays(today, 30);

  const rangeStart = addDays(minDate, -3);
  const rangeEnd = addDays(maxDate, 3);
  const totalDays = Math.max((rangeEnd - rangeStart) / 86400000, 1);
  const weeks = getWeeks(rangeStart, rangeEnd);

  function pct(date) {
    return Math.max(0, Math.min(100, ((new Date(date) - rangeStart) / 86400000 / totalDays) * 100));
  }

  function barStyle(task) {
    if (!task.start_date && !task.deadline) return null;
    const left = pct(task.start_date || task.deadline);
    const right = task.deadline ? pct(task.deadline) : left + 3;
    const width = Math.max(right - left, 1.5);
    const isOverdue = task.deadline && new Date(task.deadline) < today && task.status !== "done";
    const color = isOverdue ? "#ef4444" : STATUS_COLOR[task.status]?.fill || "#94a3b8";
    return { left: `${left}%`, width: `${width}%`, background: color };
  }

  const todayPct = pct(today);
  const partsWithTasks = parts.map(p => ({
    ...p,
    partTasks: tasks.filter(t => t.part_id === p.id),
  })).filter(p => p.partTasks.length > 0 || p.id);

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.heading}>Timeline</h1>
          <p style={s.sub}>Vue Gantt de l'avancement des tâches par partie et stagiaire</p>
        </div>
        <select style={s.projectSelect} value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
          <option value="">— Choisir un projet</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Legend */}
      <div style={s.legend}>
        {Object.entries(STATUS_COLOR).map(([key, val]) => (
          <div key={key} style={s.legendItem}>
            <div style={{ ...s.legendDot, background: val.fill }} />
            <span>{val.label}</span>
          </div>
        ))}
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: "#ef4444" }} />
          <span>En retard</span>
        </div>
        <div style={{ ...s.legendItem, marginLeft: "auto" }}>
          <div style={{ ...s.legendDot, background: "#f97316", borderRadius: 0, width: "2px", height: "14px" }} />
          <span>Aujourd'hui</span>
        </div>
      </div>

      {!selectedProject && (
        <div style={s.empty}>Sélectionnez un projet pour voir la timeline</div>
      )}

      {selectedProject && loading && (
        <div style={s.empty}>Chargement...</div>
      )}

      {selectedProject && !loading && (
        <div style={s.gantt}>
          {/* Header: week labels */}
          <div style={s.ganttHeader}>
            <div style={s.labelCol} />
            <div style={s.timelineCol}>
              <div style={s.weeksRow}>
                {weeks.map((w, i) => (
                  <div key={i} style={{ ...s.weekLabel, left: `${pct(w)}%` }}>
                    {w.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                  </div>
                ))}
                {/* Week lines */}
                {weeks.map((w, i) => (
                  <div key={`line-${i}`} style={{ ...s.weekLine, left: `${pct(w)}%` }} />
                ))}
                {/* Today line */}
                <div style={{ ...s.todayLine, left: `${todayPct}%` }} />
              </div>
            </div>
          </div>

          {/* Parts + tasks */}
          {partsWithTasks.length === 0 && (
            <div style={{ ...s.empty, margin: "1rem" }}>Aucune tâche avec dates dans ce projet.<br/>Ajoutez des dates de début et d'échéance aux tâches.</div>
          )}

          {partsWithTasks.map(part => (
            <div key={part.id}>
              {/* Part header row */}
              <div style={s.partRow}>
                <div style={s.partLabelCol}>
                  <div style={s.partLabel}>
                    {part.assignee && (
                      <div style={{ ...s.avatar, background: avatarColor(part.assignee.name) }}>
                        {part.assignee.name[0]}
                      </div>
                    )}
                    <div>
                      <div style={s.partName}>{part.name}</div>
                      {part.assignee && <div style={s.internName}>{part.assignee.name}</div>}
                    </div>
                  </div>
                </div>
                <div style={s.partTimelineCol}>
                  <div style={s.weekLines}>
                    {weeks.map((w, i) => <div key={i} style={{ ...s.weekLine, left: `${pct(w)}%` }} />)}
                    <div style={{ ...s.todayLine, left: `${todayPct}%` }} />
                  </div>
                </div>
              </div>

              {/* Task rows */}
              {part.partTasks.map(task => {
                const bar = barStyle(task);
                const isOverdue = task.deadline && new Date(task.deadline) < today && task.status !== "done";
                return (
                  <div key={task.id} style={s.taskRow} onClick={() => setSelectedTask(task)}>
                    <div style={s.taskLabelCol}>
                      <span style={{ ...s.taskStatusDot, background: isOverdue ? "#ef4444" : STATUS_COLOR[task.status]?.fill }} />
                      <span style={s.taskLabel} title={task.title}>{task.title}</span>
                    </div>
                    <div style={s.taskTimelineCol}>
                      <div style={s.weekLines}>
                        {weeks.map((w, i) => <div key={i} style={{ ...s.weekLine, left: `${pct(w)}%` }} />)}
                        <div style={{ ...s.todayLine, left: `${todayPct}%` }} />
                      </div>
                      {bar && (
                        <div style={{ ...s.bar, ...bar }} title={`${task.title} — ${task.status}`}>
                          <span style={s.barLabel}>{task.title}</span>
                        </div>
                      )}
                      {!bar && (
                        <div style={s.noDate}>— pas de date —</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          projectId={selectedProject}
          onClose={() => { setSelectedTask(null); }}
          onStatusChange={async (taskId, status) => {
            await api.updateTask(taskId, { status });
            const t = await api.getTasks(selectedProject);
            setTasks(t);
          }}
        />
      )}
    </div>
  );
}

const s = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" },
  heading: { fontSize: "1.6rem", fontWeight: 700, color: "#1a202c", margin: 0 },
  sub: { color: "#718096", fontSize: "0.875rem", marginTop: "0.25rem" },
  projectSelect: { padding: "0.65rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.95rem", minWidth: "220px" },
  legend: { display: "flex", gap: "1.25rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" },
  legendItem: { display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", color: "#4a5568" },
  legendDot: { width: "12px", height: "12px", borderRadius: "3px" },
  empty: { background: "#fff", borderRadius: "10px", padding: "3rem", textAlign: "center", color: "#a0aec0", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", lineHeight: 2 },
  gantt: { background: "#fff", borderRadius: "12px", boxShadow: "0 1px 8px rgba(0,0,0,0.08)", overflow: "hidden" },
  ganttHeader: { display: "flex", borderBottom: "2px solid #e2e8f0", background: "#f7f8fc" },
  labelCol: { width: "220px", flexShrink: 0, padding: "0.75rem 1rem", fontSize: "0.75rem", fontWeight: 700, color: "#718096" },
  timelineCol: { flex: 1, position: "relative", height: "36px" },
  weeksRow: { position: "relative", height: "100%", overflow: "hidden" },
  weekLabel: { position: "absolute", top: "8px", fontSize: "0.7rem", color: "#718096", transform: "translateX(-50%)", whiteSpace: "nowrap" },
  weekLine: { position: "absolute", top: 0, bottom: 0, width: "1px", background: "#e2e8f0" },
  todayLine: { position: "absolute", top: 0, bottom: 0, width: "2px", background: "#f97316", zIndex: 10 },

  partRow: { display: "flex", background: "#f0f4f8", borderTop: "1px solid #e2e8f0" },
  partLabelCol: { width: "220px", flexShrink: 0, padding: "0.65rem 1rem" },
  partLabel: { display: "flex", alignItems: "center", gap: "0.5rem" },
  partTimelineCol: { flex: 1, position: "relative", height: "40px" },
  avatar: { width: "24px", height: "24px", borderRadius: "50%", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 700, flexShrink: 0 },
  partName: { fontWeight: 700, fontSize: "0.82rem", color: "#1a202c" },
  internName: { fontSize: "0.72rem", color: "#4f46e5" },

  taskRow: { display: "flex", borderTop: "1px solid #f0f0f0", cursor: "pointer", transition: "background 0.15s" },
  taskLabelCol: { width: "220px", flexShrink: 0, padding: "0.5rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem" },
  taskStatusDot: { width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0 },
  taskLabel: { fontSize: "0.78rem", color: "#2d3748", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" },
  taskTimelineCol: { flex: 1, position: "relative", height: "36px" },
  weekLines: { position: "absolute", inset: 0 },
  bar: { position: "absolute", top: "8px", height: "20px", borderRadius: "4px", cursor: "pointer", display: "flex", alignItems: "center", overflow: "hidden", zIndex: 5, transition: "opacity 0.15s" },
  barLabel: { fontSize: "0.65rem", color: "#fff", fontWeight: 600, padding: "0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  noDate: { position: "absolute", top: "10px", left: "8px", fontSize: "0.7rem", color: "#cbd5e0", fontStyle: "italic" },
};

