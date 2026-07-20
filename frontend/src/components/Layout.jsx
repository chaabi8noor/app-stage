import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

const MOBILE_BP = 768;

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BP);
  const [open, setOpen] = useState(window.innerWidth >= MOBILE_BP);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const notifRef = useRef(null);

  useEffect(() => {
    function onResize() {
      const mobile = window.innerWidth < MOBILE_BP;
      setIsMobile(mobile);
      setOpen(!mobile);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    // Track session start time
    if (!sessionStorage.getItem("_session_start")) {
      sessionStorage.setItem("_session_start", Date.now().toString());
    }
    api.getUnreadCount().then(d => setUnread(d.count)).catch(() => {});
    const interval = setInterval(() => {
      api.getUnreadCount().then(d => setUnread(d.count)).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    api.getNotifications().then(setNotifications).catch(() => {});
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  function openNotif() {
    setNotifOpen(o => !o);
  }

  async function markAllRead() {
    await api.markAllRead().catch(() => {});
    setNotifications(n => n.map(x => ({ ...x, read: true })));
    setUnread(0);
  }

  function handleLogout() {
    const start = parseInt(sessionStorage.getItem("_session_start") || "0");
    const minutes = start ? Math.round((Date.now() - start) / 60000) : 0;
    sessionStorage.removeItem("_session_start");
    api.logout(minutes).catch(() => {});
    logout();
    navigate("/login");
  }
  function navClick() { if (isMobile) setOpen(false); }

  const navItems = isAdmin
    ? [
        { to: "/", label: "Tableau de bord" },
        { to: "/projects", label: "Projets" },
        { to: "/tasks", label: "Tâches" },
        { to: "/interns", label: "Stagiaires" },
        { to: "/timeline", label: "Timeline" },
        { to: "/rapports", label: "Rapports" },
        { to: "/feedback", label: "Feedback IA" },
        { to: "/audit", label: "Journal d'audit" },
      ]
    : [
        { to: "/", label: "Tableau de bord" },
        { to: "/kanban", label: "Mon Kanban" },
        { to: "/projects", label: "Mes Projets" },
        { to: "/tasks", label: "Mes Tâches" },
      ];

  const pageLabel = navItems.find(i => i.to === location.pathname)?.label ?? "3LM Solutions";

  const sidebarContent = (
    <>
      {isMobile && (
        <button style={s.sideClose} onClick={() => setOpen(false)}>✕</button>
      )}
      <div style={s.logo}>
        <img src="/logo.svg" alt="logo" style={{ width: "42px", height: "42px", borderRadius: "50%", display: "block", margin: "0 auto 0.5rem" }} />
        <span>3LM Solutions</span>
      </div>
      <nav style={s.nav}>
        {navItems.map(item => (
          <Link
            key={item.to}
            to={item.to}
            onClick={navClick}
            style={{ ...s.navLink, ...(location.pathname === item.to ? s.navActive : {}) }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div style={s.userSection}>
        <div style={s.userName}>{user?.name}</div>
        <div style={s.userRole}>{user?.role === "admin" ? "Administrateur" : "Stagiaire"}</div>
        <button onClick={handleLogout} style={s.logoutBtn}>Déconnexion</button>
      </div>
    </>
  );

  return (
    <div style={s.shell}>

      {/* ── DESKTOP sidebar: fixed, slides in/out ── */}
      {!isMobile && (
        <aside style={{ ...s.desktopSidebar, transform: open ? "translateX(0)" : "translateX(-220px)" }}>
          {sidebarContent}
        </aside>
      )}

      {/* ── MOBILE sidebar: fixed overlay ── */}
      {isMobile && (
        <>
          {open && <div style={s.backdrop} onClick={() => setOpen(false)} />}
          <aside style={{ ...s.mobileSidebar, transform: open ? "translateX(0)" : "translateX(-100%)" }}>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* ── Main area ── */}
      <div style={{ ...s.mainWrap, marginLeft: !isMobile && open ? "220px" : "0", transition: "margin-left 0.25s ease" }}>
        <header style={s.topbar}>
          <button style={s.menuBtn} onClick={() => setOpen(o => !o)}>☰</button>
          <span style={s.pageTitle}>{pageLabel}</span>
          <div style={{ position: "relative" }} ref={notifRef}>
            <button style={s.bellBtn} onClick={openNotif} title="Notifications">
              🔔
              {unread > 0 && (
                <span style={s.badge}>{unread > 9 ? "9+" : unread}</span>
              )}
            </button>
            {notifOpen && (
              <div style={s.notifDropdown}>
                <div style={s.notifHeader}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Notifications</span>
                  {unread > 0 && (
                    <button style={s.markAllBtn} onClick={markAllRead}>Tout marquer lu</button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div style={s.notifEmpty}>Aucune notification</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} style={{ ...s.notifItem, background: n.read ? "#fff" : "#f0f4ff" }}>
                      <div style={s.notifMsg}>{n.message}</div>
                      <div style={s.notifTime}>{new Date(n.created_at).toLocaleString("fr-FR")}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <span style={s.topUser}>{user?.name}</span>
        </header>
        <main style={s.main}>{children}</main>
      </div>

    </div>
  );
}

const s = {
  shell: { display: "flex", minHeight: "100vh", background: "#f7f8fc" },

  desktopWrapper: {
    flexShrink: 0,
    minWidth: 0,
    overflow: "hidden",
    transition: "width 0.25s ease",
  },

  desktopSidebar: {
    width: "220px",
    height: "100vh",
    position: "fixed",
    top: 0,
    left: 0,
    overflowY: "auto",
    background: "#1e1b4b",
    display: "flex",
    flexDirection: "column",
    padding: "1.5rem 1rem",
    boxSizing: "border-box",
    zIndex: 200,
    transition: "transform 0.25s ease",
  },

  mobileSidebar: {
    position: "fixed",
    top: 0, left: 0,
    width: "220px",
    height: "100vh",
    background: "#1e1b4b",
    display: "flex",
    flexDirection: "column",
    padding: "1.5rem 1rem",
    boxSizing: "border-box",
    zIndex: 300,
    transition: "transform 0.25s ease",
    overflowY: "auto",
  },

  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 299 },

  sideClose: { alignSelf: "flex-end", background: "none", border: "none", color: "#a5b4fc", fontSize: "1.1rem", cursor: "pointer", padding: "0.2rem 0.4rem", marginBottom: "0.5rem" },
  logo: { color: "#fff", fontSize: "1.1rem", fontWeight: 700, marginBottom: "2rem", textAlign: "center" },
  nav: { display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 },
  navLink: { color: "#a5b4fc", textDecoration: "none", padding: "0.6rem 0.75rem", borderRadius: "8px", fontSize: "0.92rem", display: "block", whiteSpace: "nowrap" },
  navActive: { background: "#4f46e5", color: "#fff" },
  userSection: { borderTop: "1px solid #312e81", paddingTop: "1rem" },
  userName: { color: "#e0e7ff", fontWeight: 600, fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  userRole: { color: "#818cf8", fontSize: "0.75rem", marginBottom: "0.75rem" },
  logoutBtn: { background: "transparent", border: "1px solid #4f46e5", color: "#a5b4fc", padding: "0.4rem 0.75rem", borderRadius: "6px", cursor: "pointer", fontSize: "0.82rem", width: "100%" },

  mainWrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: { display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.7rem 1.25rem", background: "#fff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 100 },
  menuBtn: { background: "none", border: "1px solid #e2e8f0", borderRadius: "7px", cursor: "pointer", fontSize: "1.1rem", padding: "0.25rem 0.6rem", color: "#4a5568", flexShrink: 0 },
  pageTitle: { fontWeight: 600, color: "#1a202c", fontSize: "1rem", flex: 1 },
  topUser: { fontSize: "0.8rem", color: "#718096", whiteSpace: "nowrap" },
  main: { flex: 1, padding: "1.5rem", overflowX: "hidden" },

  bellBtn: { position: "relative", background: "none", border: "1px solid #e2e8f0", borderRadius: "7px", cursor: "pointer", fontSize: "1rem", padding: "0.25rem 0.6rem", color: "#4a5568", flexShrink: 0 },
  badge: { position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", color: "#fff", borderRadius: "999px", fontSize: "0.62rem", fontWeight: 700, padding: "0 4px", minWidth: "16px", textAlign: "center", lineHeight: "16px" },
  notifDropdown: { position: "absolute", right: 0, top: "calc(100% + 8px)", width: "320px", background: "#fff", borderRadius: "10px", boxShadow: "0 4px 24px rgba(0,0,0,0.13)", border: "1px solid #e2e8f0", zIndex: 200, maxHeight: "400px", overflowY: "auto" },
  notifHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid #f0f0f0" },
  markAllBtn: { background: "none", border: "none", color: "#4f46e5", fontSize: "0.78rem", cursor: "pointer", fontWeight: 600 },
  notifEmpty: { padding: "1.5rem", textAlign: "center", color: "#a0aec0", fontSize: "0.85rem" },
  notifItem: { padding: "0.75rem 1rem", borderBottom: "1px solid #f7f8fc" },
  notifMsg: { fontSize: "0.85rem", color: "#1a202c", marginBottom: "0.25rem" },
  notifTime: { fontSize: "0.72rem", color: "#a0aec0" },
};
