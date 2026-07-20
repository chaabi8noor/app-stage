// Empty string → relative URLs (Docker/nginx); explicit URL → use it (local dev, Vercel)
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Cache persistant (sessionStorage) + mémoire — TTL 5 minutes
const _mem = {};
const CACHE_TTL = 5 * 60 * 1000;

function saveCache(path, data) {
  const entry = { data, ts: Date.now() };
  _mem[path] = entry;
  try { sessionStorage.setItem("apic_" + path, JSON.stringify(entry)); } catch {}
}

function readCache(path) {
  if (_mem[path] && Date.now() - _mem[path].ts < CACHE_TTL) return _mem[path].data;
  try {
    const raw = sessionStorage.getItem("apic_" + path);
    if (raw) {
      const e = JSON.parse(raw);
      if (Date.now() - e.ts < CACHE_TTL) { _mem[path] = e; return e.data; }
    }
  } catch {}
  return null;
}

// Synchronous — appelé pour initialiser useState sans spinner
export function getCached(path) { return readCache(path); }

// Vide tout le cache — appelé quand on veut forcer un refresh complet
export function clearCache() {
  Object.keys(_mem).forEach(k => delete _mem[k]);
  try { Object.keys(sessionStorage).filter(k => k.startsWith("apic_")).forEach(k => sessionStorage.removeItem(k)); } catch {}
}

function cachedGet(path) {
  const cached = readCache(path);
  if (cached) {
    // Rafraîchit en arrière-plan sans bloquer l'UI
    request(path).then(data => saveCache(path, data)).catch(() => {});
    return Promise.resolve(cached);
  }
  return request(path).then(data => { saveCache(path, data); return data; });
}

function invalidate(...paths) {
  paths.forEach(p => {
    delete _mem[p];
    try { sessionStorage.removeItem("apic_" + p); } catch {}
  });
}

async function request(path, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  login: (email, password) => {
    const form = new URLSearchParams({ username: email, password });
    return fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || "Identifiants invalides");
      }
      return r.json();
    });
  },
  register: (data) => request("/auth/register", { method: "POST", body: JSON.stringify(data) }).then(r => { invalidate("/users/"); return r; }),

  getUsers: () => cachedGet("/users/"),
  updateUser: (id, data) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => { invalidate("/users/"); return r; }),
  deleteUser: (id) => request(`/users/${id}`, { method: "DELETE" }).then(r => { invalidate("/users/"); return r; }),

  getProjects: () => cachedGet("/projects/"),
  createProject: (data) => request("/projects/", { method: "POST", body: JSON.stringify(data) }).then(r => { invalidate("/projects/"); return r; }),
  updateProject: (id, data) => request(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => { invalidate("/projects/"); return r; }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }).then(r => { invalidate("/projects/"); return r; }),
  addMember: (projectId, userId) => request(`/projects/${projectId}/members/${userId}`, { method: "POST" }),
  removeMember: (projectId, userId) => request(`/projects/${projectId}/members/${userId}`, { method: "DELETE" }),

  getTasks: (projectId) => cachedGet(`/tasks/${projectId ? `?project_id=${projectId}` : ""}`).then(r => Array.isArray(r) ? r : r.items ?? []),
  getTasksPaginated: (params = {}) => {
    const qs = Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    return request(`/tasks/?${qs}`);
  },
  createTask: (data) => request("/tasks/", { method: "POST", body: JSON.stringify(data) }).then(r => { invalidate(...Object.keys(_mem).filter(k => k.startsWith("/tasks/"))); return r; }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(r => { invalidate(...Object.keys(_mem).filter(k => k.startsWith("/tasks/"))); return r; }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: "DELETE" }).then(r => { invalidate(...Object.keys(_mem).filter(k => k.startsWith("/tasks/"))); return r; }),
  addTaskAssignee: (id, userId) => request(`/tasks/${id}/assign`, { method: "POST", body: JSON.stringify({ user_id: userId }) }).then(r => { invalidate(...Object.keys(_mem).filter(k => k.startsWith("/tasks/"))); return r; }),
  removeTaskAssignee: (id, userId) => request(`/tasks/${id}/assign/${userId}`, { method: "DELETE" }).then(r => { invalidate(...Object.keys(_mem).filter(k => k.startsWith("/tasks/"))); return r; }),

  getParts: (projectId) => request(`/projects/${projectId}/parts/`),
  createPart: (projectId, data) => request(`/projects/${projectId}/parts/`, { method: "POST", body: JSON.stringify(data) }),
  updatePart: (projectId, partId, data) => request(`/projects/${projectId}/parts/${partId}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePart: (projectId, partId) => request(`/projects/${projectId}/parts/${partId}`, { method: "DELETE" }),
  addTaskToPart: (projectId, partId, data) => request(`/projects/${projectId}/parts/${partId}/tasks`, { method: "POST", body: JSON.stringify(data) }),
  getPartInstances: (projectId, partId) => request(`/projects/${projectId}/parts/${partId}/instances`),

  getLabels: (projectId) => request(`/projects/${projectId}/labels/`),
  createLabel: (projectId, data) => request(`/projects/${projectId}/labels/`, { method: "POST", body: JSON.stringify(data) }),
  deleteLabel: (projectId, labelId) => request(`/projects/${projectId}/labels/${labelId}`, { method: "DELETE" }),

  createSubtask: (taskId, title) => request(`/tasks/${taskId}/subtasks/`, { method: "POST", body: JSON.stringify({ title }) }).then(r => { Object.keys(_mem).filter(k => k.startsWith("/tasks/")).forEach(k => { delete _mem[k]; try { sessionStorage.removeItem("apic_" + k); } catch {} }); return r; }),
  toggleSubtask: (taskId, subtaskId, done) => request(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: "PUT", body: JSON.stringify({ done }) }),
  deleteSubtask: (taskId, subtaskId) => request(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: "DELETE" }).then(r => { Object.keys(_mem).filter(k => k.startsWith("/tasks/")).forEach(k => { delete _mem[k]; try { sessionStorage.removeItem("apic_" + k); } catch {} }); return r; }),

  getComments: (taskId) => request(`/tasks/${taskId}/comments`),
  addComment: (taskId, content) => request(`/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
  deleteComment: (taskId, commentId) => request(`/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }),
  getActivity: (taskId) => request(`/tasks/${taskId}/activity`),

  getStats: () => cachedGet("/stats"),
  getAuditLogs: (page = 1, limit = 50) => request(`/audit/?page=${page}&limit=${limit}`),
  getNotifications: () => request("/notifications/"),
  getUnreadCount: () => request("/notifications/unread-count"),
  markRead: (id) => request(`/notifications/${id}/read`, { method: "PUT" }),
  markAllRead: () => request("/notifications/read-all", { method: "PUT" }),
  getWeeklyReport: (projectId) => request(`/reports/weekly${projectId ? `?project_id=${projectId}` : ""}`),
  getInternFeedback: (internId, projectId) =>
    request(`/feedback/intern/${internId}${projectId ? `?project_id=${projectId}` : ""}`),

  analyzePartCdc: (projectId, partId, file) => {
    const token = localStorage.getItem("token");
    const form = new FormData();
    form.append("file", file);
    form.append("part_id", partId);
    return fetch(`${BASE}/projects/${projectId}/analyze/part`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async r => {
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Erreur analyse"); }
      return r.json();
    });
  },

  analyzeGlobalCdc: (projectId, file) => {
    const token = localStorage.getItem("token");
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/projects/${projectId}/analyze/global`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async r => {
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Erreur analyse"); }
      return r.json();
    });
  },

  createFromProposal: (projectId, parts) =>
    request(`/projects/${projectId}/analyze/create-from-proposal`, { method: "POST", body: JSON.stringify({ parts }) }),

  approveTasks: (projectId, partId, tasks) =>
    request(`/projects/${projectId}/analyze/approve-tasks`, { method: "POST", body: JSON.stringify({ part_id: partId, tasks }) }),

  suggestArchitecture: (projectId) =>
    request(`/projects/${projectId}/analyze/suggest-architecture`, { method: "POST" }),
  saveArchitecture: (projectId, data) =>
    request(`/projects/${projectId}/analyze/architecture`, { method: "PUT", body: JSON.stringify(data) }),
duplicateProject: (projectId, name) =>
  request(`/projects/${projectId}/duplicate`, {
    method: "POST",
    body: JSON.stringify({ name }),
  }),
  getResources: (projectId) => request(`/projects/${projectId}/resources/`),
  deleteResource: (projectId, resourceId) => request(`/projects/${projectId}/resources/${resourceId}`, { method: "DELETE" }),
  uploadResource: (projectId, file) => {
    const token = localStorage.getItem("token");
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/projects/${projectId}/resources/file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }).then(async r => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Erreur upload"); } return r.json(); });
  },
  addResourceLink: (projectId, name, url) => {
    const token = localStorage.getItem("token");
    const form = new FormData();
    form.append("name", name); form.append("url", url);
    return fetch(`${BASE}/projects/${projectId}/resources/link`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form })
      .then(async r => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Erreur"); } return r.json(); });
  },
  addResourceNote: (projectId, name, note_text) => {
    const token = localStorage.getItem("token");
    const form = new FormData();
    form.append("name", name); form.append("note_text", note_text);
    return fetch(`${BASE}/projects/${projectId}/resources/note`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form })
      .then(async r => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Erreur"); } return r.json(); });
  },
  resourceDownloadUrl: (projectId, resourceId) => `${BASE}/projects/${projectId}/resources/${resourceId}/download`,

  logout: (sessionMinutes) => request(`/auth/logout?session_duration=${sessionMinutes}`, { method: "POST" }),
};
