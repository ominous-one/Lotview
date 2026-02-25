@echo off
set "DATABASE_URL=postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require"
cd /d C:\Users\omino\projects\lotview
call npx tsx add-scrape-source.ts
