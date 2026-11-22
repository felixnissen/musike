import type { Track } from "./types";

export type ShuffleMode = "smart" | "classic";
export interface PlayEvent { id: string; artist: string; at: number; skipped?: boolean }

/** Small, device-local chronological play ledger; unrelated to cloud account sync. */
const KEY = "musike:smart-shuffle-history:v1";
const MAX_EVENTS = 600;
const MAX_AGE = 180 * 86400_000;
export function readPlayEvents(now = Date.now()): PlayEvent[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((x): x is PlayEvent => !!x && typeof x.id === "string" &&
      typeof x.artist === "string" && Number.isFinite(x.at) &&
      x.at > now - MAX_AGE && x.at <= now + 60000).slice(-MAX_EVENTS);
  } catch { return []; }
}
function recordEvent(track: Track, skipped: boolean, now: number): void {
  try {
    const events = readPlayEvents(now);
    events.push({ id: track.id, artist: track.artist, at: now, skipped });
    localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch { /* blocked storage must never stop playback */ }
}
export function recordSmartPlay(track: Track, now = Date.now()): void {
  recordEvent(track, false, now);
}
export function recordSmartSkip(track: Track, now = Date.now()): void {
  recordEvent(track, true, now);
}
const name = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
const DAY = 86400_000;

/** Weighted shuffle with a rolling artist window and gentle recency penalties.
 * Every queue occurrence is preserved; soft constraints relax when a playlist
 * only contains one artist. No hidden deletion or suppression of favorites.
 */
export function smartShuffle(
  tracks: Track[],
  opts: { events?: PlayEvent[]; recent?: Track[]; seed?: number; now?: number; lastArtist?: string } = {},
): Track[] {
  if (tracks.length < 2) return tracks.slice();
  const now = opts.now ?? Date.now();
  const events = opts.events ?? readPlayEvents(now);
  const lastById = new Map<string, number>();
  const lastByArtist = new Map<string, number>();
  const lastSkip = new Map<string, number>();
  for (const e of events) {
    if (e.skipped) lastSkip.set(e.id, Math.max(lastSkip.get(e.id) ?? 0, e.at));
    else lastById.set(e.id, Math.max(lastById.get(e.id) ?? 0, e.at));
    const artist = name(e.artist);
    if (artist) lastByArtist.set(artist, Math.max(lastByArtist.get(artist) ?? 0, e.at));
  }
  const recentIds = new Set((opts.recent ?? []).slice(0, 30).map((t) => t.id));
  let randomState = (opts.seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;
  const rand = () => {
    randomState += 0x6d2b79f5;
    let t = randomState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // 30 artist memories keeps the effort proportional to the actual queue size.
  const artistWindow = opts.lastArtist ? [name(opts.lastArtist)] : [];
  const result: Track[] = [];
  const remaining = tracks.slice();
  while (remaining.length) {
    const window = artistWindow.slice(-3);
    const alternatives = remaining.some((t) => !window.includes(name(t.artist)));
    const weights = remaining.map((t) => {
      const artist = name(t.artist);
      const recentTrackAt = lastById.get(t.id) ?? 0;
      const trackAge = recentTrackAt ? Math.max(0, (now - recentTrackAt) / DAY) : Infinity;
      const lastSkipAt = lastSkip.get(t.id) ?? 0;
      const skipAge = lastSkipAt ? Math.max(0, (now - lastSkipAt) / DAY) : Infinity;
      const artistAt = lastByArtist.get(artist) ?? 0;
      const artistAge = artistAt ? Math.max(0, (now - artistAt) / DAY) : Infinity;
      const repeats = result.slice(-12).filter((r) => r.id === t.id).length;
      let weight = 1;
      if (recentIds.has(t.id)) weight *= 0.20;
      if (trackAge < 1) weight *= 0.08;
      else if (trackAge < 7) weight *= 0.32;
      else if (trackAge < 30) weight *= 0.68;
      if (artistAge < 1) weight *= 0.7;
      if (skipAge < 3) weight *= 0.1;
      else if (skipAge < 14) weight *= 0.45;
      if (window.includes(artist) && alternatives) weight *= 0.003;
      if (repeats) weight *= 0.0001;
      return Math.max(0.00001, weight);
    });
    // For moderately sized playlists O(n²) is tolerable, but do not
    // leave huge lists unbounded. The app's own playlists are capped at 5000.
    const sum = weights.reduce((a, b) => a + b, 0);
    let threshold = rand() * sum;
    let chosen = weights.length - 1;
    for (let i = 0; i < weights.length; i++) {
      threshold -= weights[i];
      if (threshold <= 0) { chosen = i; break; }
    }
    const [track] = remaining.splice(chosen, 1);
    result.push(track);
    artistWindow.push(name(track.artist));
    if (artistWindow.length > 12) artistWindow.shift();
  }
  return result;
}
