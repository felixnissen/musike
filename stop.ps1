$r=Join-Path $env:LOCALAPPDATA 'Programs\MusikeSuite'
Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq "$r\Python\pythonw.exe" -and $_.CommandLine -match 'launch_native.pyw'} | ForEach-Object {Stop-Process -Id $_.ProcessId}
