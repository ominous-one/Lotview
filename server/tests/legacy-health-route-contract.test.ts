import { readFileSync } from "fs";
import { resolve } from "path";

describe("legacy health route contracts", () => {
  const routesSource = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf8");

  it("keeps legacy health endpoints compatible with Render probes", () => {
    expect(routesSource).toContain('app.get("/api/health", healthHandler)');
    expect(routesSource).toContain('app.get("/api/ready", readyHandler)');
    expect(routesSource).toContain('app.get("/api/version", versionHandler)');
  });

  it("exposes Render commit metadata for legacy deploy proof", () => {
    expect(routesSource).toContain("process.env.RENDER_GIT_COMMIT");
    expect(routesSource).toContain("commit: getBuildCommit()");
  });
});
