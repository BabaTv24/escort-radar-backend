[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptRoot 'assert-staging-target.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if ($env:CONFIRM_STAGING_SCHEMA_APPLY -ne 'YES') { throw 'Set CONFIRM_STAGING_SCHEMA_APPLY=YES to apply schema through migration 045' }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw 'psql is required to apply staging migrations' }

$repoRoot = Resolve-Path (Join-Path $scriptRoot '..\..')
$migrationDir = Join-Path $repoRoot 'supabase\migrations'
$migrations = Get-ChildItem -LiteralPath $migrationDir -File -Filter '*.sql' |
  Where-Object { $_.BaseName -match '^(0(?:0[1-9]|[1-3][0-9]|4[0-5]))_' } |
  Sort-Object Name
if ($migrations.Count -ne 45) { throw "Expected exactly 45 canonical migrations, found $($migrations.Count)" }
if ($migrations.Name -contains '046_bcu_favorites_atomic_transfer.sql') { throw 'Migration 046 must never be included in bootstrap through 045' }

$artifactDir = Join-Path $repoRoot 'artifacts\staging'
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$logPath = Join-Path $artifactDir ("apply-through-045-{0}.staging.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
"Target ref: $env:SUPABASE_STAGING_PROJECT_REF" | Set-Content -LiteralPath $logPath -Encoding utf8

foreach ($migration in $migrations) {
  "Applying $($migration.Name)" | Tee-Object -FilePath $logPath -Append
  & psql $env:SUPABASE_STAGING_DB_URL --no-psqlrc --set ON_ERROR_STOP=1 --file $migration.FullName 2>&1 |
    Tee-Object -FilePath $logPath -Append
  if ($LASTEXITCODE -ne 0) { throw "Stopped on $($migration.Name); see sanitized staging log" }
}
Write-Output 'Applied canonical migrations 001 through 045. Migration 046 was not executed.'
