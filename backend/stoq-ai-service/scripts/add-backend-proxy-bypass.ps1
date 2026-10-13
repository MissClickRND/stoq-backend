param(
    [Parameter(Mandatory = $true)]
    [uri]$BackendUrl
)

$ErrorActionPreference = 'Stop'
if ($BackendUrl.Scheme -notin @('http', 'https') -or -not $BackendUrl.Host -or $BackendUrl.UserInfo) {
    throw 'Specify an HTTP/HTTPS backend URL without credentials.'
}

$taskRegistryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$taskSettings = Get-ItemProperty -LiteralPath $taskRegistryPath
$taskOriginal = [string]$taskSettings.ProxyOverride
$taskHost = $BackendUrl.DnsSafeHost
$taskEntries = @($taskOriginal -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ })

if ($taskEntries -notcontains $taskHost) {
    $taskBackupPath = Join-Path $PSScriptRoot '../.proxy-bypass-backup.json'
    if (-not (Test-Path -LiteralPath $taskBackupPath)) {
        [pscustomobject]@{
            ProxyOverride = $taskOriginal
            HadProxyOverride = $null -ne $taskSettings.PSObject.Properties['ProxyOverride']
        } | ConvertTo-Json | Set-Content -LiteralPath $taskBackupPath -Encoding utf8
    }
    $taskUpdated = (@($taskEntries) + $taskHost) -join ';'
    New-ItemProperty -LiteralPath $taskRegistryPath -Name ProxyOverride -PropertyType String -Value $taskUpdated -Force | Out-Null
}

# Notify WinINet clients about the updated per-user exception list.
if (-not ('StoqProxySettingsNotifier' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class StoqProxySettingsNotifier {
    [DllImport("wininet.dll", SetLastError = true)]
    public static extern bool InternetSetOption(IntPtr handle, int option, IntPtr buffer, int length);
}
'@
}
[StoqProxySettingsNotifier]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
[StoqProxySettingsNotifier]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null

$taskVerified = [string](Get-ItemProperty -LiteralPath $taskRegistryPath).ProxyOverride
if (($taskVerified -split ';') -notcontains $taskHost) { throw 'Proxy exception was not saved.' }
Write-Output "Added Windows proxy exception for $taskHost. Existing exceptions and proxy server preserved."
