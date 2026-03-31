# WORKING_BUFFER

- Real autopost entrypoints wired:
  - manager evaluate route in `server/routes.ts`
  - worker claim-next route in `server/routes.ts`
  - scheduler cron path in `server/scheduler.ts`
- New gate service exists at `server/scrape-gate-service.ts`
- New DB-backed runner exists at `scripts/run-db-backed-dealership-certification.ts`
- Fresh attempted run command:
  - `npx tsx scripts/run-db-backed-dealership-certification.ts --dealershipId 2`
- Exact blocker from live run:
  - `Database configuration not found. Please ensure the database is provisioned.`
- Confirmed env gap in this session:
  - `DATABASE_URL=`
  - `PGHOST=`
  - `PGPORT=`
  - `PGUSER=`
  - `PGPASSWORD=`
  - `PGDATABASE=`
- This means a truthful DB-backed certification artifact still requires DB credentials or a provisioned local connection in this session
