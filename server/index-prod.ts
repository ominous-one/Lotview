import { type Server } from "node:http";
import runApp from "./app";

const SHUTDOWN_TIMEOUT_MS = 30_000;

function installGracefulShutdown(server: Server) {
  let shuttingDown = false;
  let shutdownTimer: NodeJS.Timeout | undefined;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Shutdown] Received ${signal}, shutting down gracefully`);

    shutdownTimer = setTimeout(() => {
      console.error("[Shutdown] Timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    shutdownTimer.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      console.log("[Shutdown] Server closed");
      if (shutdownTimer) clearTimeout(shutdownTimer);
      process.exit(0);
    } catch (error) {
      if (shutdownTimer) clearTimeout(shutdownTimer);
      console.error("[Shutdown] Error:", error);
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

(async () => {
  try {
    console.log("[Boot] Starting server...");
    const server = await runApp(() => {}, "web");
    installGracefulShutdown(server);
    console.log("[Boot] Server started successfully");
  } catch (error) {
    console.error("[Boot] FATAL:", error instanceof Error ? error.message : String(error));
    console.error(error instanceof Error ? error.stack : "");
    setTimeout(() => process.exit(1), 5000);
  }
})();
