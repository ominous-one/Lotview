param(
  [string]$OutputRoot = "_deploy"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageRoot = Join-Path $repoRoot $OutputRoot
$sliceRoot = Join-Path $packageRoot "reviewed-slice-$timestamp"
$filesRoot = Join-Path $sliceRoot "files"
$manifestPath = Join-Path $sliceRoot "reviewed-slice-manifest.json"
$zipPath = Join-Path $packageRoot "lotview-reviewed-slice-$timestamp.zip"
$baseCommit = (git -C $repoRoot rev-parse HEAD).Trim()

$reviewedFiles = @(
  ".gitignore",
  "jest.config.cjs",
  "render.yaml",
  "scripts/audit-live-runtime.mjs",
  "scripts/prepare-deploy-package.ps1",
  "scripts/prepare-reviewed-deploy-slice.ps1",
  "scripts/quarantine-local-artifacts.ps1",
  "server/auth.ts",
  "server/competitive-report-service.ts",
  "server/comps-engine.ts",
  "server/comps-types.ts",
  "server/db.ts",
  "server/enhanced-market-analysis.ts",
  "server/robust-scraper.ts",
  "server/routes.ts",
  "server/runtime-readiness.ts",
  "server/scraper.ts",
  "server/tests/competitive-report-service.int.test.ts",
  "server/tests/enhanced-market-analysis.test.ts",
  "server/tests/robust-scraper-fallback.test.ts",
  "server/tests/robust-scraper-guardrails.test.ts",
  "server/tests/robust-scraper-image-folders.test.ts",
  "server/tests/robust-scraper-srp.test.ts",
  "server/tests/robust-scraper-validation.test.ts",
  "server/tests/runtime-readiness.test.ts",
  "server/tests/scraper-incremental-cleanup.test.ts",
  "server/tests/test-helpers.ts",
  "server/tests/vehicle-data-quality.test.ts",
  "server/tests/vin-decode-router.test.ts",
  "server/vin-decode-router.ts"
)

New-Item -ItemType Directory -Path $filesRoot -Force | Out-Null

$copied = @()
foreach ($relative in $reviewedFiles) {
  $source = Join-Path $repoRoot $relative
  if (!(Test-Path $source) -or (Test-Path $source -PathType Container)) {
    throw "Reviewed file missing: $relative"
  }

  $target = Join-Path $filesRoot $relative
  $targetParent = Split-Path $target -Parent
  if (!(Test-Path $targetParent)) {
    New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
  }

  Copy-Item -Path $source -Destination $target -Force
  $copied += $relative
}

$manifest = [ordered]@{
  createdAt = (Get-Date).ToString("o")
  sourceRepo = $repoRoot
  baseCommit = $baseCommit
  sliceType = "reviewed_patch_bundle"
  intent = "Apply these reviewed files onto a clean checkout at the recorded base commit to avoid unrelated dirty workspace changes."
  fileCount = $copied.Count
  reviewedFiles = $copied
  validation = @(
    "npm run check",
    "npm run build",
    "npx jest --runInBand server/tests/runtime-readiness.test.ts server/tests/scraper-incremental-cleanup.test.ts server/tests/robust-scraper-srp.test.ts server/tests/robust-scraper-vdp.test.ts server/tests/robust-scraper-guardrails.test.ts server/tests/robust-scraper-validation.test.ts server/tests/robust-scraper-fallback.test.ts server/tests/robust-scraper-image-folders.test.ts server/tests/comps-engine.test.ts server/tests/competitive-report-service.int.test.ts server/tests/enhanced-market-analysis.test.ts server/tests/vin-decode-router.test.ts",
    "node scripts/audit-live-runtime.mjs"
  )
  excludedDirtyAreas = @(
    "package.json, .github/workflows/ci.yml, DEPLOYMENT.md, ENTERPRISE_AUDIT_RESULTS.md, replit.md",
    "server/storage.ts, server/tests/autopost-queue-service.test.ts, server/tests/tenant-isolation.test.ts",
    "other modified docs, CI, and analytics files not reviewed into this slice"
  )
}

$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $manifestPath

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}
Compress-Archive -Path (Join-Path $sliceRoot "*") -DestinationPath $zipPath

Write-Output "Created reviewed slice at $sliceRoot"
Write-Output "Created reviewed slice archive at $zipPath"
