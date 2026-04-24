import express, { json, urlencoded } from "express";

export default async function runApp() {
  const app = express();
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));

  // Working endpoints
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", mode: "diagnostic", time: new Date().toISOString() });
  });

  app.get("/", (_req, res) => {
    res.send("Lotview Diagnostic Mode — use /api/diagnose?module=./app to test imports");
  });

  // Diagnostic endpoint — tests importing a specific module
  app.get("/api/diagnose", async (req, res) => {
    const modulePath = (req.query.module as string) || "./app";
    const results: any = { module: modulePath, tested: new Date().toISOString() };

    try {
      const mod = await import(modulePath);
      results.status = "loaded";
      results.exports = Object.keys(mod);
      results.error = null;
    } catch (e: any) {
      results.status = "crashed";
      results.error = e.message;
      results.stack = e.stack?.split("\n").slice(0, 5);
    }

    res.json(results);
  });

  // Batch diagnostic — tests multiple modules at once
  app.post("/api/diagnose/batch", async (req, res) => {
    const modules = req.body.modules || [
      "./app",
      "./db",
      "./routes",
      "./auth",
      "./storage",
      "./error-utils",
      "./utils/crypto",
      "./tenant-middleware",
      "./services/redis",
      "./services/queue",
      "./services/feature-flags",
      "./services/ghl-notifications",
      "./fb-marketplace-service",
      "./scheduler",
      "./scheduler.notifications",
      "./posting-scheduler",
      "./runtime-readiness",
      "./setup",
    ];

    const results: any[] = [];
    for (const modPath of modules) {
      try {
        const mod = await import(modPath);
        results.push({ module: modPath, status: "loaded", exports: Object.keys(mod).slice(0, 5) });
      } catch (e: any) {
        results.push({ module: modPath, status: "crashed", error: e.message });
      }
    }

    const crashed = results.filter(r => r.status === "crashed");
    res.json({ 
      total: modules.length, 
      loaded: modules.length - crashed.length, 
      crashed: crashed.length,
      crashed_modules: crashed.map(c => c.module),
      results 
    });
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`[Diagnostic] Server running on port ${port}`);
  });

  return server;
}

export function log(message: string, source = "express") {
  console.log(`[${source}] ${message}`);
}
