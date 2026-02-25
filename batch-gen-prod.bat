@echo off
REM Set DATABASE_URL and ANTHROPIC_API_KEY as environment variables before running
if "%DATABASE_URL%"=="" echo ERROR: Set DATABASE_URL env var first && exit /b 1
if "%ANTHROPIC_API_KEY%"=="" echo ERROR: Set ANTHROPIC_API_KEY env var first && exit /b 1
cd /d C:\Users\omino\projects\lotview
call npx tsx batch-gen-desc.ts
