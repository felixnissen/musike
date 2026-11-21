import { api } from "./api";
import type { Track } from "./types";

// Speculatively resolve a song when someone hovers its play row.
// Only metadata / stream URLs are prepared; no audio file is downloaded.
// Keep one speculative request in flight to avoid stressing YouTube or yt-dlp.
const recently = new Map<string, number>();
let busy = false;
const WINDOW_MS = 120_000;
const MAX_RECENT = 80;

export function warmupTrack(track: Track): void {
  if (busy) return;
  const now = Date.now();
  if (now - (recently.get(track.id) ?? 0) < WINDOW_MS) return;
  recently.set(track.id, now);
  if (recently.size > MAX_RECENT) recently.delete(recently.keys().next().value!);
  busy = true;
  void api.prepare(track.id).catch(() => {
    // Retry on a future hover rather than permanently caching a network error.
    recently.delete(track.id);
  }).finally(() => { busy = false; });
}
