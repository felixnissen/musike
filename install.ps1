$ErrorActionPreference='Stop'
$dest=Join-Path $env:LOCALAPPDATA 'Programs\MusikeSuite'
$stage=Join-Path $PSScriptRoot 'release\all-in-one-stage'
if (!(Test-Path "$stage\Tools\yt-dlp.exe")) {
 $stage=Join-Path $env:TEMP ([guid]::NewGuid().ToString())
 $zip="$stage.zip"
 Invoke-WebRequest -UseBasicParsing 'https://github.com/felixnissen/musike/releases/download/musike-suite-1.5.8-preview/Musike-Suite-1.5.8.zip' -OutFile $zip
 Expand-Archive $zip $stage
}
New-Item -ItemType Directory -Force $dest | Out-Null
foreach($n in 'Python','MusicGrabber','Tools'){Copy-Item "$stage\$n" $dest -Recurse -Force}
$bin=Join-Path $env:APPDATA 'Musike\bin'
New-Item -ItemType Directory -Force $bin | Out-Null
Copy-Item "$dest\Tools\*" $bin -Recurse -Force
$p=Start-Process "$stage\Musike-Setup-1.5.8-Windows.exe" -ArgumentList '/S' -Wait -PassThru
if($p.ExitCode -ne 0){throw 'Installer failed'}
& "$PSScriptRoot\doctor.ps1"
