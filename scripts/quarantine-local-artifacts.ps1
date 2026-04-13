param(
  [string]$DestinationRoot = ".openclaw\\quarantine"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destination = Join-Path $repoRoot (Join-Path $DestinationRoot "lotview-local-$timestamp")

$relativeItems = @(
  "build_audit.log",
  "check.out",
  "jest_audit.log",
  "root-test.out",
  "runtime-proof-jest.log",
  "tsc_audit.log",
  "tsc_runtimeproof.log",
  "temp-fetch.mjs",
  "temp-inventory-query.ts",
  "temp-pg-query.mjs",
  "temp-pup.mjs",
  "tmp",
  "runtime\\swarm",
  "runtime\\live-runtime-audit-*.json"
)

function Test-IsTracked {
  param(
    [string]$RelativePath
  )

  $null = git -C $repoRoot ls-files --error-unmatch -- $RelativePath 2>$null
  return ($LASTEXITCODE -eq 0)
}

function Move-UntrackedPath {
  param(
    [string]$FullPath
  )

  if (-not (Test-Path $FullPath)) {
    return
  }

  $relative = $FullPath.Substring($repoRoot.Length).TrimStart('\','/')
  $item = Get-Item -LiteralPath $FullPath -Force

  if ($item.PSIsContainer) {
    $children = @(Get-ChildItem -LiteralPath $FullPath -Force -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
      Move-UntrackedPath -FullPath $child.FullName
    }

    if ((Test-Path $FullPath) -and -not (Get-ChildItem -LiteralPath $FullPath -Force -ErrorAction SilentlyContinue)) {
      Remove-Item -LiteralPath $FullPath -Force
    }
    return
  }

  if (Test-IsTracked -RelativePath $relative) {
      Write-Output "Skipping tracked path $relative"
      return
  }

  $target = Join-Path $destination $relative
  $targetParent = Split-Path $target -Parent
  if (!(Test-Path $targetParent)) {
    New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
  }
  Move-Item -LiteralPath $FullPath -Destination $target -Force
}

function Move-RelativeItem {
  param(
    [string]$RelativePath
  )

  $matches = @(Get-ChildItem -Path (Join-Path $repoRoot $RelativePath) -Force -ErrorAction SilentlyContinue)
  foreach ($match in $matches) {
    Move-UntrackedPath -FullPath $match.FullName
  }
}

foreach ($item in $relativeItems) {
  Move-RelativeItem -RelativePath $item
}

Write-Output "Quarantined local artifacts to $destination"
