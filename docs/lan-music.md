# Musike over home Wi-Fi (PC-specific Android preview)

This is a small local-only HTTPS bridge in front of the existing restricted Musike peer service. It **does not** offer remote access to the Windows desktop, command execution, arbitrary filesystem browsing, SMB shares or Remote Gateway functionality.

## Home network setup

- MusicGrabber files: \`%USERPROFILE%\Music\MusicGrabber\`
- Musike peer: \`127.0.0.1:4283\` (protected with the existing randomly generated 256-bit token)
- Local HTTPS bridge: \`https://192.168.0.41:4284\` (bound only to this LAN IP)
- The bridge permits only \`/v1/health\`, \`/v1/catalog\`, \`/v1/available/...\`, \`/v1/stream/...\`, \`/v1/lyrics/...\` and the existing \`/v1/sync/...\` API. The peer still verifies tokens/account sessions, and it never accepts an arbitrary file path.
- TLS certificate and private key are generated for this specific computer and stored in \`%APPDATA%\Musike\data\lan-bridge\`. **Never publish the private key**. The Android preview includes only the public certificate, trusted for the PC's private LAN IP.
- A \`Musike LAN Bridge.lnk\` shortcut in Windows' current-user Startup folder starts the bridge using \`pythonw.exe\` without a visible terminal.
- Windows Firewall must have an **elevated, inbound rule** limited to Private profile, TCP port 4284, local address \`192.168.0.41\` and remote subnet \`192.168.0.0/24\`; it is **not** possible to create this rule from an ordinary Windows account. No router port forwarding is necessary or recommended.

## Android

Use the separate \`Musike-LAN-Android-Test.apk\` build. It has an app-specific network-security-config that trusts the PC's public TLS certificate **only for \`192.168.0.41\`**. This is a device-specific test build; other users should not redistribute or reuse it for their PC. The default music peer URL is \`https://192.168.0.41:4284\`. No pairing token or private key is embedded in the APK.

To pair, open Settings → Hybrid Music on desktop and **Copy pairing key**. Transfer this key privately to the phone (not in a public chat), paste into Android Settings → Hybrid Music and select **Save and test**. While on the same home Wi-Fi, playback prefers matching MusicGrabber audio; otherwise it uses YouTube as before. The PC must be powered on, Musike running, and the HTTPS bridge running.

A local-IP change or a reinstalled PC certificate requires creating a new PC-specific APK with matching certificate, and probably updating the local firewall rule. Remote/mobile-data access would require a separately authorized secure tunnel. On first setup, Windows Firewall requires user elevation and phone connectivity needs a real-device test.

## Security and tests

1. Confirmed HTTPS certificate verifies using its PEM trust anchor, with no \`verify=False\` bypass.
2. Anonymous library request: HTTP 401. Authenticated catalog: HTTP 200 with matched songs and without file paths.
3. HTTPS partial audio request: HTTP 206 for a 128-byte range.
4. Android APK's manifest contains \`networkSecurityConfig\` and packages the public certificate; the private key and secret are absent.
5. The SSL bridge is bound to \`192.168.0.41\`, and the underlying peer remains bound to loopback.

No working end-to-end **phone** session can be claimed until the Windows Firewall rule is allowed and the APK is tested on the user's phone.
