param(
  [string]$OutputRoot = "_deploy"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageRoot = Join-Path $repoRoot $OutputRoot
$stageRoot = Join-Path $packageRoot "s-$timestamp"
$manifestPath = Join-Path $packageRoot "manifest-$timestamp.json"
$zipPath = Join-Path $packageRoot "lotview-deploy-$timestamp.zip"

New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

$fileList = & git -C $repoRoot ls-files --cached --modified --others --exclude-standard
if ($LASTEXITCODE -ne 0) {
  throw "git ls-files failed"
}

$fileList = $fileList | Where-Object {
  $_ -notlike '_deploy/*' -and
  $_ -notlike 'deliverables/deploy-packages/*'
}

$copied = @()
foreach ($relative in $fileList) {
  $source = Join-Path $repoRoot $relative
  if (!(Test-Path $source) -or (Test-Path $source -PathType Container)) {
    continue
  }

  $target = Join-Path $stageRoot $relative
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
  stageRoot = $stageRoot
  zipPath = $zipPath
  fileCount = $copied.Count
  validation = @(
    "npm run check",
    "npm run build",
    "npm run test:server",
    "npm run proof:live-runtime"
  )
  knownBlockers = @(
    "Live hosts still expose an older /ready payload shape than the current repo; deployment is required to close runtime drift."
  )
}

$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $manifestPath

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}
Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $zipPath

Write-Output "Created deploy stage at $stageRoot"
Write-Output "Created deploy archive at $zipPath"
