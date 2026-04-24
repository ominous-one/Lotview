import express from "express";
import { json, urlencoded } from "express";

// Ultra-minimal app — just enough to start the server
export default async function runApp() {
  const app = express();
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.get("/", (_req, res) => {
    res.send("Lotview is running — minimal mode");
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`[Minimal] Server running on port ${port}`);
  });

  return server;
}

export function log(message: string, source = "express") {
  console.log(`[${source}] ${message}`);
}
