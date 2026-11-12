[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$productionRef = 'lcvktbcfoizlalvjrdgh'
$projectRef = [string]$env:SUPABASE_STAGING_PROJECT_REF
$databaseUrl = [string]$env:SUPABASE_STAGING_DB_URL

function Block([string]$Reason) {
  Write-Output "Target: BLOCKED ($Reason)"
  exit 2
}

if ([string]::IsNullOrWhiteSpace($projectRef)) { Block 'missing SUPABASE_STAGING_PROJECT_REF' }
if ($projectRef -eq $productionRef) { Block 'production project ref is forbidden' }
if ($projectRef -notmatch '^[a-z0-9]{20}$') { Block 'invalid Supabase project ref format' }
if ([string]::IsNullOrWhiteSpace($databaseUrl)) { Block 'missing SUPABASE_STAGING_DB_URL' }

try { $uri = [uri]$databaseUrl } catch { Block 'invalid staging database URL' }
if ($uri.Scheme -notin @('postgres', 'postgresql')) { Block 'database URL must use postgres or postgresql' }
if ([string]::IsNullOrWhiteSpace($uri.Host) -or $uri.Port -le 0) { Block 'database host or port is missing' }

$userName = [uri]::UnescapeDataString($uri.UserInfo.Split(':')[0])
$refMatchesTarget = $uri.Host -like "*$projectRef*" -or $userName -eq "postgres.$projectRef"
if (-not $refMatchesTarget) { Block 'project ref does not match database host or pooler username' }
if ($uri.Host -like "*$productionRef*" -or $userName -eq "postgres.$productionRef") { Block 'production database target is forbidden' }

$labels = $uri.Host.Split('.')
$maskedHost = if ($labels.Count -ge 3) { "$($labels[0].Substring(0, [Math]::Min(3, $labels[0].Length)))***.$($labels[-2]).$($labels[-1])" } else { '***' }
$databaseName = $uri.AbsolutePath.Trim('/')
if ([string]::IsNullOrWhiteSpace($databaseName)) { $databaseName = '(default)' }

Write-Output "Project ref: $projectRef"
Write-Output "Host: $maskedHost"
Write-Output "Database: $databaseName"
Write-Output "Port: $($uri.Port)"
Write-Output 'Target: SAFE'
exit 0
