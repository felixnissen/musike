param([switch]$SkipDesktop,[string]$Target=(Join-Path $env:LOCALAPPDATA 'Programs\MusikeSuite'))
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$repo='https://github.com/felixnissen/musike/releases/download/musike-suite-1.5.8-preview'
$tmp=Join-Path $env:TEMP ('musike-'+[guid]::NewGuid())
New-Item -ItemType Directory -Force $tmp,$Target | Out-Null
function Fetch($url,$file){Invoke-WebRequest -UseBasicParsing $url -OutFile $file}
function Run($exe,$arguments){& $exe @arguments;if($LASTEXITCODE -ne 0){throw "$exe failed: $LASTEXITCODE"}}
function UnpackTool($url,$name,$folder){
 if(Test-Path (Join-Path $folder $name)){return}
 $z=Join-Path $tmp ($name+'.zip');$d=Join-Path $tmp ($name+'-unpacked')
 Fetch $url $z;Expand-Archive $z $d
 $f=Get-ChildItem $d -Recurse -File -Filter $name | Select-Object -First 1
 if(!$f){throw "Missing $name"}
 New-Item -ItemType Directory -Force $folder|Out-Null
 Copy-Item (Join-Path $f.DirectoryName '*') $folder -Force
}
try {
 $stage=Join-Path $PSScriptRoot 'release\suite-publish'
 if(!(Test-Path "$stage\MusicGrabber-source.zip")){
  $stage=$tmp
  Fetch "$repo/SHA256SUMS.txt" "$stage\SHA256SUMS.txt"
  foreach($name in 'MusicGrabber-source.zip','Musike-Setup-1.5.8-Windows.exe'){
   if($SkipDesktop -and $name -like '*.exe'){continue}
   Fetch "$repo/$name" "$stage\$name"
   $line=Get-Content "$stage\SHA256SUMS.txt"|Where-Object {$_ -match ('  '+[regex]::Escape($name)+'$')}
   if(!$line -or (Get-FileHash "$stage\$name").Hash -ne ($line -split '  ')[0]){throw "Checksum mismatch $name"}
  }
 }
 Expand-Archive "$stage\MusicGrabber-source.zip" "$Target\MusicGrabber" -Force
 $py="$Target\Python\python.exe"
 if(!(Test-Path $py)){
  Fetch 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' "$tmp\python.zip"
  Expand-Archive "$tmp\python.zip" "$Target\Python" -Force
  (Get-Content "$Target\Python\python312._pth") -replace '^#import site','import site' | Set-Content "$Target\Python\python312._pth"
 }
 & $py -s -m pip --version
 if($LASTEXITCODE -ne 0){Fetch 'https://bootstrap.pypa.io/get-pip.py' "$tmp\get-pip.py";Run $py @('-s',"$tmp\get-pip.py",'--isolated','--no-warn-script-location')}
 Run $py @('-s','-m','pip','--isolated','install','--disable-pip-version-check','-r',"$Target\MusicGrabber\requirements-windows.txt")
 $env:PLAYWRIGHT_BROWSERS_PATH="$Target\Browsers"
 Run $py @('-s','-m','playwright','install','chromium')
 $bin="$Target\Tools"
 New-Item -ItemType Directory -Force $bin|Out-Null
 if(!(Test-Path "$bin\yt-dlp.exe")){Fetch 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' "$bin\yt-dlp.exe"}
 UnpackTool 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip' 'deno.exe' $bin
 UnpackTool 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl-shared.zip' 'ffmpeg.exe' "$bin\ffmpeg"
 UnpackTool 'https://github.com/acoustid/chromaprint/releases/download/v1.6.2/chromaprint-fpcalc-1.6.2-windows-x86_64.zip' 'fpcalc.exe' $bin
 if(!$SkipDesktop){
  $musikeBin=Join-Path $env:APPDATA 'Musike\bin'
  New-Item -ItemType Directory -Force $musikeBin | Out-Null
  foreach($f in 'yt-dlp.exe','deno.exe','ffmpeg'){if(!(Test-Path "$musikeBin\$f")){Copy-Item "$bin\$f" $musikeBin -Recurse}}
  $p=Start-Process "$stage\Musike-Setup-1.5.8-Windows.exe" -ArgumentList '/S' -Wait -PassThru
  if($p.ExitCode -ne 0){throw 'Desktop installer failed'}
 }
 & "$PSScriptRoot\doctor.ps1" -Target $Target
 if(!$SkipDesktop){
  foreach($name in 'start','stop','doctor'){foreach($ext in 'ps1','cmd'){Copy-Item "$PSScriptRoot\$name.$ext" $Target -Force}}
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Musike Suite.lnk'))
  $shortcut.TargetPath="$Target\start.cmd"
  $shortcut.WorkingDirectory=$Target
  $shortcut.IconLocation="$env:LOCALAPPDATA\Programs\Musike\Musike.exe,0"
  $shortcut.Save()
 }
} finally {Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue}
