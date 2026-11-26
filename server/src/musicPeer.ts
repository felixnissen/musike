import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { config } from "./config.js";
import * as library from "./library.js";
import { localAudio, localLyrics, localMusicStatus } from "./localAudio.js";
import { TRACK_ID } from "./types.js";
import { getAccountState, loginAccount, logout, registerAccount, SyncError, updateAccountState } from "./accountSync.js";

const PORT = Number(process.env.MUSIKE_PEER_PORT || 4283);
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
    if (origin === "http://127.0.0.1:4280" || origin === "http://localhost" || origin === "capacitor://localhost" || origin === "https://localhost") {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Musike-Pairing");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(origin === "http://127.0.0.1:4280" || origin === "http://localhost" || origin === "capacitor://localhost" || origin === "https://localhost" ? 204 : 403);
      res.end();
      return;
    }
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    try {
      if (!req.url) return send(404, { error: "missing" });
      const url = new URL(req.url, "http://127.0.0.1");
      // Account sync is intentionally separate from music streaming: it never
      // exposes the unauthenticated desktop library, and never needs music files.
      if (url.pathname.startsWith("/v1/sync/")) {
        const bearer = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || "")?.[1] ?? null;
        const body = async () => {
          let received = "";
          for await (const chunk of req) {
            received += chunk.toString("utf8");
            if (Buffer.byteLength(received, "utf8") > 8.5 * 1024 * 1024)
              throw new SyncError(413, "Request too large.");
          }
          try { return JSON.parse(received) as Record<string, unknown>; }
          catch { throw new SyncError(400, "Invalid JSON."); }
        };
        try {
          if (url.pathname === "/v1/sync/register" && req.method === "POST") {
            if (!authorized(req.headers["x-musike-pairing"] as string | null))
              throw new SyncError(403, "Pairing key required to create an account.");
            const v = await body();
            return send(200, await registerAccount(String(v.username || ""), String(v.password || "")));
          }
          if (url.pathname === "/v1/sync/login" && req.method === "POST") {
            const v = await body();
            return send(200, await loginAccount(String(v.username || ""), String(v.password || ""), req.socket.remoteAddress || "unknown"));
          }
          if (url.pathname === "/v1/sync/logout" && req.method === "POST") {
            await logout(bearer); return send(200, { ok: true });
          }
          if (url.pathname === "/v1/sync/state" && req.method === "GET")
            return send(200, await getAccountState(bearer));
          if (url.pathname === "/v1/sync/state" && req.method === "PUT") {
            const v = await body();
            return send(200, await updateAccountState(bearer, Number(v.revision), v.backup));
          }
          return send(404, { error: "not found" });
        } catch (e) {
          return send(e instanceof SyncError ? e.status : 500, { error: e instanceof SyncError ? e.message : "internal" });
        }
      }
      if (!authorized(url.searchParams.get("token"))) return send(401, { error: "unauthorized" });
      if (url.pathname === "/v1/health") return send(200, { ok: true });
      if (url.pathname === "/v1/catalog" && req.method === "GET") {
        const saved = await library.getLibrary();
        const unique = new Map([...saved.favorites, ...saved.history,
          ...saved.playlists.flatMap((p) => p.tracks)].map((t) => [t.id, t]));
        const tracks: Array<{ id: string; title: string; artist: string; duration: number; hasLyrics: boolean }> = [];
        for (const t of unique.values()) {
          const file = await localAudio(t);
          if (!file) continue;
          // No file paths, directories, library favorites, history, account data,
          // or metadata outside locally matched songs are exposed.
          tracks.push({
            id: t.id, title: t.title, artist: t.artist, duration: t.duration,
            hasLyrics: !!(await localLyrics(t)),
          });
        }
        return send(200, { version: 1, total: tracks.length, tracks });
      }
      if (req.method !== "GET" && req.method !== "HEAD") return send(405, { error: "method" });
      const lyricMatch = /^\/v1\/lyrics\/([\w-]{11}|local-[a-f0-9]{64})$/.exec(url.pathname);
      if (lyricMatch && TRACK_ID.test(lyricMatch[1])) {
        const id = lyricMatch[1];
        const lib = await library.getLibrary();
        const track = [...lib.favorites, ...lib.history, ...lib.playlists.flatMap((p) => p.tracks)]
          .find((t) => t.id === id);
        const lrc = track ? await localLyrics(track) : null;
        if (!lrc) return send(404, { error: "Lyrics not found" });
        return send(200, { format: "lrc", text: lrc, source: "MusicGrabber" });
      }
      const match = /^\/v1\/(available|stream)\/([\w-]{11}|local-[a-f0-9]{64})$/.exec(url.pathname);
      if (!match || !TRACK_ID.test(match[2])) return send(404, { error: "not found" });
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
