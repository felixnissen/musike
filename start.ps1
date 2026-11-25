$ErrorActionPreference='Stop'
$r=Join-Path $env:LOCALAPPDATA 'Programs\MusikeSuite'
$env:PATH="$r\Tools;$r\Tools\ffmpeg;"+$env:PATH
Start-Process "$r\Python\pythonw.exe" -ArgumentList ('-s "'+$r+'\MusicGrabber\launch_native.pyw" --no-browser') -WorkingDirectory "$r\MusicGrabber"
Start-Process "$env:LOCALAPPDATA\Programs\Musike\Musike.exe"
