import type { Library } from "./types";

export interface NewRelease {
  id: string;
  title: string;
  artist: string;
  date: string;
  type: string;
  url: string;
}
const CACHE = "musike:new-releases:v4";
const DAY = 86_400_000;
const BATCH_SIZE = 25;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function artistsFromLibrary(lib: Pick<Library, "favorites" | "playlists" | "history">): string[] {
  const scores = new Map<string, number>();
  for (const t of lib.favorites) scores.set(t.artist, (scores.get(t.artist) ?? 0) + 5);
  for (const t of lib.playlists.flatMap((p) => p.tracks)) scores.set(t.artist, (scores.get(t.artist) ?? 0) + 2);
  for (const t of lib.history) scores.set(t.artist, (scores.get(t.artist) ?? 0) + 1);
  return [...scores].filter(([name]) => !!name && name !== "Unknown Artist")
    .sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

export function cached(): { at: number; artists: string; releases: NewRelease[]; checked: number; attempted: number; total: number; nextIndex: number } | null {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE) ?? "null");
    return data && typeof data.at === "number" && Array.isArray(data.releases) ? data : null;
  } catch { return null; }
}

async function itunes<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("iTunes svarade " + response.status);
  return response.json() as Promise<T>;
}
async function itunesReleases(name: string): Promise<NewRelease[]> {
  const search = await itunes<{ results?: { artistId?: number; artistName?: string }[] }>(
    "https://itunes.apple.com/search?term=" + encodeURIComponent(name) + "&entity=musicArtist&limit=10");
  const artist = search.results?.find((a) => a.artistName?.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (!artist?.artistId) return [];
  const data = await itunes<{ results?: { wrapperType?: string; collectionId?: number; collectionName?: string; releaseDate?: string; collectionType?: string }[] }>(
    "https://itunes.apple.com/lookup?id=" + artist.artistId + "&entity=album&limit=200");
  const cutoff = new Date(Date.now() - 180 * DAY).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return (data.results ?? []).filter((a) => a.wrapperType === "collection" && !!a.collectionId &&
    !!a.collectionName && !!a.releaseDate && a.releaseDate.slice(0, 10) >= cutoff &&
    a.releaseDate.slice(0, 10) <= today).map((a) => ({
      id: "itunes:" + a.collectionId, title: a.collectionName!, artist: name,
      date: a.releaseDate!.slice(0, 10), type: a.collectionType ?? "Album",
      url: "https://music.apple.com/album/id" + a.collectionId,
    }));
}
async function mb<T>(path: string): Promise<T> {
  const response = await fetch("https://musicbrainz.org/ws/2/" + path, {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("MusicBrainz svarade " + response.status);
  return response.json() as Promise<T>;
}

async function scanReleases(
  artists: string[], force = false,
): Promise<{ releases: NewRelease[]; updatedAt: number; checked: number; attempted: number; total: number; nextIndex: number }> {
  const names = [...new Set(artists.map((s) => s.trim()).filter(Boolean))];
  const signature = names.join("|");
  const previous = cached();
  if (!force && previous && previous.artists === signature && previous.nextIndex === 0 && Date.now() - previous.at < DAY)
    return { releases: previous.releases, updatedAt: previous.at, checked: previous.checked, attempted: previous.attempted, total: names.length, nextIndex: previous.nextIndex };
  const start = previous?.artists === signature && previous.nextIndex > 0 ? previous.nextIndex : 0;
  const batch = names.slice(start, start + BATCH_SIZE);
  const results: NewRelease[] = previous?.artists === signature && start > 0 ? [...previous.releases] : [];
  let attempted = previous?.artists === signature && start > 0 ? previous.attempted : 0;
  let checked = previous?.artists === signature && start > 0 ? previous.checked : 0;
  let failures = 0;
  let lastRequest = 0;
  const request = async <T>(path: string) => {
    const wait = Math.max(0, 1150 - (Date.now() - lastRequest));
    if (wait) await sleep(wait);
    lastRequest = Date.now();
    return mb<T>(path);
  };
  for (const artist of batch) {
    attempted++;
    try {
      const found = await request<{ artists?: { id: string; name: string; score?: number }[] }>(
        "artist/?query=" + encodeURIComponent('artist:"' + artist.replace(/"/g, "") + '"') + "&fmt=json&limit=3",
      );
      const match = found.artists?.find((a) => a.name.toLocaleLowerCase() === artist.toLocaleLowerCase());
      if (!match) { const fallback=await itunesReleases(artist); results.push(...fallback); checked++; continue; }
      checked++;
      const groups = await request<{ "release-groups"?: { id: string; title: string; "first-release-date"?: string; "primary-type"?: string }[] }>(
        "release-group?artist=" + encodeURIComponent(match.id) + "&type=album|single|ep&limit=100&fmt=json",
      );
      const cutoff = new Date(Date.now() - 180 * DAY).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const allGroups = [...(groups["release-groups"] ?? [])];
      for (let offset = 100; offset < 500 && allGroups.length === offset; offset += 100) {
        const page = await request<{ "release-groups"?: typeof allGroups }>(
          "release-group?artist=" + encodeURIComponent(match.id) + "&type=album|single|ep&limit=100&offset=" + offset + "&fmt=json",
        );
        const more = page["release-groups"] ?? [];
        allGroups.push(...more);
        if (more.length < 100) break;
      }
      checked++;
      for (const g of allGroups) {
        const date = g["first-release-date"] ?? "";
        if (date.length < 10 || date < cutoff || date > today) continue;
        results.push({
          id: g.id, title: g.title, artist: match.name, date,
          type: g["primary-type"] ?? "Släpp",
          url: "https://musicbrainz.org/release-group/" + encodeURIComponent(g.id),
        });
      }
    } catch {
      try { results.push(...await itunesReleases(artist)); checked++; }
      catch { failures++; }
    }
  }
  const releases = [...new Map(results.map((r) => [r.id, r])).values()]
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);
  if (failures === batch.length && batch.length > 0) throw new Error("MusicBrainz kunde inte nås. Tidigare resultat behålls.");
  if (checked === 0 && attempted > 0 && results.length === 0) throw new Error("Inga artister kunde verifieras mot musikkatalogerna.");
  const updatedAt = Date.now();
  const nextIndex = start + batch.length >= names.length ? 0 : start + batch.length;
  const totalAttempted = attempted;
  localStorage.setItem(CACHE, JSON.stringify({ at: updatedAt, artists: signature, releases, checked, attempted: totalAttempted, total: names.length, nextIndex }));
  return { releases, updatedAt, checked, attempted: totalAttempted, total: names.length, nextIndex };
}

let active:Promise<Awaited<ReturnType<typeof scanReleases>>>|undefined;
export function discoverNewReleases(artists:string[],force=false){
 if(active)return active;
 active=scanReleases(artists,force).finally(()=>{active=undefined;});
 return active;
}
export async function preloadReleases(artists:string[]){
 if(!artists.length)return;
 for(let i=0;i<Math.ceil(artists.length/25)+1;i++){
 const r=await discoverNewReleases(artists);
 if(!r.nextIndex)break;
 }
}
