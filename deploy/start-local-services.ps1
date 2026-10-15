param([string]$RuntimeDirectory = (Join-Path $PSScriptRoot '../.tmp/local-services-runtime'))
$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath($RuntimeDirectory)
$supervisor = Join-Path $PSScriptRoot 'local-services-supervisor.cjs'
$pidFile = Join-Path $runtime 'supervisor.pid'
if (Test-Path -LiteralPath $pidFile) {
  $supervisorId = [int](Get-Content -LiteralPath $pidFile)
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $supervisorId"
  if ($existing -and $existing.Name -eq 'node.exe' -and $existing.CommandLine.Contains($supervisor) -and $existing.CommandLine.Contains($runtime)) { Write-Output 'Local services already running'; exit 0 }
}
$settings = Get-Content -LiteralPath (Join-Path $runtime 'settings.json') | ConvertFrom-Json
foreach ($service in $settings.services) {
  $entry = if ($service.entry) { $service.entry } else { 'dist/main.js' }
  if (-not (Test-Path -LiteralPath (Join-Path $service.directory $entry))) { throw "Build $($service.name) before starting local services" }
  if (-not (Test-Path -LiteralPath $service.envFile)) { throw "Missing environment for $($service.name)" }
}
Remove-Item -LiteralPath (Join-Path $runtime 'supervisor.lock') -Force -ErrorAction SilentlyContinue
$node = Join-Path $env:ProgramFiles 'nodejs/node.exe'
$process = Start-Process -FilePath $node -ArgumentList @("`"$supervisor`"", "`"$runtime`"") -WindowStyle Hidden -PassThru
Write-Output "Local services supervisor started: $($process.Id)"
