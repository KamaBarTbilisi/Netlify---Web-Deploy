import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// Database connection
let pool: pg.Pool | null = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is missing. Please set it in the Settings menu.");
    }
    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false, // Required for Neon
      },
    });
  }
  return pool;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize database tables
  const initDb = async () => {
    if (!process.env.DATABASE_URL) {
      console.warn("DATABASE_URL not set. Skipping database initialization.");
      return;
    }
    try {
      const db = getPool();
      await db.query(`
        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS faq (
          id SERIAL PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log("Database tables initialized");
    } catch (error) {
      console.error("Error initializing database:", error);
    }
  };
  initDb();

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", dbConnected: !!process.env.DATABASE_URL });
  });

  // CMS API: Products
  app.get("/api/products", async (req, res) => {
    try {
      const db = getPool();
      const result = await db.query("SELECT * FROM products ORDER BY created_at DESC");
      res.json(result.rows.map(row => ({ id: row.id, ...row.data, created_at: row.created_at })));
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const db = getPool();
      const result = await db.query(
        "INSERT INTO products (data) VALUES ($1) RETURNING *",
        [req.body]
      );
      res.json({ id: result.rows[0].id, ...result.rows[0].data, created_at: result.rows[0].created_at });
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const db = getPool();
      await db.query("DELETE FROM products WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  // CMS API: FAQ
  app.get("/api/faq", async (req, res) => {
    try {
      const db = getPool();
      const result = await db.query("SELECT * FROM faq ORDER BY created_at DESC");
      res.json(result.rows.map(row => ({ id: row.id, ...row.data, created_at: row.created_at })));
    } catch (error) {
      console.error("Error fetching FAQ:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  app.post("/api/faq", async (req, res) => {
    try {
      const db = getPool();
      const result = await db.query(
        "INSERT INTO faq (data) VALUES ($1) RETURNING *",
        [req.body]
      );
      res.json({ id: result.rows[0].id, ...result.rows[0].data, created_at: result.rows[0].created_at });
    } catch (error) {
      console.error("Error creating FAQ:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  app.delete("/api/faq/:id", async (req, res) => {
    try {
      const db = getPool();
      await db.query("DELETE FROM faq WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting FAQ:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
