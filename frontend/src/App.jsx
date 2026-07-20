import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Tasks from "./pages/Tasks";
import Interns from "./pages/Interns";
import Kanban from "./pages/Kanban";
import Timeline from "./pages/Timeline";
import Rapports from "./pages/Rapports";
import FeedbackIA from "./pages/FeedbackIA";
import AuditLog from "./pages/AuditLog";

function PrivateRoute({ children, adminOnly = false }) {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && !isAdmin) return <Navigate  to="/" />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/projects" element={<PrivateRoute><Projects /></PrivateRoute>} />
      <Route path="/projects/:id" element={<PrivateRoute><ProjectDetail /></PrivateRoute>} />
      <Route path="/tasks" element={<PrivateRoute><Tasks /></PrivateRoute>} />
      <Route path="/interns" element={<PrivateRoute adminOnly><Interns /></PrivateRoute>} />
      <Route path="/kanban" element={<PrivateRoute><Kanban /></PrivateRoute>} />
      <Route path="/timeline" element={<PrivateRoute adminOnly><Timeline /></PrivateRoute>} />
      <Route path="/rapports" element={<PrivateRoute adminOnly><Rapports /></PrivateRoute>} />
      <Route path="/feedback" element={<PrivateRoute adminOnly><FeedbackIA /></PrivateRoute>} />
      <Route path="/audit" element={<PrivateRoute adminOnly><AuditLog /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
