# Musike mini-server: protected music catalog

The existing Musike music peer is a **small, independent, read-only music service** on `127.0.0.1:4283`. It does not offer arbitrary file browsing, command execution, desktop control or Remote Gateway access.

## Endpoints

- `GET /v1/catalog?token=<pairing key>`: a compact list of **locally playable** songs matched against the Musike library (YouTube ID, title, artist, duration, presence of synchronized lyrics). **No filesystem paths** or account information.
- `GET /v1/available/:id?token=...`: whether the specified Musike track has a matching local recording.
- `GET /v1/stream/:id?token=...`: range-aware audio streaming of matching local music.
- `GET /v1/lyrics/:id?token=...`: existing local LRC sidecar.
- `GET /v1/health?token=...`: availability check.

All music endpoints require the pairing token. The service is **loopback only**: it is not reachable directly from a phone over Wi-Fi in this configuration. To use it from a phone, publish **only this service** through a private, trusted HTTPS transport; don't forward port 4283 through the router. Tailscale Serve is one option, not an architectural requirement. The Android app currently requires an HTTPS URL and a pairing key.

Library changes require no manual re-import: new songs become available as MusicGrabber downloads them. Missing recordings continue playing via YouTube. No account or music files are transmitted to third parties by this service.

Verified on November 22, 2026: unauthenticated catalog request returned 401, authenticated request returned 200 with local track metadata and no paths, and real desktop library and downloads continued unchanged.
