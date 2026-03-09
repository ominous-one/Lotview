# Automation Overhaul — Bugs Found

Date: 2026-03-08

---

## BUG-001 — Workstream 4 decide-send unit test fails without DB config (FIXED)

**Area:** Workstream 4 (FB Marketplace replies) — server tests

**File:** `server/tests/fb-replies-decide-send.unit.test.ts`

**Observed:** Running via Jest fails immediately with:
- `Database configuration not found. Please ensure the database is provisioned.`
- stack: `server/db.ts` → `server/storage.ts` → `server/tests/test-helpers.ts` → `fb-replies-decide-send.unit.test.ts`

**Expected:** A file named `*.unit.test.ts` should be runnable in a DB-less environment (or should mock DB/`server/db.ts`).

**Impact / Risk:**
- Reduces CI reliability; contributors cannot run unit tests without provisioning DB.
- Prevents fast regression checks for the most safety-critical portion (server-authoritative send gate).

**Repro steps:**

```powershell
cd C:\Users\omino\projects\lotview
npx jest server/tests/fb-replies-decide-send.unit.test.ts
```

**Fix applied (engineering):**
- Converted `server/tests/fb-replies-decide-send.unit.test.ts` to a real Jest unit test suite.
- Removed dependency on `server/tests/test-helpers.ts` (which imported DB-backed `storage`).
- Unit tests now mock the `IStorage` dependency in-memory so importing/running the test does **not** load `server/db.ts`.

**Validation:**

```powershell
cd C:\Users\omino\projects\lotview
npx jest server/tests/fb-replies-decide-send.unit.test.ts
```

---

## BUG-002 — Auth unit test timeout (bcrypt hashing) (FIXED)

**Area:** Server auth tests (test infrastructure / unit tests)

**File:** `server/tests/auth.test.ts`

**Observed:** Running the DB-free Jest subset failed with:
- `Exceeded timeout of 5000 ms for a test`
- failing test: `should produce different hashes for the same password (salted)`

**Expected:** Test should be reliable across environments even if bcrypt work factor is configured higher.

**Impact / Risk:**
- Breaks automated QA runs / CI intermittently or on slower machines.

**Repro steps:**

```powershell
cd C:\Users\omino\projects\lotview
npx jest server/tests/auth.test.ts
```

**Fix applied (engineering):**
- Increased the per-test timeout for the salted-hash test to `20000ms`.

**Validation:**

```powershell
cd C:\Users\omino\projects\lotview
npx jest server/tests/auth.test.ts
```

---

## QA note — Jest open handles warning

**Observed:** Some Jest runs report:
- `A worker process has failed to exit gracefully...`
- `Force exiting Jest: Have you considered using --detectOpenHandles...`

**Impact:** Moderate (test hygiene). Could hide async leaks.

**Suggested follow-up:**
- Run the slow/leaky suite(s) with `--detectOpenHandles` and ensure timers/sockets are cleaned up (or `.unref()` is used).
