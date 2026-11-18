import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export default function Header({ title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        <span className="muted">{user.name} ({user.role})</span>
      </div>
      <button className="btn" onClick={() => { logout(); navigate("/login"); }}>Log out</button>
    </header>
  );
}
