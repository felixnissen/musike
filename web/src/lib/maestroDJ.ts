import type { Library, Track } from "./types";
import { readPlayEvents, smartShuffle } from "./smartShuffle";

export type DJMode = "party" | "chill" | "singalong" | "night" | "custom";
export const DJ_MODES: { id: DJMode; name: string; icon: string; subtitle: string }[] = [
  { id: "party", name: "Party", icon: "🎉", subtitle: "Favoriter som håller festen igång" },
  { id: "chill", name: "Chill", icon: "🌙", subtitle: "Lugnare musik utan att tappa känslan" },
  { id: "singalong", name: "Skriksjunga", icon: "🎤", subtitle: "Refrängerna du aldrig tröttnar på" },
  { id: "night", name: "Nattkörning", icon: "🚗", subtitle: "Musik för vägen och sena timmar" },
  { id: "custom", name: "Mitt läge", icon: "✨", subtitle: "Din egen mix av spellistor" },
];

export interface DJPreferences {
  mode: DJMode;
  familiar: number;
  /** A personal selection of source playlists for each mode.
   * Empty selection means fallback to favorites/available library; not a genre claim.
   */
  playlistIds: Partial<Record<DJMode, string[]>>;
}
const KEY = "musike:maestro-dj:v1";
const MODE_HISTORY = "musike:maestro-dj-plays:v1";
const modes = new Set(DJ_MODES.map((x) => x.id));
const initial = (): DJPreferences => ({ mode: "party", familiar: 75, playlistIds: {} });
export function readDJPreferences(): DJPreferences {
  try {
    const input = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<DJPreferences> | null;
    if (!input) return initial();
    const playlistIds: DJPreferences["playlistIds"] = {};
    for (const entry of DJ_MODES) {
      const raw = input.playlistIds?.[entry.id];
      if (Array.isArray(raw))
        playlistIds[entry.id] = [...new Set(raw.filter((id): id is string => typeof id === "string" && id.length < 250))].slice(0, 30);
    }
    return {
      mode: modes.has(input.mode as DJMode) ? input.mode! : "party",
      familiar: typeof input.familiar === "number" && Number.isFinite(input.familiar)
        ? Math.min(100, Math.max(0, input.familiar)) : 75,
      playlistIds,
    };
  } catch { return initial(); }
}
export function saveDJPreferences(prefs: DJPreferences): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* local preference only */ }
}
export interface DJPlay { trackId: string; mode: DJMode; at: number; skipped: boolean }
export function readDJPlays(now = Date.now()): DJPlay[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MODE_HISTORY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is DJPlay => x != null && typeof x.trackId === "string" &&
      modes.has(x.mode) && typeof x.at === "number" && Number.isFinite(x.at) &&
      x.at > now - 180 * 86400_000 && x.at <= now + 60_000 &&
      typeof x.skipped === "boolean").slice(-800);
  } catch { return []; }
}
export function recordDJPlay(track: Track, skipped = false, now = Date.now()): void {
  try {
    const mode = localStorage.getItem("musike:maestro-dj:active") as DJMode | null;
    if (!mode || !modes.has(mode)) return;
    const events = readDJPlays(now);
    events.push({ trackId: track.id, mode, at: now, skipped });
    localStorage.setItem(MODE_HISTORY, JSON.stringify(events.slice(-800)));
  } catch { /* never block audio */ }
}
export function getActiveDJMode(): DJMode | null {
  try {
    const mode = localStorage.getItem("musike:maestro-dj:active");
    return mode && modes.has(mode as DJMode) ? mode as DJMode : null;
  } catch { return null; }
}
export function setActiveDJMode(mode: DJMode | null): void {
  try {
    if (mode) localStorage.setItem("musike:maestro-dj:active", mode);
    else localStorage.removeItem("musike:maestro-dj:active");
  } catch { /* fine */ }
}

export interface DJMix { tracks: Track[]; candidates: number; matchedPlaylists: number; basis: "playlists" | "library" }
/**
 * Curated mode playlists are explicit preference signals. Unassigned modes can
 * still work immediately via favorites/history. Counts accumulate only after
 * this feature is installed; no invented genre/BPM/energy metadata.
 *
 * Song selection uses repeated seeded weighted choices, then the existing
 * Smart Shuffle algorithm distributes artists and recent repeats.
 */
export function createDJMix(
  lib: Pick<Library, "favorites" | "playlists" | "history">,
  prefs: DJPreferences,
  opts: { seed?: number; events?: DJPlay[]; now?: number; size?: number } = {},
): DJMix {
  const configured = prefs.playlistIds[prefs.mode] ?? [];
  const selected = lib.playlists.filter((p) => configured.includes(p.id));
  const fromPlaylist = selected.flatMap((p) => p.tracks);
  const raw = fromPlaylist.length
    ? fromPlaylist
    : [...lib.favorites, ...lib.history, ...lib.playlists.flatMap((p) => p.tracks)];
  const unique = [...new Map(raw.filter((t) => t?.id && t.kind === "song").map((t) => [t.id, t])).values()];
  if (!unique.length) return { tracks: [], candidates: 0, matchedPlaylists: selected.length, basis: fromPlaylist.length ? "playlists" : "library" };
  const now = opts.now ?? Date.now();
  const plays = opts.events ?? readDJPlays(now);
  const counts = new Map<string, { played: number; skipped: number }>();
  for (const e of plays) {
    if (e.mode !== prefs.mode) continue;
    const old = counts.get(e.trackId) ?? { played: 0, skipped: 0 };
    if (e.skipped) old.skipped++;
    else old.played++;
    counts.set(e.trackId, old);
  }
  const knownHistory = new Set([...lib.history, ...lib.favorites].map((x) => x.id));
  // Track and mode affinity use actual listening events, not genre guesses.
  let state = (opts.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const rand = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const amount = Math.min(unique.length, Math.max(1, Math.min(150, Math.floor(opts.size ?? 50))));
  const remaining = unique.slice();
  const chosen: Track[] = [];
  while (chosen.length < amount) {
    const weights = remaining.map((t) => {
      const c = counts.get(t.id);
      const hits = c?.played ?? 0;
      const skips = c?.skipped ?? 0;
      const familiarity = knownHistory.has(t.id) || hits > 0 ? 1 : 0;
      const preference = prefs.familiar / 100;
      const score = familiarity ? (0.35 + 2.2 * preference) : (0.35 + 2.2 * (1 - preference));
      return Math.max(0.02, score * (1 + Math.min(8, hits) * 0.45) / (1 + Math.min(6, skips) * 1.8));
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    let pointer = rand() * sum;
    let idx = weights.length - 1;
    for (let i = 0; i < weights.length; i++) {
      pointer -= weights[i];
      if (pointer <= 0) { idx = i; break; }
    }
    chosen.push(remaining.splice(idx, 1)[0]);
  }
  const mixed = smartShuffle(chosen, { seed: opts.seed == null ? undefined : opts.seed + 1,
    recent: lib.history, now, events: readPlayEvents(now) });
  return { tracks: mixed, candidates: unique.length, matchedPlaylists: selected.length,
    basis: fromPlaylist.length ? "playlists" : "library" };
}
