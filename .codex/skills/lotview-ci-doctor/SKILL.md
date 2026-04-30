---
name: lotview-ci-doctor
description: Fix Lotview CI, install, typecheck, test, build, Docker, and GitHub Actions failures without hiding errors.
---

# Lotview CI Doctor

Mission: Find the first real failing blocker and fix it in the smallest safe PR.

Rules:
- Do not hide failures.
- Do not skip tests.
- Do not delete failing tests to make CI pass.
- Do not work on feature polish while CI is broken.
- Fix one blocker at a time.
- Add or update tests when behavior changes.

Required checks:
npm run production:gates
npm run lint
npm run check
npm run test:frontend
npm run test:server
npm run test:smoke
npm run build

Output:
1. Current branch
2. Failing job or command
3. Root cause
4. Files changed
5. Tests added
6. Result
7. Remaining blocker
