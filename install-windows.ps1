# Скрипт автоматической установки CRL-Helper для Windows
# Использование: irm BASE/install-windows.ps1 | iex
# Или: powershell -ExecutionPolicy Bypass -Command "& { irm 'URL' | iex }"
# BASE передаётся через переменную $env:CRL_INSTALL_BASE или определяется автоматически

$raw = if ($env:CRL_INSTALL_BASE) { $env:CRL_INSTALL_BASE } else { 'https://raw.githubusercontent.com/literarum/Copilot-1CO-2.0/main/site' }
$Base = ($raw -replace "`r", '' -replace "`n", '').Trim().TrimEnd('/')
if (-not $Base) { $Base = 'https://raw.githubusercontent.com/literarum/Copilot-1CO-2.0/main/site' }

Write-Host "🚀 Начинаем установку CRL-Helper для Copilot 1CO..." -ForegroundColor Cyan

$InstallDir = Join-Path $env:LOCALAPPDATA 'CRL-Helper'
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }

$ExePath = Join-Path $InstallDir 'CRL-Helper.exe'

Write-Host "⬇️ Скачиваем компоненту..." -ForegroundColor Yellow
$Urls = @(
    "$Base/files/CRL-Helper-windows.exe",
    "$Base/downloads/CRL-Helper-windows.exe",
    "https://raw.githubusercontent.com/literarum/Copilot-1CO-2.0/main/site/files/CRL-Helper-windows.exe"
)

$downloaded = $false
foreach ($url in $Urls) {
    try {
        Invoke-WebRequest -Uri $url -OutFile $ExePath -UseBasicParsing -ErrorAction Stop
        if ((Get-Item $ExePath).length -gt 0) {
            $downloaded = $true
            break
        }
    } catch {
        continue
    }
}

if (-not $downloaded) {
    Write-Host "❌ Ошибка: не удалось скачать компоненту ни по одному из адресов." -ForegroundColor Red
    exit 1
}

Write-Host "⚙️ Настраиваем автозапуск..." -ForegroundColor Yellow
$TaskName = 'CRL-Helper-Copilot1CO'
$taskOk = $false
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    $Action = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory $InstallDir
    $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null
    $taskOk = $true
} catch {}
if (-not $taskOk) {
    $StartupDir = [Environment]::GetFolderPath('Startup')
    $Wsh = New-Object -ComObject WScript.Shell
    $Shortcut = $Wsh.CreateShortcut((Join-Path $StartupDir 'CRL-Helper.lnk'))
    $Shortcut.TargetPath = $ExePath
    $Shortcut.WorkingDirectory = $InstallDir
    $Shortcut.WindowStyle = 7
    $Shortcut.Save()
}

Write-Host "▶️ Запускаем службу..." -ForegroundColor Yellow
Start-Process -FilePath $ExePath -WorkingDirectory $InstallDir -WindowStyle Hidden

Write-Host ""
Write-Host "✅ Установка успешно завершена!" -ForegroundColor Green
Write-Host "Служба CRL-Helper теперь работает в фоне и будет запускаться при входе в систему."
Write-Host "Можете закрыть окно и вернуться в браузер."
