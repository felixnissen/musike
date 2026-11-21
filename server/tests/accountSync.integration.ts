import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const folder = await mkdtemp(path.join(tmpdir(), "musike-sync-api-test-"));
process.env.MUSIKE_DATA_DIR = folder;
process.env.MUSIKE_PEER_PORT = "4393";
const { pairingInfo, startMusicPeerServer } = await import("../src/musicPeer.js");
const close = await startMusicPeerServer();
const base = "http://127.0.0.1:4393";
const name = "testuser_" + Math.random().toString(36).slice(2, 8);
const password = "a-long-test-password-" + Math.random().toString(36).slice(2);
const backup = {
  format: "musike-backup", version: 1, exportedAt: new Date().toISOString(), app: "test",
  library: { favorites: [{ id: "UjWZGLi-1jM", title: "Kryptonite", artist: "3 Doors Down", duration: 100, thumb: "", art: "", kind: "song" }], playlists: [], history: [] },
  settings: { theme: "dark" },
};
async function call(route: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(base + route, {
    method,
    headers: { ...headers, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
try {
  const { token } = await pairingInfo();
  assert.equal((await call("/v1/sync/register", "POST", { username: name, password })).status, 403);
  const registered = await call("/v1/sync/register", "POST", { username: name, password }, { "X-Musike-Pairing": token });
  assert.equal(registered.status, 200);
  const registeredSession = registered.data.session;
  assert.match(registeredSession, /^[a-f0-9]{64}$/);
  assert.equal((await call("/v1/sync/login", "POST", { username: name, password: "wrong" })).status, 401);
  const logged = await call("/v1/sync/login", "POST", { username: name, password });
  assert.equal(logged.status, 200);
  const auth = { Authorization: "Bearer " + logged.data.session };
  const savedDb = await readFile(path.join(folder, "sync-accounts.json"), "utf8");
  assert.equal(savedDb.includes(password), false);
  assert.equal(savedDb.includes(logged.data.session), false);
  const first = await call("/v1/sync/state", "GET", undefined, auth);
  assert.equal(first.status, 200);
  assert.equal(first.data.revision, 0);
  assert.equal(first.data.backup, null);
  const saved = await call("/v1/sync/state", "PUT", { revision: 0, backup }, auth);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.revision, 1);
  const conflict = await call("/v1/sync/state", "PUT", { revision: 0, backup }, auth);
  assert.equal(conflict.status, 409);
  const fetched = await call("/v1/sync/state", "GET", undefined, auth);
  assert.equal(fetched.status, 200);
  assert.deepEqual(fetched.data.backup.library, backup.library);
  const bad = await call("/v1/sync/state", "PUT", { revision: 1, backup: { empty: true } }, auth);
  assert.equal(bad.status, 400);
  const cors = await fetch(base + "/v1/sync/state", {
    method: "OPTIONS", headers: { Origin: "http://127.0.0.1:4280", "Access-Control-Request-Headers": "authorization,content-type" },
  });
  assert.equal(cors.status, 204);
  assert.equal(cors.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:4280");
  await call("/v1/sync/logout", "POST", undefined, auth);
  assert.equal((await call("/v1/sync/state", "GET", undefined, auth)).status, 401);
  console.log("PASS registration, login, wrong password, sync revision, conflict, readback, validation, CORS, logout");
} finally {
  await close();
  await rm(folder, { recursive: true, force: true });
}
