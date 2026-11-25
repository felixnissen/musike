Unicode true
Name "Musike Suite 1.5.8"
OutFile "release\suite-publish\Musike-All-in-One-Windows.exe"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
Icon "desktop\build\icon.ico"
Page instfiles
Section
 InitPluginsDir
 SetOutPath "$PLUGINSDIR"
 File "install.ps1"
 File "doctor.ps1"
 File "start.ps1"
 File "stop.ps1"
 File "start.cmd"
 File "stop.cmd"
 File "doctor.cmd"
 SetOutPath "$PLUGINSDIR\release\suite-publish"
 File "release\suite-publish\MusicGrabber-source.zip"
 File "release\suite-publish\Musike-Setup-1.5.8-Windows.exe"
 File "release\suite-publish\SHA256SUMS.txt"
 DetailPrint "Installing Musike, MusicGrabber and downloading official dependencies..."
 ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\install.ps1"' $0
 StrCmp $0 0 done
 SetErrorLevel $0
 MessageBox MB_OK|MB_ICONSTOP "Installation failed (exit code $0). Run install.cmd in the repository to inspect the error."
 Abort
 done:
 DetailPrint "Musike Suite installed."
SectionEnd
