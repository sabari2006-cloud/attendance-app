import { useEffect, useState } from "react";
import { api, formatDate, formatTime } from "../api.js";
import { useAuth } from "../auth.jsx";
import Header from "./Header.jsx";

// Time kooda Google Maps link. Pazhaya records-ku location irukkaadhu.
function TimeWithMap({ time, lat, lng }) {
  if (!time) return formatTime(time);
  const hasLoc = typeof lat === "number" && typeof lng === "number";
  return (
    <>
      {formatTime(time)}
      {hasLoc ? (
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: 8, fontSize: "0.85rem", color: "var(--brand)" }}
        >
          Map
        </a>
      ) : (
        <span className="muted" style={{ marginLeft: 8, fontSize: "0.85rem" }}>(location illa)</span>
      )}
    </>
  );
}

function AttendanceTab() {
  const [rows, setRows] = useState([]);
  const [date, setDate] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/attendance${date ? `?date=${date}` : ""}`).then(setRows).catch((e) => setError(e.message));
  }, [date]);

  const shown = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="filters">
        <input placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search by name" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Filter by date" />
        {date && <button className="btn" onClick={() => setDate("")}>Clear date</button>}
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {shown.length === 0 ? (
        <p className="muted">Records illa.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Date</th><th>Arrival</th><th>Departure</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}<span className="muted"> @{r.username}</span></td>
                  <td>{formatDate(r.date)}</td>
                  <td><TimeWithMap time={r.arrival} lat={r.arrivalLat} lng={r.arrivalLng} /></td>
                  <td><TimeWithMap time={r.departure} lat={r.departureLat} lng={r.departureLng} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function UsersTab() {
  const { user: me, login } = useAuth();
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null); // null | { isNew: true } | existing user
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api("/users").then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const startAdd = () => {
    setEditing({ isNew: true });
    setForm({ name: "", username: "", password: "" });
    setError("");
    setSuccess("");
  };

  const startEdit = (u) => {
    setEditing(u);
    setForm({ name: u.name, username: u.username, password: "" });
    setError("");
    setSuccess("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      if (editing.isNew) {
        const res = await api("/users", { method: "POST", body: JSON.stringify(form) });
        setSuccess(`${res.user.name} add aagiduchu`);
      } else {
        const body = { name: form.name, username: form.username };
        if (form.password) body.password = form.password;
        const res = await api(`/users/${editing.id}`, { method: "PUT", body: JSON.stringify(body) });
        // Admin own account: refresh token + header name
        if (res.token) login(res.token, res.me);
        setSuccess(`${res.user.name} update aagiduchu`);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {success && <p className="success" role="status">{success}</p>}

      {!editing && (
        <div className="filters">
          <button className="btn primary" onClick={startAdd}>Add user</button>
        </div>
      )}

      {editing && (
        <form className="edit-panel" onSubmit={handleSave}>
          <h2>{editing.isNew ? "Add new user" : `Edit ${editing.role === "admin" ? "admin" : "user"}: ${editing.name}`}</h2>
          <div className="field-grid">
            <div>
              <label htmlFor="e-name">Name</label>
              <input id="e-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label htmlFor="e-username">Username</label>
              <input id="e-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" required />
            </div>
            <div>
              <label htmlFor="e-password">{editing.isNew ? "Password" : "New password"}</label>
              <input
                id="e-password"
                type="password"
                placeholder={editing.isNew ? "Kuraindhathu 6 character" : "Maathanum na mattum type pannunga"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
                required={!!editing.isNew}
              />
            </div>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button className="btn primary" disabled={saving}>{saving ? "Saving..." : editing.isNew ? "Add user" : "Save changes"}</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {!editing && error && <p className="error" role="alert">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.id === me.id && <span className="muted"> (you)</span>}</td>
                <td>@{u.username}</td>
                <td><span className={`badge ${u.role}`}>{u.role}</span></td>
                <td><button className="btn small" onClick={() => startEdit(u)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState("attendance");

  return (
    <div className="page">
      <Header title="Admin dashboard" />

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "attendance"} className={`tab ${tab === "attendance" ? "active" : ""}`} onClick={() => setTab("attendance")}>Attendance</button>
        <button role="tab" aria-selected={tab === "users"} className={`tab ${tab === "users" ? "active" : ""}`} onClick={() => setTab("users")}>Manage users</button>
      </div>

      {tab === "attendance" ? <AttendanceTab /> : <UsersTab />}
    </div>
  );
}
