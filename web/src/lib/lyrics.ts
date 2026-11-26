/** Standard LRC parser; metadata lines ignored, multiple timestamps per line supported. */
export interface LyricLine { time: number; text: string }
const TIMESTAMP = /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g;
export function parseLrc(source: string): LyricLine[] {
  if (!source || source.length > 512_000) return [];
  const result: LyricLine[] = [];
  let offset = 0;
  for (const raw of source.replace(/\r/g, "").split("\n")) {
    const meta = /^\[offset:\s*([+-]?\d+)\s*\]$/i.exec(raw.trim());
    if (meta) {
      offset = Math.max(-30_000, Math.min(30_000, Number(meta[1])));
      continue;
    }
    const stamp = new RegExp(TIMESTAMP.source, "g");
    const stamps = Array.from(raw.matchAll(stamp));
    if (!stamps.length) continue;
    const text = raw.replace(new RegExp(TIMESTAMP.source, "g"), "").trim().slice(0, 600);
    for (const match of stamps) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = (match[3] ?? "0").padEnd(3, "0").slice(0, 3);
      const time = minutes * 60 + seconds + Number(fraction) / 1000 + offset / 1000;
      if (Number.isFinite(time) && time >= 0 && time < 20_000)
        result.push({ time, text });
    }
  }
  result.sort((a,b) => a.time - b.time);
  return result.slice(0, 2000);
}
export function lyricAt(lines: LyricLine[], position: number): number {
  let lo = 0, hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= position + 0.06) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** The user's own sidecar is always the first choice.
 * LRCLIB is only consulted when local lyrics are missing; exact title/artist
 * and duration protect against using lyrics for the wrong recording.
 */
export interface LyricsResult { lines: LyricLine[]; source: "MusicGrabber" | "LRCLIB" | "Suno" | null; plain?:string }
export interface LyricsTrack { id: string; title: string; artist: string; duration: number }
const fallbackCache = new Map<string, { until: number; result: LyricsResult }>();
const norm = (v: string) => v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

async function lrclib(track: LyricsTrack, signal?: AbortSignal): Promise<LyricsResult> {
  const cacheKey = track.id + ":" + track.duration;
  const cached = fallbackCache.get(cacheKey);
  if (cached && Date.now() < cached.until) return cached.result;
  const missing: LyricsResult = { lines: [], source: null };
  if (track.title.length > 250 || track.artist.length > 250 || !track.artist.trim()) return missing;
  try {
    const params = new URLSearchParams({ track_name: track.title, artist_name: track.artist });
    const response = await fetch("https://lrclib.net/api/search?" + params, {
      headers: { "Lrclib-Client": "Musike/1.5.1 (personal library lyrics)" },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000),
    });
    if (!response.ok) return missing;
    const entries = await response.json() as Array<{
      trackName?: string; artistName?: string; duration?: number; instrumental?: boolean; syncedLyrics?: string;
    }>;
    if (!Array.isArray(entries)) return missing;
    const title = norm(track.title);
    const artist = norm(track.artist);
    const matches = entries.filter((entry) =>
      typeof entry.trackName === "string" && norm(entry.trackName) === title &&
      typeof entry.artistName === "string" && norm(entry.artistName) === artist &&
      typeof entry.syncedLyrics === "string" && entry.syncedLyrics.length < 512_000 &&
      !entry.instrumental &&
      Number.isFinite(entry.duration) && Math.abs(Number(entry.duration) - track.duration) <= 5
    );
    matches.sort((a,b) => Math.abs(Number(a.duration) - track.duration) - Math.abs(Number(b.duration) - track.duration));
    const lines = matches.length ? parseLrc(matches[0].syncedLyrics!) : [];
    const result: LyricsResult = { lines, source: lines.length ? "LRCLIB" : null };
    fallbackCache.set(cacheKey, { result, until: Date.now() + (lines.length ? 12 * 3600_000 : 30 * 60_000) });
    return result;
  } catch {
    return missing;
  }
}
export async function fetchLyrics(track: LyricsTrack, signal?: AbortSignal): Promise<LyricsResult> {
  // Private LAN-side LRC files take precedence, with no third-party requests
  // for a song for which the user already owns timed lyric metadata.
  const mobile = import.meta.env.MODE === "native";
  let url = "";
  if (mobile) {
    const raw = localStorage.getItem("musike:music-peer:v1");
    if (raw) {
      try {
        const data = JSON.parse(raw) as { url?: string; token?: string };
        if (data.url && /^https:\/\//i.test(data.url) && /^[a-f0-9]{64}$/.test(data.token ?? ""))
          url = data.url.replace(/\/+$/, "") + "/v1/lyrics/" + encodeURIComponent(track.id) + "?token=" + data.token;
      } catch { /* Try public fallback */ }
    }
  } else url = "/api/lyrics/" + encodeURIComponent(track.id);
  if (url) {
    try {
      const res = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(4500)]) : AbortSignal.timeout(4500),
        cache: "no-store",
      });
      if (res.ok) {
        const value = await res.json() as { text?: string; format?: string };
        if(value.format==="plain"&&typeof value.text==="string")return {lines:[],source:"Suno",plain:value.text.slice(0,50000)};
        if (value.format === "lrc" && typeof value.text === "string") {
          const lines = parseLrc(value.text);
          if (lines.length) return { lines, source: "MusicGrabber" };
        }
      }
    } catch { /* Local peer unavailable: try LRCLIB, not an unrelated local file */ }
  }
  if (signal?.aborted || /^local-[a-f0-9]{64}$/.test(track.id)) return { lines: [], source: null };
  return lrclib(track, signal);
}
