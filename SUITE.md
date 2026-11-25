# Musike Suite 1.5.8 (Windows x64 preview)

PowerShell or CMD:
```cmd
git clone --branch feat/spotify-import-and-sync https://github.com/felixnissen/musike.git
cd musike
install.cmd
start.cmd
```
PowerShell equivalent: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1`.
No system-wide execution policy changes. The EXE wrapper invokes the same script.
Internet connection required for first install: downloads official Python runtime, pip dependencies, yt-dlp, Deno, FFmpeg, fpcalc. No Docker, WSL, Node or npm needed for using the packaged app.

Commands: install.cmd, start.cmd, stop.cmd, doctor.cmd, update.cmd.
User data remains in the existing Musike and MusicGrabber data directories. No library, accounts, cookies, or private signing keys are distributed.
MusicGrabber source: https://gitlab.com/g33kphr33k/musicgrabber at f258e4c668b4f6beabd671e7ba62eed8c0789d96 with local Windows fixes. License included in source archive.
Preview: browser-dependent provider features and a clean Windows desktop installation still require end-to-end testing.
