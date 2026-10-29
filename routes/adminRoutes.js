const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Set the ADMIN_PASSWORD environment variable on the server, or change the fallback below
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "2012";

const TABLES = [
  "tblPriceList",
  "tblPurchase",
  "tblStock",
  "tblTransactionHistory",
  "tblReturns",
  "tblCount",
];

const BACKUP_DIR = path.join(__dirname, "..", "backups");

// Login tokens live in memory, so restarting the server logs everyone out
const tokens = new Set();

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();

router.get("/", (req, res) => {
  res.render("admin");
});

router.post("/login", (req, res) => {
  const ok = crypto.timingSafeEqual(sha(req.body.password), sha(ADMIN_PASSWORD));
  if (!ok) {
    // Small delay slows down password guessing
    return setTimeout(() => res.status(401).json({ error: "Wrong password" }), 1000);
  }
  const token = crypto.randomBytes(24).toString("hex");
  tokens.add(token);
  res.json({ token });
});

// Everything below this point requires a valid login token
router.use("/api", (req, res, next) => {
  if (!tokens.has(req.get("x-admin-token"))) {
    return res.status(401).json({ error: "Not logged in" });
  }
  next();
});

router.get("/api/tables", (req, res) => res.json(TABLES));

function requireTable(req, res, next) {
  if (!TABLES.includes(req.params.table)) {
    return res.status(404).json({ error: "Unknown table" });
  }
  next();
}

// Column info; generated columns (hidden >= 2) cannot be edited
function getColumns(table, cb) {
  db.all(`PRAGMA table_xinfo(${table})`, (err, cols) => {
    if (err) return cb(err);
    cb(
      null,
      cols.map((c) => ({
        name: c.name,
        type: c.type.toUpperCase(),
        pk: c.pk > 0,
        readOnly: c.pk > 0 || c.hidden >= 2,
      }))
    );
  });
}

router.get("/api/:table", requireTable, (req, res) => {
  const { table } = req.params;
  getColumns(table, (err, columns) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all(`SELECT * FROM ${table} ORDER BY ID DESC`, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ columns, rows });
    });
  });
});

// Saves a copy of the whole database before any change so a mistake can be undone
function backup(cb) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(BACKUP_DIR, `mainDB_${stamp}.db`);
  db.run("VACUUM INTO ?", [file], (err) => cb(err, file));
}

router.put("/api/:table/:id", requireTable, (req, res) => {
  const { table, id } = req.params;
  getColumns(table, (err, columns) => {
    if (err) return res.status(500).json({ error: err.message });

    const sets = [];
    const params = [];
    for (const col of columns.filter((c) => !c.readOnly)) {
      if (!(col.name in req.body)) continue;
      let v = req.body[col.name];
      if (v === "" || v === null) {
        v = null;
      } else if (col.type.includes("INT") || col.type.includes("REAL")) {
        v = Number(v);
        if (Number.isNaN(v)) {
          return res.status(400).json({ error: `${col.name} must be a number` });
        }
      }
      sets.push(`"${col.name}" = ?`);
      params.push(v);
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });

    backup((err) => {
      if (err) return res.status(500).json({ error: "Backup failed: " + err.message });
      db.run(`UPDATE ${table} SET ${sets.join(", ")} WHERE ID = ?`, [...params, id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        if (!this.changes) return res.status(404).json({ error: "Row not found" });
        res.json({ ok: true });
      });
    });
  });
});

router.delete("/api/:table/:id", requireTable, (req, res) => {
  const { table, id } = req.params;
  backup((err) => {
    if (err) return res.status(500).json({ error: "Backup failed: " + err.message });
    db.run(`DELETE FROM ${table} WHERE ID = ?`, [id], function (err) {
      if (err) return res.status(400).json({ error: err.message });
      if (!this.changes) return res.status(404).json({ error: "Row not found" });
      res.json({ ok: true });
    });
  });
});

module.exports = router;
