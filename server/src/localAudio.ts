import { homedir } from "node:os";
import { lstat, readdir, realpath, open } from "node:fs/promises";
import path from "node:path";
import type { Track } from "./types.js";

// MusicGrabber's default Windows library: Music/MusicGrabber/Singles/<Artist>/<Title>.ext.
// No files are moved, written or modified by Musike.
const AUDIO_EXTENSIONS = new Set([".flac", ".mp3", ".m4a", ".aac", ".opus", ".ogg", ".wav"]);
const MIME: Record<string, string> = {
  ".flac": "audio/flac", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
  ".aac": "audio/aac", ".opus": "audio/ogg", ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};
export const musicRoot = () => process.env.MUSIKE_MUSIC_DIR || path.join(homedir(), "Music", "MusicGrabber");
const normal = (input: string) => input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
const key = (artist: string, title: string) => normal(artist).replace(/ /g, "") + "\\x00" + normal(title);
type Tags = { artist?: string; title?: string };

/** Read OpusTags without loading the audio file. MusicGrabber can rename the
 * downloaded file after MusicBrainz matches the recording; the actual TITLE
 * tag then identifies the original playlist track correctly.
 */
async function opusMetadata(file: string): Promise<Tags | null> {
  const fd = await open(file, "r");
  const buffer = Buffer.alloc(32768);
  let bytesRead = 0;
  try { ({ bytesRead } = await fd.read(buffer, 0, buffer.length, 0)); }
  finally { await fd.close(); }
  const start = buffer.subarray(0, bytesRead).indexOf("OpusTags");
  if (start < 0) return null;
  let offset = start + 8;
  const field = () => {
    if (offset + 4 > bytesRead) return null;
    const size = buffer.readUInt32LE(offset);
    offset += 4;
    if (size > 16384 || offset + size > bytesRead) return null;
    const value = buffer.subarray(offset, offset + size).toString("utf8");
    offset += size;
    return value;
  };
  if (field() === null || offset + 4 > bytesRead) return null;
  const count = buffer.readUInt32LE(offset);
  offset += 4;
  const result: Tags = {};
  for (let i = 0; i < Math.min(count, 256); i++) {
    const comment = field();
    if (!comment) break;
    const idx = comment.indexOf("=");
    if (idx < 0) continue;
    const name = comment.slice(0, idx).toLowerCase();
    if ((name === "artist" || name === "title") && !result[name])
      result[name] = comment.slice(idx + 1).trim();
  }
  return result;
}

type Entry = { file: string; mime: string };
const cache = new Map<string, Entry | null>();
let refreshAt = 0;
let inflight: Promise<void> | null = null;
let count = 0;
let rootReal: string | null = null;
let rootName = "";

/**
 * Only files with an unambiguous Artist/Title match are used. A YouTube ID is
 * never interpreted as a local path. Ambiguous matches fall back to YouTube.
 */
async function scan() {
  const root = path.resolve(musicRoot());
  const files = new Map<string, Entry | null>();
  let real: string;
  try { real = await realpath(root); } catch {
    cache.clear(); count = 0; rootReal = null; refreshAt = Date.now(); return;
  }
  const limit = 20000;
  let examined = 0;
  async function walk(dir: string, depth: number) {
    if (depth > 6 || examined >= limit) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (++examined > limit) break;
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Only expected MusicGrabber subfolders are traversed.
        if (depth === 0 && !["Singles", "Playlists", "Albums"].includes(entry.name)) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!AUDIO_EXTENSIONS.has(ext)) continue;
        const rel = path.relative(root, full).split(path.sep);
        let artist = "";
        let title = path.basename(entry.name, ext);
        if (rel[0] === "Singles" && rel.length >= 3) {
          artist = rel[rel.length - 2];
        } else if (rel[0] === "Albums" && rel.length >= 4) {
          artist = rel[1];
          title = title.replace(/^\d+[.\s-]+/, "");
        } else if (rel[0] === "Playlists" && rel.length >= 3) {
          const match = /^(.+?) - (.+)$/.exec(title);
          if (!match) continue;
          artist = match[1]; title = match[2];
        } else continue;
        // MusicGrabber writes the canonical recording title to metadata; use it
        // before filenames such as "Into Yesterday (Album Version).opus".
        if (ext === ".opus") {
          try {
            const tags = await opusMetadata(full);
            if (tags?.artist && tags.title) {
              artist = tags.artist;
              title = tags.title;
            }
          } catch { /* still use the filename if tags cannot be read */ }
        }
        const id = key(artist, title);
        if (!artist || !title || id.charCodeAt(0) === 0) continue;
        if (files.has(id)) files.set(id, null);
        else files.set(id, { file: full, mime: MIME[ext] });
      }
    }
  }
  await walk(root, 0);
  cache.clear();
  for (const [id, file] of files) cache.set(id, file);
  count = [...files.values()].filter(Boolean).length;
  rootReal = real;
  rootName = root;
  refreshAt = Date.now();
}

async function ensureIndex() {
  if (rootName === path.resolve(musicRoot()) && Date.now() - refreshAt < 30_000) return;
  if (!inflight) inflight = scan().finally(() => { inflight = null; });
  await inflight;
}

export async function localAudio(track: Track): Promise<Entry | null> {
  if (track.kind !== "song" || !track.artist || !track.title) return null;
  await ensureIndex();
  const found = cache.get(key(track.artist, track.title));
  if (!found || !rootReal) return null;
  try {
    const st = await lstat(found.file);
    if (!st.isFile() || st.size < 32) return null;
    const resolved = await realpath(found.file);
    const relative = path.relative(rootReal, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return found;
  } catch { return null; }
}

export async function localMusicStatus() {
  await ensureIndex();
  return { available: rootReal !== null, indexedFiles: count, folder: musicRoot() };
}
