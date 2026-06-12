$proj = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
$lnkPath = Join-Path $desktop 'Media Suite (Dev).lnk'
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = (Join-Path $proj 'start-dev.bat')
$lnk.WorkingDirectory = $proj
$electron = Join-Path $proj 'node_modules\electron\dist\electron.exe'
if (Test-Path $electron) { $lnk.IconLocation = "$electron,0" }
$lnk.Description = 'Launch Media Suite in development mode'
$lnk.Save()
Write-Output "Shortcut created: $lnkPath"
