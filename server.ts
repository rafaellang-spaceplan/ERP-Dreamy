import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("erp.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    client_id INTEGER,
    value REAL,
    status TEXT DEFAULT 'lead', -- lead, proposal, negotiation, closed_won, closed_lost
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    client_id INTEGER,
    status TEXT DEFAULT 'active', -- active, completed, on_hold
    budget REAL,
    deadline DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- income, expense
    category TEXT,
    amount REAL NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    is_recurring BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const app = express();
app.use(express.json());

// API Routes
// Clients
app.get("/api/clients", (req, res) => {
  const clients = db.prepare("SELECT * FROM clients ORDER BY name").all();
  res.json(clients);
});

app.post("/api/clients", (req, res) => {
  const { name, email, phone, company } = req.body;
  const info = db.prepare("INSERT INTO clients (name, email, phone, company) VALUES (?, ?, ?, ?)").run(name, email, phone, company);
  res.json({ id: info.lastInsertRowid });
});

app.delete("/api/clients/:id", (req, res) => {
  db.prepare("DELETE FROM clients WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Opportunities (CRM)
app.get("/api/opportunities", (req, res) => {
  const opps = db.prepare(`
    SELECT o.*, c.name as client_name 
    FROM opportunities o 
    LEFT JOIN clients c ON o.client_id = c.id
  `).all();
  res.json(opps);
});

app.post("/api/opportunities", (req, res) => {
  const { title, client_id, value, status, description } = req.body;
  const info = db.prepare("INSERT INTO opportunities (title, client_id, value, status, description) VALUES (?, ?, ?, ?, ?)").run(title, client_id, value, status, description);
  res.json({ id: info.lastInsertRowid });
});

app.put("/api/opportunities/:id", (req, res) => {
  const { title, client_id, value, status, description } = req.body;
  db.prepare("UPDATE opportunities SET title = ?, client_id = ?, value = ?, status = ?, description = ? WHERE id = ?").run(title, client_id, value, status, description, req.params.id);
  res.json({ success: true });
});

app.delete("/api/opportunities/:id", (req, res) => {
  db.prepare("DELETE FROM opportunities WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Projects
app.get("/api/projects", (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, c.name as client_name 
    FROM projects p 
    LEFT JOIN clients c ON p.client_id = c.id
  `).all();
  res.json(projects);
});

app.post("/api/projects", (req, res) => {
  const { name, client_id, status, budget, deadline } = req.body;
  const info = db.prepare("INSERT INTO projects (name, client_id, status, budget, deadline) VALUES (?, ?, ?, ?, ?)").run(name, client_id, status, budget, deadline);
  res.json({ id: info.lastInsertRowid });
});

app.delete("/api/projects/:id", (req, res) => {
  db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Transactions (Finance)
app.get("/api/transactions", (req, res) => {
  const transactions = db.prepare("SELECT * FROM transactions ORDER BY date DESC").all();
  res.json(transactions);
});

app.post("/api/transactions", (req, res) => {
  const { type, category, amount, date, description, is_recurring } = req.body;
  const info = db.prepare("INSERT INTO transactions (type, category, amount, date, description, is_recurring) VALUES (?, ?, ?, ?, ?, ?)").run(type, category, amount, date, description, is_recurring ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});

app.put("/api/transactions/:id", (req, res) => {
  const { type, category, amount, date, description, is_recurring } = req.body;
  db.prepare("UPDATE transactions SET type = ?, category = ?, amount = ?, date = ?, description = ?, is_recurring = ? WHERE id = ?").run(type, category, amount, date, description, is_recurring ? 1 : 0, req.params.id);
  res.json({ success: true });
});

app.delete("/api/transactions/:id", (req, res) => {
  db.prepare("DELETE FROM transactions WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
