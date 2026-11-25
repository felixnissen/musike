$r=Join-Path $env:LOCALAPPDATA 'Programs\MusikeSuite'
Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -eq "$r\Python\pythonw.exe" -and $_.CommandLine -match 'launch_native.pyw'} | ForEach-Object {Stop-Process -Id $_.ProcessId}
Get-Process Musike -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq "$env:LOCALAPPDATA\Programs\Musike\Musike.exe" -and $_.MainWindowHandle -ne 0} | ForEach-Object {if($_.CloseMainWindow()){[void]$_.WaitForExit(10000)}}
