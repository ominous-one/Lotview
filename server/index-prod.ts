import { type Server } from "node:http";
import runApp, { log } from "./app";

const SHUTDOWN_TIMEOUT_MS = 30_000;

function installGracefulShutdown(server: Server) {
  let shuttingDown = false;
  let shutdownTimer: NodeJS.Timeout | undefined;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      log(`Ignoring ${signal}; shutdown already in progress`, "shutdown");
      return;
    }

    shuttingDown = true;
    log(`Received ${signal}; starting graceful shutdown`, "shutdown");

    shutdownTimer = setTimeout(() => {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "shutdown",
        message: `Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms`,
      }));
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    shutdownTimer.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) { reject(error); return; }
          resolve();
        });
      });
      log("HTTP server closed", "shutdown");

      // Try to close DB pool if available
      try {
        const { pool } = await import("./db");
        await pool.end();
        log("Database pool closed", "shutdown");
      } catch {
        log("Database pool not available or already closed", "shutdown");
      }

      if (shutdownTimer) { clearTimeout(shutdownTimer); }
      log("Graceful shutdown complete", "shutdown");
      process.exit(0);
    } catch (error) {
      if (shutdownTimer) { clearTimeout(shutdownTimer); }
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        source: "shutdown",
        message: error instanceof Error ? error.message : "Graceful shutdown failed",
        stack: error instanceof Error ? error.stack : undefined,
      }));
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.once("SIGINT", () => { void shutdown("SIGINT"); });
}

// Global error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Unhandled Rejection] at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[Uncaught Exception]:", error);
});

(async () => {
  try {
    console.log("[Boot] Starting Lotview server...");
    const server = await runApp(undefined, "web");
    installGracefulShutdown(server);
    console.log("[Boot] Server startup complete");
  } catch (error) {
    console.error("[Boot] FATAL startup error:", error instanceof Error ? error.message : String(error));
    console.error(error instanceof Error ? error.stack : "");
    setTimeout(() => process.exit(1), 5000);
  }
})();
