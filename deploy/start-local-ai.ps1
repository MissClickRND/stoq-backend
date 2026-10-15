param([Parameter(Mandatory=$true)][string]$RuntimeDirectory)
$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath($RuntimeDirectory)
$pidFile = Join-Path $runtime 'supervisor.pid'
if (Test-Path -LiteralPath $pidFile) {
  $workerProcessId = [int](Get-Content -LiteralPath $pidFile)
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $workerProcessId" -ErrorAction SilentlyContinue
  if ($existing -and $existing.CommandLine -like '*local-ai-supervisor.cjs*') { exit 0 }
}
$node = Join-Path $env:ProgramFiles 'nodejs/node.exe'
$supervisor = Join-Path $PSScriptRoot 'local-ai-supervisor.cjs'
$process = Start-Process -FilePath $node -ArgumentList @("`"$supervisor`"", "`"$runtime`"") -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id
