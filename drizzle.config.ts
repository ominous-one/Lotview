import type { Config } from "drizzle-kit";

export default {
  schema: "./shared/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgres://lotview:lotview@localhost:5432/lotview",
  },
  verbose: true,
  strict: true,
} satisfies Config;
