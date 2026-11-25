$ErrorActionPreference='Stop'
$r=Join-Path $env:LOCALAPPDATA 'Programs\MusikeSuite'
foreach($f in 'Python\python.exe','MusicGrabber\launch_native.pyw','Tools\yt-dlp.exe','Tools\deno.exe','Tools\ffmpeg\ffmpeg.exe'){if(!(Test-Path "$r\$f")){throw "Missing $f"};Write-Output "OK $f"}
& "$r\Python\python.exe" -c "import fastapi,uvicorn,mutagen,yt_dlp"
if($LASTEXITCODE -ne 0){throw 'Python imports failed'}
