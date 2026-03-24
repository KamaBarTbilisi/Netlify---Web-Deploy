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

  // Aggressive CORS handling - MUST BE FIRST
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    console.log(`CORS check for origin: ${origin || "none"} on ${req.method} ${req.url}`);
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    } else {
      res.header("Access-Control-Allow-Origin", "*");
    }
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Content-Length, X-Requested-With");
    
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json());

  // Simple request logger
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${req.headers.origin || "unknown"}`);
    next();
  });

  // Initialize database tables
  const initDb = async () => {
    if (!process.env.DATABASE_URL) {
      console.warn("DATABASE_URL not set. Skipping database initialization.");
      return;
    }
    try {
      const db = getPool();
      // Test connection
      await db.query("SELECT 1");
      console.log("Successfully connected to Neon PostgreSQL");
      
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
  app.get("/api/test", (req, res) => {
    res.json({ message: "CORS is working" });
  });

  app.get("/api/health", async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        return res.status(500).json({ status: "error", dbConnected: false, error: "DATABASE_URL not set" });
      }
      const db = getPool();
      await db.query("SELECT 1");
      res.json({ status: "ok", dbConnected: true });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(500).json({ status: "error", dbConnected: false, error: error instanceof Error ? error.message : "Database connection failed" });
    }
  });

  // Proxy for Google Sheets to bypass CORS
  app.get("/api/proxy-sheets", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }
      const text = await response.text();
      res.send(text);
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Internal Server Error" });
    }
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
