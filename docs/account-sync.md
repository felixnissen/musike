# Optional Musike account synchronization (preview)

This upgrade adds a **self-hosted, opt-in account** with username and password. It does **not** require email, phone numbers, Docker, a paid service, or a download of the audio library.

## Setup

1. On the Musike Windows desktop app, open Settings → **Konto och synk** and choose a username (3–32 lowercase letters/digits/underscore/hyphen) and password (at least 12 characters). Click **Skapa konto**.
2. The desktop runs an independent loopback-only service at `127.0.0.1:4283`. It does not grant filesystem or Remote Gateway access. Do **not** forward this port from the router.
3. From Android, configure the private HTTPS URL for that service in Settings → Hybrid music. The device needs to reach the computer through a private HTTPS tunnel (e.g. Tailscale Serve) before login and sync can work. Sign in under **Konto och synk** using the same username and password.
4. Click **Synka nu**, or leave the app open for a background sync attempt every two minutes. When offline, Musike keeps the local library and retries later.

## Data and safety

- Syncs existing Musike backup data: favorites, playlists, recent history and compatible UI/player settings, **not** downloaded MP3/Opus/FLAC files.
- Uses **additive merge** by playlist ID/name and video ID. It does not delete or destructively replace local libraries. As a consequence, deleting a favorite or playlist on one device is *not yet propagated* to other devices. Full deletion-aware sync remains future work.
- Saves password-derived scrypt hashes with random salts, not plaintext passwords.
- Uses randomly generated bearer sessions (stored as SHA-256 digests on the desktop) that persist over PC restarts and expire after 30 days.
- Uses revision checking (compare-and-swap) to reject concurrent updates; the client re-pulls and merges in case of conflict.
- Desktop account API is bound to loopback, shares only the account data, and requires authentication. Account creation requires the private desktop pairing key. Android should connect only over private HTTPS.
- This is **not an always-online cloud**: the desktop must be running and reachable to sync. Ordinary offline YouTube playback is unaffected by account server availability.
- Credentials are not sent to a third-party provider. No account is automatically created for the Windows user.

## Verification

`server/tests/accountSync.integration.ts` covers unauthorized registration, valid registration, incorrect password, login, first backup upload, readback, stale revision conflicts, invalid backups, desktop CORS and logout. The integration test uses a temporary data directory and a separate port; it does not modify the user's real library.
