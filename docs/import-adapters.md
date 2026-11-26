# Universal import adapters

The import menu is driven by source IDs from the shared provider manifest in `shared/importRegistry.ts`. It distinguishes link detection from actual link import and account previews. New provider IDs must declare capabilities before a UI or service advertises them.

| Provider | Current path |
|---|---|
| YouTube | Automatic URL routing; lazy-loaded playlist/track preview |
| Suno | URL routing to the experimental OAuth account panel; local audio/ZIP; watched export folder |
| Spotify | URL routing to export workflow; JSON/TXT parsing; review in batches of 50 |
| MusicGrabber | Existing peer integration; audio/ZIP import; watched folder |
| Local | Audio/ZIP import; watched folder |

The browser dispatches files through `web/src/lib/importAdapters.ts`; the HTTP endpoint and folder monitor share `server/src/importEngine.ts`. Archive handling is loaded on demand. Files are committed individually to the library; duplicate content reuses a stored file and already-present playlist entries avoid repeated metadata probing. The upload worker is sequential to bound memory, while the existing batch search has three concurrent matching requests. Spotify exports retain all parsed terms (JSON traversal bounded to 20,000), with an in-memory draft across navigation. Nothing automatically accepts a doubtful match or downloads from an unauthorized account.

## Donor review and choices

- [Music Assistant](https://github.com/music-assistant/server) (Apache-2.0): provider/capability architecture; use the pattern rather than installing its Python server.
- [rclone](https://github.com/rclone/rclone) (MIT): backend feature discovery and incremental copy/check design; consider as an optional future storage adapter.
- [p-queue](https://github.com/sindresorhus/p-queue): concurrency and rate-limiting API; current sequential file commit and bounded search workers do not require another dependency yet.
- [music-metadata](https://github.com/Borewit/music-metadata) (MIT): candidate for native Node metadata and cover extraction. Existing FFprobe remains in place until the parser is benchmarked and packaged.

These are reviewed upstream design/library candidates, not vendored or installed dependencies.

## Next implementation gates

Persistent resumable jobs beyond per-file commits, source-specific checkpoints/backoff, metadata/artwork parser, exact recording fingerprints, cross-provider match cache, account-based Spotify import and real authenticated Suno schema validation. Link detection is not direct Suno/Spotify downloading. No full cloud sync or background operation when Musike is closed is implied.
