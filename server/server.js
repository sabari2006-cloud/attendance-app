const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";
const DB_FILE = path.join(__dirname, "db.json");

// ---------- simple JSON file "database" ----------
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD

function seed() {
  const day = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toLocaleDateString("en-CA");
  };
  const at = (date, h, m) => new Date(`${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).toISOString();
  const db = {
    users: [
      { id: 1, name: "Admin", username: "admin", role: "admin", password: bcrypt.hashSync("admin123", 10) },
      { id: 2, name: "Ravi Kumar", username: "ravi", role: "user", password: bcrypt.hashSync("user123", 10) },
      { id: 3, name: "Priya S", username: "priya", role: "user", password: bcrypt.hashSync("user123", 10) },
    ],
    attendance: [
      { id: 1, userId: 2, date: day(1), arrival: at(day(1), 9, 5), departure: at(day(1), 18, 2) },
      { id: 2, userId: 3, date: day(1), arrival: at(day(1), 9, 30), departure: at(day(1), 17, 45) },
      { id: 3, userId: 2, date: day(2), arrival: at(day(2), 9, 12), departure: at(day(2), 18, 10) },
    ],
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  return db;
}

const load = () => (fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf8")) : seed());
const save = (db) => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// ---------- auth middleware ----------
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Login pannunga" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Session mudinjiduchu, thirumba login pannunga" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin ku mattum" });
  next();
}

// ---------- routes ----------
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const db = load();
  const user = db.users.find((u) => u.username === (username || "").trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || "", user.password)) {
    return res.status(401).json({ message: "Username allathu password thappu" });
  }
  const payload = { id: user.id, name: user.name, role: user.role };
  const token = jwt.sign(payload, SECRET, { expiresIn: "8h" });
  res.json({ token, user: payload });
});

// User: own attendance records
app.get("/api/attendance/me", auth, (req, res) => {
  const db = load();
  const records = db.attendance
    .filter((a) => a.userId === req.user.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json(records);
});

// User: mark arrival
app.post("/api/attendance/arrival", auth, (req, res) => {
  const db = load();
  const existing = db.attendance.find((a) => a.userId === req.user.id && a.date === today());
  if (existing) return res.status(400).json({ message: "Innaiku arrival already mark panniyachu" });
  const record = {
    id: Date.now(),
    userId: req.user.id,
    date: today(),
    arrival: new Date().toISOString(),
    departure: null,
  };
  db.attendance.push(record);
  save(db);
  res.json(record);
});

// User: mark departure
app.post("/api/attendance/departure", auth, (req, res) => {
  const db = load();
  const record = db.attendance.find((a) => a.userId === req.user.id && a.date === today());
  if (!record) return res.status(400).json({ message: "Mudhalla arrival mark pannunga" });
  if (record.departure) return res.status(400).json({ message: "Innaiku departure already mark panniyachu" });
  record.departure = new Date().toISOString();
  save(db);
  res.json(record);
});

// Admin: all users' attendance (optional ?date=YYYY-MM-DD)
app.get("/api/attendance", auth, adminOnly, (req, res) => {
  const db = load();
  let records = db.attendance;
  if (req.query.date) records = records.filter((a) => a.date === req.query.date);
  const rows = records
    .map((a) => {
      const u = db.users.find((x) => x.id === a.userId);
      return { ...a, name: u ? u.name : "Unknown", username: u ? u.username : "-" };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  res.json(rows);
});

// Admin: list all users (without passwords)
app.get("/api/users", auth, adminOnly, (req, res) => {
  const db = load();
  res.json(db.users.map(({ password, ...u }) => u));
});

// Admin: add a new user
app.post("/api/users", auth, adminOnly, (req, res) => {
  const db = load();
  const name = String((req.body && req.body.name) || "").trim();
  const username = String((req.body && req.body.username) || "").trim().toLowerCase();
  const password = String((req.body && req.body.password) || "");

  if (!name) return res.status(400).json({ message: "Name venum" });
  if (username.length < 3) return res.status(400).json({ message: "Username kuraindhathu 3 character venum" });
  if (/\s/.test(username)) return res.status(400).json({ message: "Username la space irukka koodadhu" });
  if (db.users.some((u) => u.username === username)) {
    return res.status(400).json({ message: "Indha username already irukku" });
  }
  if (password.length < 6) return res.status(400).json({ message: "Password kuraindhathu 6 character venum" });

  const user = {
    id: db.users.reduce((max, u) => Math.max(max, u.id), 0) + 1,
    name,
    username,
    role: "user",
    password: bcrypt.hashSync(password, 10),
  };
  db.users.push(user);
  save(db);
  const { password: _pw, ...safe } = user;
  res.status(201).json({ user: safe });
});

// Admin: change name / username / password of any user (including admin themself)
app.put("/api/users/:id", auth, adminOnly, (req, res) => {
  const db = load();
  const target = db.users.find((u) => u.id === Number(req.params.id));
  if (!target) return res.status(404).json({ message: "User kedaikala" });

  const { name, username, password } = req.body || {};
  const newName = name !== undefined ? String(name).trim() : target.name;
  const newUsername = username !== undefined ? String(username).trim().toLowerCase() : target.username;

  if (!newName) return res.status(400).json({ message: "Name khali-a irukka koodadhu" });
  if (newUsername.length < 3) return res.status(400).json({ message: "Username kuraindhathu 3 character venum" });
  if (/\s/.test(newUsername)) return res.status(400).json({ message: "Username la space irukka koodadhu" });
  if (db.users.some((u) => u.id !== target.id && u.username === newUsername)) {
    return res.status(400).json({ message: "Indha username already vera yaarukkoo irukku" });
  }
  if (password && String(password).length < 6) {
    return res.status(400).json({ message: "Password kuraindhathu 6 character venum" });
  }

  target.name = newName;
  target.username = newUsername;
  if (password) target.password = bcrypt.hashSync(String(password), 10);
  save(db);

  const { password: _pw, ...safe } = target;
  const result = { user: safe };
  if (target.id === req.user.id) {
    const payload = { id: target.id, name: target.name, role: target.role };
    result.me = payload;
    result.token = jwt.sign(payload, SECRET, { expiresIn: "8h" });
  }
  res.json(result);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
