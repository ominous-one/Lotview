@echo off
set "DATABASE_URL=postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require"
set "ZENROWS_API_KEY=21d69e232a816cc1ba00d492273289141fbc1d8f"
set "NODE_ENV=development"
set "SESSION_SECRET=dev-secret-123"
set "JWT_SECRET=dev-jwt-123"
set "EXTENSION_HMAC_SECRET=dev-hmac-123"
cd /d C:\Users\omino\projects\lotview
call npx tsx update-source.ts
call npx tsx server/run-manual-scrape.ts
