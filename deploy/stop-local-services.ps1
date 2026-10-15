param([string]$RuntimeDirectory = (Join-Path $PSScriptRoot '../.tmp/local-services-runtime'))
$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath($RuntimeDirectory)
$pidFile = Join-Path $runtime 'supervisor.pid'
if (Test-Path -LiteralPath $pidFile) {
  $supervisorId = [int](Get-Content -LiteralPath $pidFile)
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $supervisorId"
  if ($existing -and $existing.Name -eq 'node.exe' -and $existing.CommandLine.Contains('local-services-supervisor.cjs') -and $existing.CommandLine.Contains($runtime)) {
    & taskkill.exe /PID $supervisorId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop local services' }
  } elseif ($existing) { throw 'PID belongs to another process; no processes stopped' }
}
foreach ($name in @('supervisor.pid','supervisor.lock')) { Remove-Item -LiteralPath (Join-Path $runtime $name) -Force -ErrorAction SilentlyContinue }
Write-Output 'Local services stopped'
