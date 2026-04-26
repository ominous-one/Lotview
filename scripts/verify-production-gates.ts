import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

type Check = {
  name: string;
  ok: boolean;
  detail?: string;
};

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

check("Feature certification document exists", exists("docs/FEATURE_CERTIFICATION.md"));
check("Production readiness checklist exists", exists("docs/PRODUCTION_READINESS_CHECKLIST.md"));
check("Staging user-flow runbook exists", exists("docs/STAGING_USER_FLOW_RUNBOOK.md"));
check("Deployment and rollback runbook exists", exists("docs/DEPLOYMENT_RUNBOOK.md"));
check("Environment template exists", exists(".env.template"));
check("Frontend entrypoint exists", exists("client/src/main.tsx"));
check("Frontend smoke test exists", exists("client/src/main.test.ts"));
check("Frontend Vitest config exists", exists("vitest.frontend.config.ts"));
check("Dockerfile exists", exists("Dockerfile"));

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts || {};
check("npm script test:frontend exists", typeof scripts["test:frontend"] === "string");
check("npm script test:smoke exists", typeof scripts["test:smoke"] === "string");
check("npm script test:server exists", typeof scripts["test:server"] === "string");
check("npm script build exists", typeof scripts.build === "string");
check("npm script check exists", typeof scripts.check === "string");
check("npm script lint exists", typeof scripts.lint === "string");

const workflowFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/render-deploy.yml",
  ".github/workflows/frontend-verification.yml",
].filter(exists);

for (const workflowFile of workflowFiles) {
  const content = read(workflowFile);
  check(`${workflowFile} does not hide failures with shell fallbacks`, !content.includes("|| true"));
  check(`${workflowFile} does not reference missing Dockerfile.render`, !content.includes("Dockerfile.render"));
}

const envTemplate = read(".env.template");
for (const key of [
  "JWT_SECRET",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "DATABASE_URL",
  "REDIS_URL",
  "PUBLIC_APP_URL",
  "PUBLIC_API_URL",
  "CORS_ORIGIN",
  "LOTVIEW_ENABLE_SCHEDULERS",
  "LOTVIEW_SCHEDULER_PROCESS",
]) {
  check(`.env.template documents ${key}`, envTemplate.includes(`${key}=`));
}

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  const icon = item.ok ? "✅" : "❌";
  console.log(`${icon} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} production gate check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} production gate checks passed.`);
