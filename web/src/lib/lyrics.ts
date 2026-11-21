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
export async function fetchLyrics(id: string, signal?: AbortSignal): Promise<LyricLine[]> {
  // On Android, only the authenticated MusicGrabber peer can provide sidecars.
  // The desktop build's normal same-origin API does not need a pairing token.
  const mobile = import.meta.env.MODE === "native";
  let url: string;
  if (mobile) {
    const raw = localStorage.getItem("musike:music-peer:v1");
    if (!raw) return [];
    let data: { url?: string; token?: string };
    try { data = JSON.parse(raw); } catch { return []; }
    if (!data.url || !/^https:\/\//i.test(data.url) || !/^[a-f0-9]{64}$/.test(data.token ?? "")) return [];
    url = data.url.replace(/\/+$/, "") + "/v1/lyrics/" + encodeURIComponent(id) + "?token=" + data.token;
  } else {
    url = "/api/lyrics/" + encodeURIComponent(id);
  }
  try {
    const res = await fetch(url, { signal, cache: "no-store" });
    if (!res.ok) return [];
    const value = await res.json() as { text?: string; format?: string };
    if (value.format !== "lrc" || typeof value.text !== "string") return [];
    return parseLrc(value.text);
  } catch { return []; }
}
