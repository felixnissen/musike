import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { config } from "./config.js";
import * as library from "./library.js";
import { localAudio, localMusicStatus } from "./localAudio.js";
import { VIDEO_ID } from "./types.js";

const PORT = 4283;
let token: string | null = null;
let server: Server | null = null;

/** Separate from the normal Musike API and reachable only over loopback.
 * Tailscale Serve can expose it through authenticated, encrypted HTTPS
 * without exposing the rest of Musike.
 */
async function secret() {
  if (token) return token;
  const secretPath = path.join(config.dataDir, "music-peer-secret");
  try {
    const saved = (await readFile(secretPath, "utf8")).trim();
    if (/^[a-f0-9]{64}$/.test(saved)) return token = saved;
  } catch { /* first setup */ }
  const value = randomBytes(32).toString("hex");
  await mkdir(config.dataDir, { recursive: true });
  await writeFile(secretPath, value, { flag: "wx", mode: 0o600 }).catch(async (e: NodeJS.ErrnoException) => {
    if (e.code !== "EEXIST") throw e;
  });
  token = (await readFile(secretPath, "utf8")).trim();
  return token;
}

function authorized(value: string | null): boolean {
  if (!token || !value || !/^[a-f0-9]{64}$/.test(value)) return false;
  return timingSafeEqual(Buffer.from(value, "hex"), Buffer.from(token, "hex"));
}

export async function pairingInfo() {
  await secret();
  return { enabled: true, port: PORT, token };
}

export async function startMusicPeerServer(): Promise<() => Promise<void>> {
  if (server) return async () => {};
  await secret();
  const instance = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    // Capacitor's WebView fetches the availability probe; the stream is
    // opened by the media element itself.
    const origin = req.headers.origin;
    if (origin === "http://localhost" || origin === "capacitor://localhost" || origin === "https://localhost") {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    try {
      if (!req.url) return send(404, { error: "missing" });
      const url = new URL(req.url, "http://127.0.0.1");
      if (!authorized(url.searchParams.get("token"))) return send(401, { error: "unauthorized" });
      if (url.pathname === "/v1/health") return send(200, { ok: true });
      if (req.method !== "GET" && req.method !== "HEAD") return send(405, { error: "method" });
      const match = /^\/v1\/(available|stream)\/([\w-]{11})$/.exec(url.pathname);
      if (!match || !VIDEO_ID.test(match[2])) return send(404, { error: "not found" });
      const [, action, id] = match;
      const saved = await library.getLibrary();
      const track = [...saved.favorites, ...saved.history, ...saved.playlists.flatMap((x) => x.tracks)]
        .find((x) => x.id === id);
      const local = track ? await localAudio(track) : null;
      if (!local) return send(404, { available: false });
      if (action === "available") return send(200, { available: true });
      const { size } = await stat(local.file);
      const range = typeof req.headers.range === "string" ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range) : null;
      const common = { "Content-Type": local.mime, "Accept-Ranges": "bytes" };
      if (!range) {
        res.writeHead(200, { ...common, "Content-Length": size });
        if (req.method === "HEAD") return res.end();
        createReadStream(local.file).on("error", () => res.destroy()).pipe(res);
        return;
      }
      let start = range[1] ? Number(range[1]) : NaN;
      let end = range[2] ? Number(range[2]) : size - 1;
      if (Number.isNaN(start)) { start = Math.max(0, size - end); end = size - 1; }
      end = Math.min(end, size - 1);
      if (start >= size || end < start) {
        res.writeHead(416, { ...common, "Content-Range": "bytes */" + size });
        return res.end();
      }
      res.writeHead(206, { ...common, "Content-Range": "bytes " + start + "-" + end + "/" + size, "Content-Length": end - start + 1 });
      if (req.method === "HEAD") return res.end();
      createReadStream(local.file, { start, end }).on("error", () => res.destroy()).pipe(res);
    } catch {
      if (!res.headersSent) send(500, { error: "internal" });
      else res.destroy();
    }
  });
  await new Promise<void>((resolve, reject) => {
    instance.once("error", reject);
    instance.listen(PORT, "127.0.0.1", resolve);
  });
  server = instance;
  return async () => {
    await new Promise<void>((resolve) => instance.close(() => resolve()));
    if (server === instance) server = null;
  };
}
