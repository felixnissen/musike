$ErrorActionPreference='Stop'
git -C $PSScriptRoot pull --ff-only
if($LASTEXITCODE -ne 0){throw 'Git update failed'}
& "$PSScriptRoot\stop.ps1"
& "$PSScriptRoot\install.ps1"
