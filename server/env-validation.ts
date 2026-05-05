/**
 * Environment Variable Validation
 * Validates all required environment variables at startup to prevent
 * runtime failures from missing configuration. Fails fast with clear
 * error messages instead of cryptic runtime errors.
 */

interface EnvVar {
  name: string;
  required: boolean;
  productionOnly?: boolean;
}

const REQUIRED_ENV_VARS: EnvVar[] = [
  // Database
  { name: "DATABASE_URL", required: false }, // Can use individual PG* vars instead
  { name: "PGHOST", required: false },
  { name: "PGPORT", required: false },
  { name: "PGUSER", required: false },
  { name: "PGPASSWORD", required: false },
  { name: "PGDATABASE", required: false },

  // Security — required in production for token signing and request verification
  { name: "JWT_SECRET", required: true, productionOnly: true },
  { name: "SESSION_SECRET", required: true, productionOnly: true },
  { name: "EXTENSION_HMAC_SECRET", required: true, productionOnly: true },

  // AI
  { name: "ANTHROPIC_API_KEY", required: false },
  { name: "OPENAI_API_KEY", required: false },

  // Scraping
  { name: "BROWSERLESS_API_KEY", required: false },

  // Redis (required for scaling)
  { name: "REDIS_URL", required: false },

  // Application
  { name: "APP_URL", required: false },
  { name: "SYSTEM_BASE_DOMAIN", required: false },
  { name: "PORT", required: false },

  // Feature Flags
  { name: "ENABLE_AUTOPOST_QUEUE", required: false },
  { name: "ENABLE_COMPETITIVE_REPORT_SCHEDULER", required: false },

  // Facebook
  { name: "FACEBOOK_APP_ID", required: false },
  { name: "FACEBOOK_APP_SECRET", required: false, productionOnly: true },

  // GHL Webhook — required in production to verify inbound webhook signatures
  { name: "GHL_WEBHOOK_SECRET", required: true, productionOnly: true },

  // Browserless
  { name: "BROWSERLESS_API_KEY", required: false },

  // ZenRows (fallback scraper)
  { name: "ZENROWS_API_KEY", required: false },

  // Scrapling Python sidecar (optional fail-closed fallback)
  { name: "FEATURE_SCRAPLING_SIDECAR", required: false },
  { name: "ENABLE_SCRAPLING_SIDECAR", required: false },
  { name: "SCRAPLING_PYTHON", required: false },
  { name: "SCRAPLING_WORKER_PATH", required: false },
  { name: "SCRAPLING_TIMEOUT_MS", required: false },
  { name: "SCRAPLING_MAX_VEHICLES", required: false },
];

/**
 * Validates environment variables and throws a clear error if required vars are missing.
 * Call this at application startup before any other initialization.
 */
export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar.name];

    if (!value || value.trim() === "") {
      if (envVar.productionOnly && !isProduction) {
        // Dev mode can skip production-only vars
        continue;
      }

      if (envVar.name === "DATABASE_URL") {
        // DATABASE_URL or individual PG* vars required
        const hasIndividualVars =
          process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE;
        if (!hasIndividualVars) {
          errors.push(`DATABASE_URL (or PGHOST, PGUSER, PGPASSWORD, PGDATABASE) is required`);
        }
        continue;
      }

      if (envVar.name.startsWith("PG") && process.env.DATABASE_URL) {
        // Individual PG vars not needed if DATABASE_URL is set
        continue;
      }

      if (envVar.required) {
        errors.push(`${envVar.name} is required`);
      } else {
        warnings.push(`${envVar.name} is not set — related features will be unavailable`);
      }
    }
  }

  // Log warnings
  for (const warning of warnings) {
    console.warn(`[Env] ${warning}`);
  }

  // Fail fast on errors
  if (errors.length > 0) {
    console.error("[Env] Validation failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    throw new Error(
      `Environment validation failed with ${errors.length} error(s). ` +
        `Set the required variables and restart the application.`
    );
  }

  if (!isProduction) {
    console.log("[Env] Validation passed (development mode)");
  }
}
