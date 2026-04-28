import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

type Check = {
  name: string;
  ok: boolean;
  detail?: string;
};

type FeatureProof = {
  ci: boolean;
  tests: boolean;
  staging: boolean;
  observability: boolean;
  realUserFlow: boolean;
  rollback: boolean;
};

type FeatureRegistryEntry = {
  id: string;
  name: string;
  status: "not_started" | "code_exists" | "fail_closed" | "ci_verified" | "staging_verified" | "production_ready";
  exposure: "disabled" | "staging_only" | "production";
  owner: string;
  paths: string[];
  proof: FeatureProof;
  notes: string;
};

type FeatureRegistry = {
  schemaVersion: number;
  policy: string;
  features: FeatureRegistryEntry[];
};

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

const checks: Check[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

check("Feature certification document exists", exists("docs/FEATURE_CERTIFICATION.md"));
check("Production readiness checklist exists", exists("docs/PRODUCTION_READINESS_CHECKLIST.md"));
check("Staging user-flow runbook exists", exists("docs/STAGING_USER_FLOW_RUNBOOK.md"));
check("Deployment and rollback runbook exists", exists("docs/DEPLOYMENT_RUNBOOK.md"));
check("Feature registry exists", exists("config/feature-registry.json"));
check("Environment template exists", exists(".env.template"));
check("Frontend entrypoint exists", exists("client/src/main.tsx"));
check("Frontend smoke test exists", exists("client/src/main.test.ts"));
check("Frontend Vitest config exists", exists("vitest.frontend.config.ts"));
check("Dockerfile exists", exists("Dockerfile"));

const packageJson = readJson<{ scripts?: Record<string, string> }>("package.json");
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
  ".github/workflows/production-gates.yml",
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

if (exists("config/feature-registry.json")) {
  const registry = readJson<FeatureRegistry>("config/feature-registry.json");
  check("feature registry schemaVersion is current", registry.schemaVersion === 1);
  check("feature registry has policy", typeof registry.policy === "string" && registry.policy.length > 20);
  check("feature registry has features", Array.isArray(registry.features) && registry.features.length > 0);

  const ids = new Set<string>();
  for (const feature of registry.features) {
    check(`feature ${feature.id} has unique id`, !ids.has(feature.id));
    ids.add(feature.id);

    check(`feature ${feature.id} has owner`, typeof feature.owner === "string" && feature.owner.length > 0);
    check(`feature ${feature.id} has notes`, typeof feature.notes === "string" && feature.notes.length > 0);
    check(`feature ${feature.id} has proof object`, Boolean(feature.proof));

    for (const proofKey of ["ci", "tests", "staging", "observability", "realUserFlow", "rollback"] as const) {
      check(`feature ${feature.id} proof.${proofKey} is boolean`, typeof feature.proof?.[proofKey] === "boolean");
    }

    for (const featurePath of feature.paths ?? []) {
      check(`feature ${feature.id} path exists: ${featurePath}`, exists(featurePath));
    }

    if (feature.exposure === "production") {
      check(
        `production feature ${feature.id} has CI and automated tests`,
        feature.proof.ci === true && feature.proof.tests === true,
        "Production-exposed features must at minimum have CI and automated tests.",
      );
      check(
        `production feature ${feature.id} is not marked unstarted or merely code_exists`,
        feature.status !== "not_started" && feature.status !== "code_exists",
      );
    }

    if (feature.status === "production_ready") {
      check(
        `production_ready feature ${feature.id} has full proof`,
        feature.proof.ci &&
          feature.proof.tests &&
          feature.proof.staging &&
          feature.proof.observability &&
          feature.proof.realUserFlow &&
          feature.proof.rollback,
      );
      check(`production_ready feature ${feature.id} is production exposed`, feature.exposure === "production");
    }

    if (feature.status === "fail_closed") {
      check(
        `fail_closed feature ${feature.id} is not production exposed`,
        feature.exposure !== "production",
        "Fail-closed features can compile and have guard tests, but cannot be sold as working production features.",
      );
    }
  }
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
