import assert from "node:assert/strict";
import { smartShuffle, type PlayEvent } from "../../web/src/lib/smartShuffle.js";
import type { Track } from "../../web/src/lib/types.js";

function track(id: number, artist: string): Track {
  return { id: "t" + id, title: "Song " + id, artist, duration: 180, thumb: "", art: "", kind: "song" };
}
const now = Date.UTC(2026, 10, 22);
const songs = Array.from({ length: 440 }, (_, i) => track(i, "Artist " + Math.floor(i / 4)));
const history: PlayEvent[] = songs.slice(0, 20).map((t, i) => ({
  id: t.id, artist: t.artist, at: now - i * 3_600_000,
}));
const first = smartShuffle(songs, { events: history, seed: 42, now });
const second = smartShuffle(songs, { events: history, seed: 42, now });
assert.deepEqual(first.map((t) => t.id), second.map((t) => t.id), "seeded output");
assert.deepEqual(first.map((t) => t.id).sort(), songs.map((t) => t.id).sort(), "preserves every occurrence");
assert.equal(new Set(first.map((t) => t.id)).size, 440, "no repeats or loss");
assert.equal(first.slice(0, 20).filter((t) => history.some((h) => h.id === t.id)).length, 0,
  "recently played tracks are strongly disfavored");
for (let i = 1; i < 35; i++) {
  assert.notEqual(first[i].artist, first[i - 1].artist, "artist spread");
}
assert.deepEqual(smartShuffle([track(1, "A")]), [track(1, "A")]);
const duplicates = [track(1, "A"), track(1, "A"), track(2, "A"), track(3, "A")];
assert.equal(smartShuffle(duplicates, { seed: 77, now, events: [] }).length, duplicates.length,
  "single-artist playlists cannot deadlock");
assert.equal(smartShuffle([], { seed: 123 }).length, 0);
let skippedPickedFirst = 0;
for (let seed = 0; seed < 100; seed++) {
  const order = smartShuffle([track(500, "A"), track(501, "B")], {
    seed, now, events: [{ id: "t500", artist: "A", at: now - 60_000, skipped: true }],
  });
  if (order[0].id === "t500") skippedPickedFirst++;
}
assert.ok(skippedPickedFirst < 25, "recently skipped track should rarely be first: " + skippedPickedFirst);
console.log("Smart Shuffle tests passed");
