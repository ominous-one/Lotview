import { type Server } from "http";
import runApp from "./app";

const SHUTDOWN_TIMEOUT_MS = 30_000;

function installGracefulShutdown(server: Server) {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Shutdown] ${signal} received`);

    const timer = setTimeout(() => {
      console.error("[Shutdown] Timeout, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log("[Shutdown] Server closed");
      clearTimeout(timer);
      process.exit(0);
    } catch (error) {
      clearTimeout(timer);
      console.error("[Shutdown] Error:", error);
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}

process.on("unhandledRejection", (reason) => {
  console.error("[Unhandled Rejection]", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Uncaught Exception]", error);
});

(async () => {
  try {
    console.log("[Boot] Starting server...");
    const server = await runApp(undefined, "web");
    installGracefulShutdown(server);
    console.log("[Boot] Server started");
  } catch (error) {
    console.error("[Boot] Fatal:", error instanceof Error ? error.message : String(error));
    setTimeout(() => process.exit(1), 5000);
  }
})();
