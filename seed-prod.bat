@echo off
set "DATABASE_URL=postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require"
cd /d C:\Users\omino\projects\lotview
echo === Pushing schema to production ===
call npx drizzle-kit push
echo === Seeding Olympic Hyundai ===
call npx tsx seed-olympic-prod.ts
echo === Complete ===
pause
