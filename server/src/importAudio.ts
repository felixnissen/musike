import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { tools } from "./tools.js";
import { mkdir, lstat, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { Track } from "./types.js";
import * as library from "./library.js";

export const IMPORT_LIMIT = 128 * 1024 * 1024;
const root = () => path.join(config.dataDir, "imported-audio");
const formats = {
  mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", m4a: "audio/mp4",
} as const;
type Format = keyof typeof formats;
export function audioFormat(b: Buffer): Format | null {
  if (b.length < 32) return null;
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WAVE") return "wav";
  if (b.toString("ascii", 0, 4) === "fLaC") return "flac";
  if (b.toString("ascii", 0, 4) === "OggS") return "ogg";
  if (b.toString("ascii", 4, 8) === "ftyp") return "m4a";
  if (b.toString("ascii", 0, 3) === "ID3" || (b[0] === 255 && (b[1] & 224) === 224 && (b[1] & 6) !== 0)) return "mp3";
  return null;
}
const exec = promisify(execFile);
async function probeMetadata(file:string):Promise<Partial<Pick<Track,"title"|"artist"|"album"|"duration">>> {
  const ffmpeg=tools().ffmpeg;
  if(!ffmpeg)return {};
  const ffprobe=path.join(path.dirname(ffmpeg),process.platform==="win32"?"ffprobe.exe":"ffprobe");
  if(!existsSync(ffprobe))return {};
  try {
    const {stdout}=await exec(ffprobe,["-v","error","-protocol_whitelist","file,pipe","-show_entries","format=duration:format_tags=title,artist,album","-of","json",file],{windowsHide:true,timeout:8000,maxBuffer:256*1024});
    const {format}=JSON.parse(stdout);const tags=Object.fromEntries(Object.entries(format?.tags||{}).map(([k,v])=>[k.toLowerCase(),v]));
    const clean=(x:unknown)=>typeof x==="string"&&x.trim()?x.trim().slice(0,300):undefined;
    const duration=Number(format?.duration);
    return { ...(clean(tags.title)?{title:clean(tags.title)}:{}), ...(clean(tags.artist)?{artist:clean(tags.artist)}:{}), ...(clean(tags.album)?{album:clean(tags.album)}:{}), ...(Number.isFinite(duration)&&duration>=0?{duration:Math.round(duration)}:{}) };
  }catch{return {};}
}
export async function storeImportedAudio(bytes: Buffer, name: string, source: "suno" | "local" | "musicgrabber"): Promise<Track> {
  const format = audioFormat(bytes);
  if (!format || bytes.length > IMPORT_LIMIT) throw Object.assign(new Error("Unsupported audio or file too large (128 MB max)."), { statusCode: 400 });
  const id = "local-" + createHash("sha256").update(bytes).digest("hex");
  await mkdir(root(), { recursive: true });
  const file = path.join(root(), id + "." + format);
  const temp = path.join(root(), randomUUID() + ".partial");
  try {
    await writeFile(temp, bytes, { flag: "wx" });
    try { await rename(temp, file); }
    catch (e) { if (!(await importedAudio(id))) throw e; }
  } finally { await rm(temp, { force: true }); }
  const clean = path.basename(name.replace(/\\/g, "/")).replace(/\.[^.]+$/, "").trim().slice(0, 300) || "Untitled";
  const parts = clean.split(" - ");
  const metadata=await probeMetadata(file);
  return { id, title: parts.length > 1 ? parts.slice(1).join(" - ") : clean, artist: parts.length > 1 ? parts[0] : source === "suno" ? "Suno" : "Local", duration: 0, thumb: "", art: "", kind: "song", ...metadata };
}
export async function importedAudio(id: string): Promise<{ file: string; mime: string } | null> {
  if (!/^local-[a-f0-9]{64}$/.test(id)) return null;
  for (const [ext, mime] of Object.entries(formats)) {
    const file = path.join(root(), id + "." + ext);
    try { if ((await lstat(file)).isFile()) return { file, mime }; } catch { /* absent */ }
  }
  return null;
}

export type ImportSource = "suno" | "local" | "musicgrabber";
const playlistName = { suno: "Suno", local: "Local imports", musicgrabber: "MusicGrabber" } as const;
let queue: Promise<unknown> = Promise.resolve();
/** Commit each file immediately; interrupted batches can be retried without duplicate playlist entries. */
export function importAudioToLibrary(bytes: Buffer, name: string, source: ImportSource) {
  const task = queue.then(async () => {
    const track = await storeImportedAudio(bytes, name, source);
    const saved = await library.getLibrary();
    const p = saved.playlists.find(p => p.name === playlistName[source]);
    const old = p?.tracks.find(t => t.id === track.id);
    if (old) return { track: old, playlistId: p!.id, duplicate: true };
    const playlist = p ? await library.addToPlaylist(p.id, track) : await library.createPlaylist(playlistName[source], [track]);
    return { track, playlistId: playlist.id, duplicate: false };
  });
  queue = task.catch(() => {});
  return task;
}
