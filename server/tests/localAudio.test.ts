import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { localAudio, localMusicStatus } from "../src/localAudio.js";
import type { Track } from "../src/types.js";

const paths: string[] = [];
async function root() {
  const folder = await mkdtemp(path.join(tmpdir(), "musike-hybrid-"));
  paths.push(folder);
  process.env.MUSIKE_MUSIC_DIR = folder;
  return folder;
}
after(async () => { await Promise.all(paths.map((p) => rm(p, { recursive: true, force: true }))); });
const track: Track = {
  id: "UjWZGLi-1jM", title: "Kryptonite", artist: "3 Doors Down",
  duration: 225, thumb: "", art: "", kind: "song",
};
test("uses a local file only for an exact artist/title match", async () => {
  const dir = await root();
  const artist = path.join(dir, "Singles", "3 Doors Down");
  await mkdir(artist, { recursive: true });
  const song = path.join(artist, "Kryptonite.wav");
  await writeFile(song, Buffer.alloc(100, 1));
  assert.equal((await localAudio(track))?.file, song);
  assert.equal((await localMusicStatus()).indexedFiles, 1);
  assert.equal(await localAudio({ ...track, title: "Another song" }), null);
  assert.equal(await localAudio({ ...track, kind: "video" }), null);
});
test("MusicGrabber normalized artist folders match display names", async () => {
  const dir = await root();
  const artist = path.join(dir, "Singles", "3doorsdown");
  await mkdir(artist, { recursive: true });
  const song = path.join(artist, "Kryptonite.opus");
  await writeFile(song, Buffer.alloc(100, 1));
  assert.equal((await localAudio(track))?.file, song);
});
test("Opus metadata restores the canonical song title after file renaming", async () => {
  const dir = await root();
  const artist = path.join(dir, "Singles", "Sugar Ray");
  await mkdir(artist, { recursive: true });
  const writeField = (value: string) => {
    const text = Buffer.from(value, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32LE(text.length);
    return Buffer.concat([len, text]);
  };
  const one = Buffer.alloc(4);
  one.writeUInt32LE(2);
  const tags = Buffer.concat([
    Buffer.from("OggSplaceholderOpusTags"), writeField("MusicGrabber"), one,
    writeField("ARTIST=Sugar Ray"), writeField("TITLE=Into Yesterday"),
    Buffer.alloc(200),
  ]);
  const file = path.join(artist, "Into Yesterday (Album Version).opus");
  await writeFile(file, tags);
  const local = await localAudio({ ...track, artist: "Sugar Ray", title: "Into Yesterday" });
  assert.equal(local?.file, file);
});
test("ambiguous file matches fall back rather than playing the wrong recording", async () => {
  const dir = await root();
  const artist = path.join(dir, "Singles", "3 Doors Down");
  await mkdir(artist, { recursive: true });
  await writeFile(path.join(artist, "Kryptonite.flac"), Buffer.alloc(100, 1));
  await writeFile(path.join(artist, "Kryptonite.mp3"), Buffer.alloc(100, 2));
  assert.equal(await localAudio(track), null);
  assert.equal((await localMusicStatus()).indexedFiles, 0);
});
test("non-audio files and foreign paths do not become playable", async () => {
  const dir = await root();
  await mkdir(path.join(dir, "Singles", "3 Doors Down"), { recursive: true });
  await writeFile(path.join(dir, "Singles", "3 Doors Down", "Kryptonite.txt"), "no audio");
  assert.equal(await localAudio(track), null);
});
test("missing library keeps YouTube as a fallback", async () => {
  const dir = await root();
  await rm(dir, { recursive: true, force: true });
  assert.equal(await localAudio(track), null);
  assert.deepEqual(await localMusicStatus(), { available: false, indexedFiles: 0, folder: dir });
});
