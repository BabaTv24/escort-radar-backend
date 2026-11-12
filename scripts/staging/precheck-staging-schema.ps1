[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptRoot 'assert-staging-target.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw 'psql is required for staging precheck' }

$repoRoot = Resolve-Path (Join-Path $scriptRoot '..\..')
$artifactDir = Join-Path $repoRoot 'artifacts\staging'
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$reportPath = Join-Path $artifactDir ("precheck-{0}.staging.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$query = @'
begin read only;
select version() as postgresql_version;
select schema_name from information_schema.schemata order by schema_name;
select table_schema, table_name from information_schema.tables where table_schema in ('public','auth','storage','supabase_migrations') order by 1,2;
select routine_schema, routine_name from information_schema.routines where routine_schema in ('public','auth') order by 1,2;
select extname, extversion from pg_catalog.pg_extension order by extname;
select version, name from supabase_migrations.schema_migrations order by version;
rollback;
'@

$output = & psql $env:SUPABASE_STAGING_DB_URL --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --command $query 2>&1
$exitCode = $LASTEXITCODE
$output | Set-Content -LiteralPath $reportPath -Encoding utf8
Write-Output "Read-only report: $reportPath"
exit $exitCode
