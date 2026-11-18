export async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== "/login") {
      localStorage.clear();
      window.location.href = "/login";
    }
    throw new Error(data.message || "Edho thappu nadanthuduchu");
  }
  return data;
}

export const formatTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

export const formatDate = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
