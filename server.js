const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const dbPath = process.env.DB_PATH || path.join(dataDir, "schriftfuehrer.db");
const sessionSecret = process.env.SESSION_SECRET || "change-me-in-production";
const bootstrapAdminUsername = process.env.ADMIN_USERNAME || "admin";
const bootstrapAdminPassword = process.env.ADMIN_PASSWORD || "admin123";
const bootstrapAdminName = process.env.ADMIN_DISPLAY_NAME || "Administrator";
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 1);
const cookieSecureMode = process.env.COOKIE_SECURE || "auto";
const forceHttps = process.env.FORCE_HTTPS === "true";
const loginRateLimitWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const loginRateLimitMaxAttempts = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || 5);
const loginAttempts = new Map();

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'reader')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS protocols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    meeting_date TEXT,
    location TEXT,
    recorder TEXT,
    start_time TEXT,
    end_time TEXT,
    attendees TEXT,
    intro TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS agenda_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    owner TEXT,
    notes TEXT,
    decision TEXT,
    FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    protocol_id INTEGER NOT NULL,
    agenda_item_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE,
    FOREIGN KEY (agenda_item_id) REFERENCES agenda_items(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

ensureColumn("users", "is_active", "INTEGER NOT NULL DEFAULT 1");

function ensureBootstrapAdmin() {
  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(bootstrapAdminUsername);

  const passwordHash = bcrypt.hashSync(bootstrapAdminPassword, 10);

  if (existingAdmin) {
    db.prepare(
      `UPDATE users
       SET password_hash = ?, display_name = ?, role = 'admin'
       WHERE id = ?`
    ).run(passwordHash, bootstrapAdminName, existingAdmin.id);
    db.prepare("UPDATE users SET is_active = 1 WHERE id = ?").run(existingAdmin.id);
    return;
  }

  db.prepare(
    `INSERT INTO users (username, password_hash, display_name, role)
     VALUES (?, ?, ?, 'admin')`
  ).run(bootstrapAdminUsername, passwordHash, bootstrapAdminName);
}

ensureBootstrapAdmin();

const insertProtocolStmt = db.prepare(`
  INSERT INTO protocols (
    title, meeting_date, location, recorder, start_time, end_time, attendees, intro, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

const updateProtocolStmt = db.prepare(`
  UPDATE protocols
  SET title = ?,
      meeting_date = ?,
      location = ?,
      recorder = ?,
      start_time = ?,
      end_time = ?,
      attendees = ?,
      intro = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const syncAgendaForProtocol = db.transaction((protocolId, agendaItems) => {
  const existingIds = new Set(
    db
      .prepare("SELECT id FROM agenda_items WHERE protocol_id = ?")
      .all(protocolId)
      .map((row) => row.id)
  );

  const keepIds = [];
  const insertAgendaStmt = db.prepare(`
    INSERT INTO agenda_items (protocol_id, position, title, owner, notes, decision)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const updateAgendaStmt = db.prepare(`
    UPDATE agenda_items
    SET position = ?, title = ?, owner = ?, notes = ?, decision = ?
    WHERE id = ? AND protocol_id = ?
  `);

  for (const item of agendaItems) {
    if (item.id && existingIds.has(item.id)) {
      updateAgendaStmt.run(
        item.position,
        item.title,
        item.owner,
        item.notes,
        item.decision,
        item.id,
        protocolId
      );
      keepIds.push(item.id);
    } else {
      const result = insertAgendaStmt.run(
        protocolId,
        item.position,
        item.title,
        item.owner,
        item.notes,
        item.decision
      );
      keepIds.push(Number(result.lastInsertRowid));
    }
  }

  const idsToDelete = [...existingIds].filter((id) => !keepIds.includes(id));
  if (idsToDelete.length) {
    const placeholders = idsToDelete.map(() => "?").join(", ");
    db.prepare(`DELETE FROM agenda_items WHERE protocol_id = ? AND id IN (${placeholders})`)
      .run(protocolId, ...idsToDelete);
  }
});

function normalizeProtocolInput(body) {
  const agenda = Array.isArray(body.agenda) ? body.agenda : [];
  return {
    title: String(body.title || "Sitzungsprotokoll").trim() || "Sitzungsprotokoll",
    meetingDate: String(body.meetingDate || "").trim(),
    location: String(body.location || "").trim(),
    recorder: String(body.recorder || "").trim(),
    startTime: String(body.startTime || "").trim(),
    endTime: String(body.endTime || "").trim(),
    attendees: String(body.attendees || "").trim(),
    intro: String(body.intro || "").trim(),
    agenda: agenda.map((item, index) => ({
      id: Number(item.id) || null,
      position: index + 1,
      title: String(item.title || `Punkt ${index + 1}`).trim() || `Punkt ${index + 1}`,
      owner: String(item.owner || "").trim(),
      notes: String(item.notes || "").trim(),
      decision: String(item.decision || "").trim(),
    })),
  };
}

function signToken(payload) {
  const base = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", sessionSecret)
    .update(base)
    .digest("base64url");
  return `${base}.${signature}`;
}

function verifyToken(token) {
  const [base, signature] = String(token || "").split(".");
  if (!base || !signature) {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", sessionSecret)
    .update(base)
    .digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(base, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    String(cookieHeader || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        return [entry.slice(0, index), decodeURIComponent(entry.slice(index + 1))];
      })
  );
}

function setSessionCookie(res, token) {
  const req = res.req;
  const isSecureRequest =
    cookieSecureMode === "true" ||
    (cookieSecureMode === "auto" && (req.secure || req.headers["x-forwarded-proto"] === "https"));
  const securePart = isSecureRequest ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `schriftfuehrer_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${securePart}`
  );
}

function clearSessionCookie(res) {
  const req = res.req;
  const isSecureRequest =
    cookieSecureMode === "true" ||
    (cookieSecureMode === "auto" && (req.secure || req.headers["x-forwarded-proto"] === "https"));
  const securePart = isSecureRequest ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `schriftfuehrer_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${securePart}`
  );
}

function sanitizeUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

function loadUserFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const payload = verifyToken(cookies.schriftfuehrer_session);
  if (!payload?.userId) {
    return null;
  }

  const user = db
    .prepare("SELECT id, username, display_name, role, is_active, created_at FROM users WHERE id = ?")
    .get(payload.userId);
  if (!user || !user.is_active) {
    return null;
  }

  return sanitizeUser(user);
}

function requireAuth(req, res, next) {
  const user = loadUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Nicht angemeldet." });
    return;
  }

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Admin-Rechte erforderlich." });
      return;
    }
    next();
  });
}

function protocolSummaryRow(row) {
  return {
    id: row.id,
    title: row.title,
    meetingDate: row.meeting_date,
    location: row.location,
    recorder: row.recorder,
    updatedAt: row.updated_at,
    agendaCount: row.agenda_count,
    commentCount: row.comment_count,
  };
}

function loadProtocol(protocolId) {
  const protocol = db
    .prepare("SELECT * FROM protocols WHERE id = ?")
    .get(protocolId);

  if (!protocol) {
    return null;
  }

  const agenda = db
    .prepare("SELECT * FROM agenda_items WHERE protocol_id = ? ORDER BY position ASC")
    .all(protocolId);

  const comments = db
    .prepare(`
      SELECT comments.id,
             comments.protocol_id,
             comments.agenda_item_id,
             comments.body,
             comments.created_at,
             users.id AS author_id,
             users.username AS author_username,
             users.display_name AS author_display_name,
             users.role AS author_role
      FROM comments
      JOIN users ON users.id = comments.user_id
      WHERE comments.protocol_id = ?
      ORDER BY comments.created_at ASC, comments.id ASC
    `)
    .all(protocolId)
    .map((comment) => ({
      id: comment.id,
      protocolId: comment.protocol_id,
      agendaItemId: comment.agenda_item_id,
      body: comment.body,
      createdAt: comment.created_at,
      author: {
        id: comment.author_id,
        username: comment.author_username,
        displayName: comment.author_display_name,
        role: comment.author_role,
      },
    }));

  return {
    id: protocol.id,
    title: protocol.title,
    meetingDate: protocol.meeting_date,
    location: protocol.location,
    recorder: protocol.recorder,
    startTime: protocol.start_time,
    endTime: protocol.end_time,
    attendees: protocol.attendees,
    intro: protocol.intro,
    createdAt: protocol.created_at,
    updatedAt: protocol.updated_at,
    agenda: agenda.map((item) => ({
      id: item.id,
      position: item.position,
      title: item.title,
      owner: item.owner,
      notes: item.notes,
      decision: item.decision,
      comments: comments.filter((comment) => comment.agendaItemId === item.id),
    })),
  };
}

function getClientIdentifier(req) {
  return String(req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown");
}

function getLoginRateLimitState(identifier) {
  const now = Date.now();
  const current = loginAttempts.get(identifier);
  if (!current || current.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + loginRateLimitWindowMs };
    loginAttempts.set(identifier, fresh);
    return fresh;
  }
  return current;
}

function recordFailedLogin(identifier) {
  const state = getLoginRateLimitState(identifier);
  state.count += 1;
  loginAttempts.set(identifier, state);
  return state;
}

function clearFailedLogins(identifier) {
  loginAttempts.delete(identifier);
}

app.disable("x-powered-by");
app.set("trust proxy", trustProxyHops);
app.use((req, res, next) => {
  if (forceHttps && !req.secure && req.headers["x-forwarded-proto"] !== "https") {
    res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    return;
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/login", (req, res) => {
  const identifier = getClientIdentifier(req);
  const rateLimitState = getLoginRateLimitState(identifier);
  if (rateLimitState.count >= loginRateLimitMaxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitState.resetAt - Date.now()) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." });
    return;
  }

  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

  if (!user || !user.is_active || !bcrypt.compareSync(password, user.password_hash)) {
    recordFailedLogin(identifier);
    res.status(401).json({ error: "Benutzername oder Passwort ungültig." });
    return;
  }

  clearFailedLogins(identifier);
  const token = signToken({ userId: user.id, issuedAt: Date.now() });
  setSessionCookie(res, token);
  res.json({ user: sanitizeUser(user) });
});

app.post("/api/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = loadUserFromRequest(req);
  res.json({ user });
});

app.get("/api/protocols", requireAuth, (_req, res) => {
  const rows = db
    .prepare(`
      SELECT protocols.id,
             protocols.title,
             protocols.meeting_date,
             protocols.location,
             protocols.recorder,
             protocols.updated_at,
             COUNT(DISTINCT agenda_items.id) AS agenda_count,
             COUNT(DISTINCT comments.id) AS comment_count
      FROM protocols
      LEFT JOIN agenda_items ON agenda_items.protocol_id = protocols.id
      LEFT JOIN comments ON comments.protocol_id = protocols.id
      GROUP BY protocols.id
      ORDER BY protocols.meeting_date DESC, protocols.updated_at DESC
    `)
    .all()
    .map(protocolSummaryRow);

  res.json({ protocols: rows });
});

app.get("/api/protocols/:id", requireAuth, (req, res) => {
  const protocol = loadProtocol(Number(req.params.id));
  if (!protocol) {
    res.status(404).json({ error: "Protokoll nicht gefunden." });
    return;
  }

  res.json({ protocol });
});

app.post("/api/protocols", requireAdmin, (req, res) => {
  const input = normalizeProtocolInput(req.body);
  const result = insertProtocolStmt.run(
    input.title,
    input.meetingDate,
    input.location,
    input.recorder,
    input.startTime,
    input.endTime,
    input.attendees,
    input.intro
  );

  syncAgendaForProtocol(result.lastInsertRowid, input.agenda);
  res.status(201).json({ protocol: loadProtocol(result.lastInsertRowid) });
});

app.put("/api/protocols/:id", requireAdmin, (req, res) => {
  const protocolId = Number(req.params.id);
  const existing = db.prepare("SELECT id FROM protocols WHERE id = ?").get(protocolId);
  if (!existing) {
    res.status(404).json({ error: "Protokoll nicht gefunden." });
    return;
  }

  const input = normalizeProtocolInput(req.body);
  updateProtocolStmt.run(
    input.title,
    input.meetingDate,
    input.location,
    input.recorder,
    input.startTime,
    input.endTime,
    input.attendees,
    input.intro,
    protocolId
  );
  syncAgendaForProtocol(protocolId, input.agenda);
  res.json({ protocol: loadProtocol(protocolId) });
});

app.delete("/api/protocols/:id", requireAdmin, (req, res) => {
  const protocolId = Number(req.params.id);
  db.prepare("DELETE FROM protocols WHERE id = ?").run(protocolId);
  res.json({ ok: true });
});

app.post("/api/comments", requireAuth, (req, res) => {
  const protocolId = Number(req.body.protocolId);
  const agendaItemId = Number(req.body.agendaItemId);
  const body = String(req.body.body || "").trim();

  if (!protocolId || !agendaItemId || !body) {
    res.status(400).json({ error: "Kommentar, Protokoll und Tagesordnungspunkt sind erforderlich." });
    return;
  }

  const agendaItem = db
    .prepare("SELECT id, protocol_id FROM agenda_items WHERE id = ?")
    .get(agendaItemId);

  if (!agendaItem || agendaItem.protocol_id !== protocolId) {
    res.status(404).json({ error: "Tagesordnungspunkt nicht gefunden." });
    return;
  }

  db.prepare(
    `INSERT INTO comments (protocol_id, agenda_item_id, user_id, body)
     VALUES (?, ?, ?, ?)`
  ).run(protocolId, agendaItemId, req.user.id, body);

  res.status(201).json({ protocol: loadProtocol(protocolId) });
});

app.patch("/api/comments/:id", requireAuth, (req, res) => {
  const commentId = Number(req.params.id);
  const body = String(req.body.body || "").trim();

  if (!commentId || !body) {
    res.status(400).json({ error: "Kommentartext ist erforderlich." });
    return;
  }

  const comment = db
    .prepare("SELECT id, protocol_id, user_id FROM comments WHERE id = ?")
    .get(commentId);

  if (!comment) {
    res.status(404).json({ error: "Kommentar nicht gefunden." });
    return;
  }

  if (req.user.role !== "admin" && req.user.id !== comment.user_id) {
    res.status(403).json({ error: "Dieser Kommentar darf nicht bearbeitet werden." });
    return;
  }

  db.prepare("UPDATE comments SET body = ? WHERE id = ?").run(body, commentId);
  res.json({ protocol: loadProtocol(comment.protocol_id) });
});

app.delete("/api/comments/:id", requireAuth, (req, res) => {
  const commentId = Number(req.params.id);
  const comment = db
    .prepare("SELECT id, protocol_id, user_id FROM comments WHERE id = ?")
    .get(commentId);

  if (!comment) {
    res.status(404).json({ error: "Kommentar nicht gefunden." });
    return;
  }

  if (req.user.role !== "admin" && req.user.id !== comment.user_id) {
    res.status(403).json({ error: "Dieser Kommentar darf nicht gelöscht werden." });
    return;
  }

  db.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
  res.json({ protocol: loadProtocol(comment.protocol_id) });
});

app.get("/api/users", requireAdmin, (_req, res) => {
  const users = db
    .prepare("SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY username ASC")
    .all()
    .map(sanitizeUser);

  res.json({ users });
});

app.post("/api/users", requireAdmin, (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const displayName = String(req.body.displayName || "").trim();
  const password = String(req.body.password || "");
  const role = req.body.role === "admin" ? "admin" : "reader";

  if (!username || !displayName || password.length < 6) {
    res.status(400).json({ error: "Benutzername, Anzeigename und Passwort mit mindestens 6 Zeichen sind erforderlich." });
    return;
  }

  try {
    db.prepare(
      `INSERT INTO users (username, password_hash, display_name, role, is_active)
       VALUES (?, ?, ?, ?, 1)`
    ).run(username, bcrypt.hashSync(password, 10), displayName, role);
  } catch (error) {
    res.status(400).json({ error: "Benutzer konnte nicht angelegt werden. Existiert der Name bereits?" });
    return;
  }

  const users = db
    .prepare("SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY username ASC")
    .all()
    .map(sanitizeUser);

  res.status(201).json({ users });
});

app.patch("/api/users/:id", requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!existing) {
    res.status(404).json({ error: "Benutzer nicht gefunden." });
    return;
  }

  const displayName = String(req.body.displayName || existing.display_name).trim();
  const role = req.body.role === "admin" ? "admin" : "reader";
  const isActive = req.body.isActive === false ? 0 : 1;
  const password = req.body.password ? String(req.body.password) : "";

  if (!displayName) {
    res.status(400).json({ error: "Anzeigename darf nicht leer sein." });
    return;
  }

  if (req.user.id === userId && isActive === 0) {
    res.status(400).json({ error: "Der aktuell angemeldete Admin kann sich nicht selbst deaktivieren." });
    return;
  }

  if (req.user.id === userId && role !== "admin") {
    res.status(400).json({ error: "Der aktuell angemeldete Admin kann sich nicht selbst die Admin-Rolle entziehen." });
    return;
  }

  if (password && password.length < 6) {
    res.status(400).json({ error: "Ein neues Passwort muss mindestens 6 Zeichen lang sein." });
    return;
  }

  if (password) {
    db.prepare(
      `UPDATE users
       SET display_name = ?, role = ?, is_active = ?, password_hash = ?
       WHERE id = ?`
    ).run(displayName, role, isActive, bcrypt.hashSync(password, 10), userId);
  } else {
    db.prepare(
      `UPDATE users
       SET display_name = ?, role = ?, is_active = ?
       WHERE id = ?`
    ).run(displayName, role, isActive, userId);
  }

  const users = db
    .prepare("SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY username ASC")
    .all()
    .map(sanitizeUser);

  res.json({ users });
});

app.delete("/api/users/:id", requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  if (req.user.id === userId) {
    res.status(400).json({ error: "Der aktuell angemeldete Admin kann sich nicht selbst löschen." });
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!existing) {
    res.status(404).json({ error: "Benutzer nicht gefunden." });
    return;
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  const users = db
    .prepare("SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY username ASC")
    .all()
    .map(sanitizeUser);

  res.json({ users });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Schriftführer läuft auf Port ${port}`);
});
