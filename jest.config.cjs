/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'CommonJS',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        types: ['jest', 'node'],
      },
    }],
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@/(.*)$': '<rootDir>/client/src/$1',
  },
  // Ignore chrome-extension tests (they have their own config)
  // Ignore legacy standalone test scripts (they use main() pattern, not Jest)
  testPathIgnorePatterns: [
    '/node_modules/',
    '/chrome-extension/',
    'color-scoring\\.test\\.ts$',
    'image-proxy\\.test\\.ts$',
    'ghl-sync\\.test\\.ts$',
    'tenant-isolation\\.test\\.ts$',
    'vin-appraisal\\.test\\.ts$',
  ],
  // Force exit to handle timers from auth.ts nonce cleanup
  forceExit: true,
};
