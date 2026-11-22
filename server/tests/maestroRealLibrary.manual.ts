import assert from "node:assert/strict";
import { createDJMix, type DJPreferences } from "../../web/src/lib/maestroDJ.js";
import type { Library } from "../../web/src/lib/types.js";

const response = await fetch("http://127.0.0.1:4280/api/library");
assert.equal(response.status, 200, "Musike on localhost is available");
const lib = await response.json() as Library;
assert.ok(lib.favorites.length >= 400);
assert.ok(lib.playlists.length >= 2);
const prefs: DJPreferences = {
  mode: "party", familiar: 75, playlistIds: { party: [lib.playlists[0].id] },
};
const a = createDJMix(lib, prefs, { seed: 2026, events: [], size: 50 });
const b = createDJMix(lib, prefs, { seed: 2026, events: [], size: 50 });
assert.ok(a.tracks.length >= 40);
assert.equal(a.tracks.length, new Set(a.tracks.map((t) => t.id)).size);
assert.deepEqual(a.tracks.map((t) => t.id), b.tracks.map((t) => t.id));
const allowed = new Set(lib.playlists[0].tracks.map((t) => t.id));
assert.ok(a.tracks.every((t) => allowed.has(t.id)));
const fallback = createDJMix(lib, { ...prefs, mode: "night" }, { seed: 123, events: [], size: 50 });
assert.ok(fallback.candidates >= a.candidates);
console.log("Real-library Maestro test passed. Favorites", lib.favorites.length,
  "Playlists", lib.playlists.map((p) => p.name + ":" + p.tracks.length).join(", "),
  "Playlist mix", a.tracks.length, "Fallback candidate pool", fallback.candidates);
