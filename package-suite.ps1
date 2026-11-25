$ErrorActionPreference='Stop'
$src="$env:LOCALAPPDATA\Programs\MusicGrabber"
$stage=Join-Path $PSScriptRoot 'release\suite-publish'
$clean=Join-Path $stage 'source'
New-Item -ItemType Directory -Force $clean|Out-Null
git -C $src ls-files | ForEach-Object {
 if($_ -notmatch '^(tests/|\.git)' -and $_ -notmatch '\.(db|sqlite|pem|key|mp3|flac|m4a|wav)$'){
  $f=Join-Path $src $_
  if(Test-Path $f -PathType Leaf){$dest=Join-Path $clean $_;New-Item -ItemType Directory -Force (Split-Path $dest)|Out-Null;Copy-Item $f $dest -Force}
 }
}
Copy-Item "$PSScriptRoot\release\all-in-one-stage\MusicGrabber\launch_native.pyw" $clean -Force
@'
fastapi==0.162.0
uvicorn[standard]==0.54.0
httpx==0.28.1
pydantic==2.13.5
mutagen==1.48.1
playwright==1.64.1
apprise==1.13.1
bcrypt==4.3.0
pycryptodome==4.2.0
seleniumbase==4.56.5
yt-dlp==2026.8.19
'@ | Set-Content "$clean\requirements-windows.txt" -Encoding ASCII
@'
MusicGrabber 4.5.0
Upstream: https://gitlab.com/g33kphr33k/musicgrabber
Revision: f258e4c668b4f6beabd671e7ba62eed8c0789d96
Local Windows fixes and launcher included. See LICENSE.
No private database, music, account configuration or cookies included.
'@ | Set-Content "$clean\DISTRIBUTION.txt"
Compress-Archive -Path "$clean\*" -DestinationPath "$stage\MusicGrabber-source.zip" -Force
Copy-Item "$PSScriptRoot\release\all-in-one-stage\Musike-Setup-1.5.8-*" $stage -Force
Get-ChildItem $stage -File | Where-Object {$_.Extension -in '.zip','.exe','.apk'} | ForEach-Object { '{0}  {1}' -f (Get-FileHash $_.FullName).Hash.ToLowerInvariant(),$_.Name } | Set-Content "$stage\SHA256SUMS.txt" -Encoding ASCII
foreach($f in 'install.ps1','doctor.ps1','start.ps1','stop.ps1','update.ps1'){$e=$null;$t=$null;[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $f),[ref]$t,[ref]$e)|Out-Null;if($e){throw ($e|Out-String)}}
Get-ChildItem $stage -File | Format-Table Name,Length
