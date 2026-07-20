import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h1 style={styles.title}>3LM Solutions</h1>
        <p style={styles.subtitle}>Connectez-vous à votre compte</p>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input style={styles.input} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  wrapper: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f4f8" },
  card: { background: "#fff", padding: "2.5rem", borderRadius: "12px", boxShadow: "0 4px 24px rgba(0,0,0,0.1)", width: "360px" },
  title: { margin: 0, fontSize: "1.8rem", fontWeight: 700, color: "#1a202c" },
  subtitle: { color: "#718096", marginTop: "0.25rem", marginBottom: "1.5rem" },
  form: { display: "flex", flexDirection: "column", gap: "1rem" },
  input: { padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "1rem", outline: "none" },
  btn: { padding: "0.75rem", borderRadius: "8px", border: "none", background: "#4f46e5", color: "#fff", fontWeight: 600, fontSize: "1rem", cursor: "pointer" },
  error: { color: "#e53e3e", fontSize: "0.875rem", margin: 0 },
};
