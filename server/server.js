const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

const app = express();
const IS_PROD = process.env.NODE_ENV === "production";
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()) : true,
  })
);
app.use(express.json());

const PORT = process.env.PORT || 5001;
if (IS_PROD && !process.env.JWT_SECRET) {
  console.error("JWT_SECRET environment variable set pannunga");
  process.exit(1);
}
const SECRET = process.env.JWT_SECRET || "dev-only-secret";
const TIME_ZONE = process.env.TIME_ZONE || "Asia/Kolkata";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE }); // YYYY-MM-DD

// ---------- database (TiDB Cloud / MySQL) ----------
for (const key of ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]) {
  if (!process.env[key]) {
    console.error(`${key} environment variable set pannunga`);
    process.exit(1);
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 4000),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit: 5,
  enableKeepAlive: true,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      username VARCHAR(50) NOT NULL UNIQUE,
      role VARCHAR(10) NOT NULL DEFAULT 'user',
      password VARCHAR(100) NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      att_date CHAR(10) NOT NULL,
      arrival VARCHAR(32) NOT NULL,
      departure VARCHAR(32) NULL,
      UNIQUE KEY uniq_user_day (user_id, att_date)
    )
  `);

  // Location columns (pazhaya table-la illana add aagum, ippo irukkura data safe)
  for (const col of ["arrival_lat", "arrival_lng", "departure_lat", "departure_lng"]) {
    try {
      await pool.query(`ALTER TABLE attendance ADD COLUMN ${col} DOUBLE NULL`);
    } catch (err) {
      if (err.code !== "ER_DUP_FIELDNAME" && err.errno !== 1060) throw err;
    }
  }

  // Admin account: first time mattum create aagum (ADMIN_PASSWORD la irundhu).
  // Adhukku appuram data database la irukkum, redeploy pannaalum admin password maaraadhu.
  const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (admins.length === 0) {
    if (!process.env.ADMIN_PASSWORD) {
      console.error("ADMIN_PASSWORD environment variable set pannunga");
      process.exit(1);
    }
    await pool.query("INSERT INTO users (name, username, role, password) VALUES (?, ?, 'admin', ?)", [
      "Admin",
      "admin",
      bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10),
    ]);
    console.log("Admin account create aachu");
  }
}

// catches errors from async routes
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err);
    res.status(500).json({ message: "Server error, konjam neram kazhichu thirumba try pannunga" });
  });

// Browser-la irundhu vara location check pannum (latitude / longitude kattaayam venum)
function readLocation(body) {
  const lat = body && body.latitude;
  const lng = body && body.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
const LOCATION_REQUIRED = "Location venum. Browser la location allow pannitu thirumba try pannunga";

const RECORD_COLS = `id, user_id AS userId, att_date AS date, arrival, departure,
  arrival_lat AS arrivalLat, arrival_lng AS arrivalLng,
  departure_lat AS departureLat, departure_lng AS departureLng`;

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
app.post(
  "/api/login",
  wrap(async (req, res) => {
    const { username, password } = req.body || {};
    const uname = String(username || "").trim().toLowerCase();
    const [rows] = await pool.query("SELECT id, name, role, password FROM users WHERE username = ?", [uname]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(String(password || ""), user.password)) {
      return res.status(401).json({ message: "Username allathu password thappu" });
    }
    const payload = { id: user.id, name: user.name, role: user.role };
    const token = jwt.sign(payload, SECRET, { expiresIn: "8h" });
    res.json({ token, user: payload });
  })
);

// User: own attendance records
app.get(
  "/api/attendance/me",
  auth,
  wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT ${RECORD_COLS}
       FROM attendance WHERE user_id = ? ORDER BY att_date DESC`,
      [req.user.id]
    );
    res.json(rows);
  })
);

// User: mark arrival
app.post(
  "/api/attendance/arrival",
  auth,
  wrap(async (req, res) => {
    const loc = readLocation(req.body);
    if (!loc) return res.status(400).json({ message: LOCATION_REQUIRED });

    const date = today();
    const [existing] = await pool.query("SELECT id FROM attendance WHERE user_id = ? AND att_date = ?", [
      req.user.id,
      date,
    ]);
    if (existing.length) return res.status(400).json({ message: "Innaiku arrival already mark panniyachu" });

    const arrival = new Date().toISOString();
    try {
      const [result] = await pool.query(
        "INSERT INTO attendance (user_id, att_date, arrival, arrival_lat, arrival_lng) VALUES (?, ?, ?, ?, ?)",
        [req.user.id, date, arrival, loc.lat, loc.lng]
      );
      res.json({
        id: result.insertId,
        userId: req.user.id,
        date,
        arrival,
        departure: null,
        arrivalLat: loc.lat,
        arrivalLng: loc.lng,
      });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ message: "Innaiku arrival already mark panniyachu" });
      }
      throw err;
    }
  })
);

// User: mark departure
app.post(
  "/api/attendance/departure",
  auth,
  wrap(async (req, res) => {
    const loc = readLocation(req.body);
    if (!loc) return res.status(400).json({ message: LOCATION_REQUIRED });

    const date = today();
    const [rows] = await pool.query(
      "SELECT id, arrival, departure FROM attendance WHERE user_id = ? AND att_date = ?",
      [req.user.id, date]
    );
    const record = rows[0];
    if (!record) return res.status(400).json({ message: "Mudhalla arrival mark pannunga" });
    if (record.departure) return res.status(400).json({ message: "Innaiku departure already mark panniyachu" });

    const departure = new Date().toISOString();
    await pool.query(
      "UPDATE attendance SET departure = ?, departure_lat = ?, departure_lng = ? WHERE id = ?",
      [departure, loc.lat, loc.lng, record.id]
    );
    res.json({
      id: record.id,
      userId: req.user.id,
      date,
      arrival: record.arrival,
      departure,
      departureLat: loc.lat,
      departureLng: loc.lng,
    });
  })
);

// Admin: all users' attendance (optional ?date=YYYY-MM-DD)
app.get(
  "/api/attendance",
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const params = [];
    let where = "";
    if (req.query.date) {
      where = "WHERE a.att_date = ?";
      params.push(String(req.query.date));
    }
    const [rows] = await pool.query(
      `SELECT a.id, a.user_id AS userId, a.att_date AS date, a.arrival, a.departure,
              a.arrival_lat AS arrivalLat, a.arrival_lng AS arrivalLng,
              a.departure_lat AS departureLat, a.departure_lng AS departureLng,
              COALESCE(u.name, 'Unknown') AS name, COALESCE(u.username, '-') AS username
       FROM attendance a LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.att_date DESC, name ASC`,
      params
    );
    res.json(rows);
  })
);

// Admin: list all users (without passwords)
app.get(
  "/api/users",
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT id, name, username, role FROM users ORDER BY id");
    res.json(rows);
  })
);

// Admin: add a new user
app.post(
  "/api/users",
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const name = String((req.body && req.body.name) || "").trim();
    const username = String((req.body && req.body.username) || "").trim().toLowerCase();
    const password = String((req.body && req.body.password) || "");

    if (!name) return res.status(400).json({ message: "Name venum" });
    if (username.length < 3) return res.status(400).json({ message: "Username kuraindhathu 3 character venum" });
    if (/\s/.test(username)) return res.status(400).json({ message: "Username la space irukka koodadhu" });
    if (password.length < 6) return res.status(400).json({ message: "Password kuraindhathu 6 character venum" });

    const [dup] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
    if (dup.length) return res.status(400).json({ message: "Indha username already irukku" });

    try {
      const [result] = await pool.query(
        "INSERT INTO users (name, username, role, password) VALUES (?, ?, 'user', ?)",
        [name, username, bcrypt.hashSync(password, 10)]
      );
      res.status(201).json({ user: { id: result.insertId, name, username, role: "user" } });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") return res.status(400).json({ message: "Indha username already irukku" });
      throw err;
    }
  })
);

// Admin: change name / username / password of any user (including admin themself)
app.put(
  "/api/users/:id",
  auth,
  adminOnly,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const [rows] = await pool.query("SELECT id, name, username, role FROM users WHERE id = ?", [id]);
    const target = rows[0];
    if (!target) return res.status(404).json({ message: "User kedaikala" });

    const { name, username, password } = req.body || {};
    const newName = name !== undefined ? String(name).trim() : target.name;
    const newUsername = username !== undefined ? String(username).trim().toLowerCase() : target.username;

    if (!newName) return res.status(400).json({ message: "Name khali-a irukka koodadhu" });
    if (newUsername.length < 3) return res.status(400).json({ message: "Username kuraindhathu 3 character venum" });
    if (/\s/.test(newUsername)) return res.status(400).json({ message: "Username la space irukka koodadhu" });
    if (password && String(password).length < 6) {
      return res.status(400).json({ message: "Password kuraindhathu 6 character venum" });
    }

    const [dup] = await pool.query("SELECT id FROM users WHERE username = ? AND id <> ?", [newUsername, id]);
    if (dup.length) return res.status(400).json({ message: "Indha username already vera yaarukkoo irukku" });

    if (password) {
      await pool.query("UPDATE users SET name = ?, username = ?, password = ? WHERE id = ?", [
        newName,
        newUsername,
        bcrypt.hashSync(String(password), 10),
        id,
      ]);
    } else {
      await pool.query("UPDATE users SET name = ?, username = ? WHERE id = ?", [newName, newUsername, id]);
    }

    const safe = { id, name: newName, username: newUsername, role: target.role };
    const result = { user: safe };
    if (id === req.user.id) {
      const payload = { id, name: newName, role: target.role };
      result.me = payload;
      result.token = jwt.sign(payload, SECRET, { expiresIn: "8h" });
    }
    res.json(result);
  })
);

initDb()
  .then(() => app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`)))
  .catch((err) => {
    console.error("Database connect aagala:", err.message);
    process.exit(1);
  });
