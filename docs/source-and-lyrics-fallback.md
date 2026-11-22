# Playback source and missing synchronized lyrics

Musike displays a subtle audio source badge while a track is loaded:
- **Från datorn**: the current selected stream uses the authenticated private music peer / matched MusicGrabber file.
- **YouTube**: the current stream uses YouTube or its fallback resolver.
- **Kontrollerar ljudkälla**: the source has not been verified yet.
- **YouTube-video**: desktop video mode.

A phone going from Wi-Fi to cellular may change the source after an interruption; the label should reflect the selected source for each new stream. It does not claim the audio bytes were inspected.

## LRC coverage

The existing MusicGrabber sidecar for an exact matched recording is preferred. If absent, the frontend may ask **LRCLIB** (`https://lrclib.net/api/search`) for line-synced lyrics using only the song's title and artist. It accepts synchronized lyrics only when track name and artist name match after punctuation/case normalization and recorded duration differs by no more than 5 seconds. It does not use unsynced text, a different recording, instrumental result or overly large response. Results are cached in memory during the session (12 hours for matches, 30 minutes for misses). No user account is necessary.

This provider uses a third-party online API only when the local LRC is missing. When offline or no safe match is found, Musike continues playing and displays a clear absence state. Source name (MusicGrabber or LRCLIB) is shown in the lyrics UI.

Baseline inventory on Nov 22 2026: 1,051 music audio files in MusicGrabber and 917 matching LRC sidecars, so at least 134 downloaded recordings lack synced lyrics. This is a source coverage shortfall, not evidence of a broken lyrics renderer. Note: library match coverage can be lower than file sidecar counts when artist/title metadata differ.
