param([string]$Target=(Join-Path $env:LOCALAPPDATA 'Programs\MusikeSuite'))
$ErrorActionPreference='Stop'
foreach($f in 'Python\python.exe','MusicGrabber\launch_native.pyw','Tools\yt-dlp.exe','Tools\deno.exe','Tools\ffmpeg\ffmpeg.exe','Tools\fpcalc.exe'){if(!(Test-Path "$Target\$f")){throw "Missing $f"};Write-Output "OK $f"}
& "$Target\Python\python.exe" -c "import fastapi,uvicorn,mutagen,yt_dlp,httpx,playwright,seleniumbase,apprise,bcrypt,Crypto; print('PYTHON_OK')"
if($LASTEXITCODE -ne 0){throw 'Python imports failed'}
& "$Target\Tools\ffmpeg\ffmpeg.exe" -version | Select-Object -First 1
if($LASTEXITCODE -ne 0){throw 'FFmpeg failed'}
