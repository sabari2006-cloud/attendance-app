import { useEffect, useState } from "react";
import { api, formatDate, formatTime } from "../api.js";
import Header from "./Header.jsx";

// Browser location edukkum. Allow pannala na error message varum.
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Indha browser la location support illa. Vera browser use pannunga"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("Location allow pannunga. Address bar la lock icon click panni, Location ah Allow pannitu thirumba try pannunga"));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("Location edukka neram aachu. Thirumba try pannunga"));
        } else {
          reject(new Error("Location kedaikkala. GPS / internet on la irukkanu paarunga"));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export default function UserDashboard() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api("/attendance/me").then(setRecords).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const mark = async (type) => {
    setError("");
    setBusy(true);
    try {
      const loc = await getLocation();
      await api(`/attendance/${type}`, { method: "POST", body: JSON.stringify(loc) });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const todayStr = new Date().toLocaleDateString("en-CA");
  const todayRec = records.find((r) => r.date === todayStr);

  return (
    <div className="page">
      <Header title="My attendance" />

      <section className="today">
        <div className="time-block arrival">
          <span className="muted">Arrival today</span>
          <strong>{formatTime(todayRec?.arrival)}</strong>
          <button className="btn primary" disabled={busy || !!todayRec} onClick={() => mark("arrival")}>
            {busy ? "Location edukkudhu..." : "Mark arrival"}
          </button>
        </div>
        <div className="time-block departure">
          <span className="muted">Departure today</span>
          <strong>{formatTime(todayRec?.departure)}</strong>
          <button className="btn" disabled={busy || !todayRec || !!todayRec?.departure} onClick={() => mark("departure")}>
            {busy ? "Location edukkudhu..." : "Mark departure"}
          </button>
        </div>
      </section>

      <p className="muted" style={{ marginTop: 12 }}>
        Arrival / departure mark panna location venum. Browser kekkum pothu Allow pannunga.
      </p>

      {error && <p className="error" role="alert">{error}</p>}

      <h2>History</h2>
      {records.length === 0 ? (
        <p className="muted">Innum records illa. Mudhalla arrival mark pannunga.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Arrival</th><th>Departure</th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td>{formatTime(r.arrival)}</td>
                  <td>{formatTime(r.departure)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
