/** @type {import('jest').Config} */
// Integration tests run against a REAL database (see scripts/setup-test-db.sh).
// Kept separate from the default unit run, which uses mocked storage.
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://lotview:lotview@127.0.0.1:55432/lotview";

module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/server/tests"],
  testMatch: ["**/*.integration.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.json",
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/shared/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testTimeout: 60000,
  clearMocks: true,
};
