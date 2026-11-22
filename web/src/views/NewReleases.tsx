import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { artistsFromLibrary, discoverNewReleases, type NewRelease } from "../lib/newReleases";
import { paths } from "../lib/routes";
import { useLibrary } from "../stores/library";

const FOLLOW_KEY = "musike:release-watch-artists:v1";
function readFollowed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FOLLOW_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string").slice(0, 100) : [];
  } catch { return []; }
}

export default function NewReleases() {
  const favorites = useLibrary((s) => s.favorites);
  const playlists = useLibrary((s) => s.playlists);
  const history = useLibrary((s) => s.history);
  const [followed, setFollowed] = useState(readFollowed);
  const [input, setInput] = useState("");
  const [releases, setReleases] = useState<NewRelease[]>([]);
  const [updated, setUpdated] = useState<number | null>(null);
  const [coverage, setCoverage] = useState({ checked: 0, attempted: 0, total: 0, nextIndex: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const artists = useMemo(() => [...new Set([...followed, ...artistsFromLibrary({ favorites, playlists, history })])], [followed, favorites, playlists, history]);
  const signature = artists.join("|");
  const [scan, setScan] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void discoverNewReleases(artists).then((result) => {
      if (!active) return;
      setReleases(result.releases);
      setUpdated(result.updatedAt);
      setCoverage({ checked: result.checked, attempted: result.attempted, total: result.total, nextIndex: result.nextIndex });
      if (result.nextIndex > 0 && result.attempted < result.total) setScan((n) => n + 1);
    }).catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [signature, scan]);
  const add = () => {
    const name = input.trim();
    if (!name || followed.some((a) => a.toLowerCase() === name.toLowerCase())) return;
    const next = [...followed, name];
    setFollowed(next);
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(next));
    setInput("");
  };
  return <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Ny musik</h1>
        <p className="text-sm text-fg-2">Nya släpp från dina artister · uppdateras högst en gång per dygn när appen används</p></div>
      <Link to={paths.library} className="text-sm text-accent">Bibliotek</Link>
    </div>
    <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2">
      <input aria-label="Följ artist" value={input} onChange={(e) => setInput(e.target.value)}
        placeholder="Följ en artist..." className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2 text-fg" />
      <button className="rounded-xl bg-accent px-4 py-2 text-bg" type="submit">Följ</button>
    </form>
    {followed.length > 0 && <div className="flex flex-wrap gap-2">{followed.map((artist) =>
      <button key={artist} type="button" className="rounded-full bg-surface-2 px-3 py-1 text-xs"
        title={"Sluta följa " + artist} onClick={() => {
          const next = followed.filter((a) => a !== artist);
          setFollowed(next); localStorage.setItem(FOLLOW_KEY, JSON.stringify(next));
        }}>{artist} ×</button>)}</div>}
    <div className="flex items-center justify-between gap-3 text-xs text-fg-2">
      <span>{updated ? "Kontrollerad " + new Date(updated).toLocaleString("sv-SE") : "Ingen kontroll ännu"} · {coverage.checked} matchade / {coverage.attempted} sökta av {artists.length} artister</span>
      <button type="button" disabled={loading} onClick={() => {
        setLoading(true);
        void discoverNewReleases(artists, true).then((r) => { setReleases(r.releases); setUpdated(r.updatedAt); setCoverage({ checked: r.checked, attempted: r.attempted, total: r.total, nextIndex: r.nextIndex }); setError(""); })
          .catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
      }} className="rounded-lg bg-surface-2 px-3 py-2 disabled:opacity-50">Uppdatera nu</button>
    </div>
    {loading && <p className="text-sm text-fg-2">Söker nya släpp…</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {!loading && !releases.length && <p className="rounded-xl bg-surface-2 p-4 text-sm text-fg-2">
      {coverage.attempted < artists.length ? "Sökningen är inte färdig. Tryck Uppdatera nu för nästa grupp artister." : "Inga bekräftade släpp hittades i de kontrollerade resultaten. Alla katalogposter är inte garanterat fullständiga."}
    </p>}
    <ul className="space-y-2">{releases.map((release) => <li key={release.id} className="rounded-xl bg-surface-2 p-3">
      <a href={release.url} target="_blank" rel="noopener noreferrer" className="block">
        <strong className="block">{release.title}</strong>
        <span className="text-sm text-fg-2">{release.artist} · {release.type} · {release.date}</span>
      </a>
    </li>)}</ul>
    <p className="text-xs text-fg-3">Källa: MusicBrainz. Släppdatum kan vara ofullständiga. Musik spelas inte upp eller laddas ned automatiskt.</p>
  </div>;
}
