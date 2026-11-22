import assert from "node:assert/strict";
import { createDJMix, DJ_MODES, type DJPreferences, type DJPlay } from "../../web/src/lib/maestroDJ.js";
import type { Track, Playlist } from "../../web/src/lib/types.js";

function track(n: number, artist = "Artist " + Math.floor(n / 4)): Track {
  return { id: "song" + n, title: "Track " + n, artist, duration: 190, thumb: "", art: "", kind: "song" };
}
const first = Array.from({ length: 100 }, (_, i) => track(i));
const second = Array.from({ length: 100 }, (_, i) => track(i + 100));
const now = Date.UTC(2026, 10, 22);
const playlists: Playlist[] = [
  { id: "party", name: "Fest", createdAt: 1, updatedAt: 1, tracks: [...first, first[0]] },
  { id: "sleep", name: "Chill", createdAt: 1, updatedAt: 1, tracks: second },
];
const prefs: DJPreferences = {
  mode: "party", familiar: 80,
  playlistIds: { party: ["party"], chill: ["sleep"], singalong: [], night: [], custom: [] },
};
const library = { favorites: [...first.slice(0, 20)], playlists, history: first.slice(0, 5) };
const output = createDJMix(library, prefs, { seed: 3, now, events: [], size: 50 });
assert.equal(output.candidates, 100);
assert.equal(output.tracks.length, 50);
assert.equal(output.matchedPlaylists, 1);
assert.equal(output.basis, "playlists");
assert.equal(new Set(output.tracks.map((x) => x.id)).size, 50);
assert.ok(output.tracks.every((x) => first.some((item) => item.id === x.id)));
assert.deepEqual(output.tracks.map((x) => x.id),
  createDJMix(library, prefs, { seed: 3, now, events: [], size: 50 }).tracks.map((x) => x.id));
const chill = createDJMix(library, { ...prefs, mode: "chill" }, { seed: 3, now, events: [], size: 50 });
assert.ok(chill.tracks.every((x) => second.some((item) => item.id === x.id)));
assert.equal(chill.candidates, 100);
const fallback = createDJMix(library, { ...prefs, mode: "night" }, { seed: 5, now, events: [] });
assert.equal(fallback.basis, "library");
assert.equal(fallback.candidates, 200);
assert.equal(fallback.tracks.length, 50);
const missing = createDJMix(library, { ...prefs, playlistIds: { party: ["missing"] } }, { seed: 5, now, events: [] });
assert.equal(missing.basis, "library");
const noSongs = createDJMix({ favorites: [], playlists: [], history: [] }, prefs, { seed: 1, now, events: [] });
assert.equal(noSongs.tracks.length, 0);
assert.equal(DJ_MODES.length, 5);

// This tests observed listening behavior by mode, without imaginary genre/energy data.
const few = [track(500, "A"), track(501, "B"), track(502, "C")];
const fewList = { favorites: few, playlists: [], history: few };
const stats: DJPlay[] = Array.from({ length: 8 }, () => ({
  trackId: "song500", mode: "party" as const, at: now - 60_000, skipped: false,
})).concat(Array.from({ length: 8 }, () => ({
  trackId: "song501", mode: "chill" as const, at: now - 60_000, skipped: false,
})));
const byMode = (mode: DJPreferences["mode"]) => {
  let song500First = 0;
  for (let seed = 0; seed < 120; seed++)
    if (createDJMix(fewList, { ...prefs, mode }, { events: stats, now, size: 1, seed }).tracks[0].id === "song500")
      song500First++;
  return song500First;
};
assert.ok(byMode("party") > byMode("chill") + 12, "mode-specific favorites should affect first song");
console.log("Maestro DJ tests passed: five modes, curated pools, fallback, deterministic queue, no losses, mode-specific taste.");
