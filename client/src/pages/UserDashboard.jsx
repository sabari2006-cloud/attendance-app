import { useEffect, useState } from "react";
import { api, formatDate, formatTime } from "../api.js";
import Header from "./Header.jsx";

export default function UserDashboard() {
  const [records, setRecords] = useState([]);
  const [error, setError] = useState("");

  const load = () => api("/attendance/me").then(setRecords).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const mark = async (type) => {
    setError("");
    try {
      await api(`/attendance/${type}`, { method: "POST" });
      load();
    } catch (e) {
      setError(e.message);
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
          <button className="btn primary" disabled={!!todayRec} onClick={() => mark("arrival")}>Mark arrival</button>
        </div>
        <div className="time-block departure">
          <span className="muted">Departure today</span>
          <strong>{formatTime(todayRec?.departure)}</strong>
          <button className="btn" disabled={!todayRec || !!todayRec?.departure} onClick={() => mark("departure")}>Mark departure</button>
        </div>
      </section>

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
