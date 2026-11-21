import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

interface Account {
  salt: string;
  hash: string;
  revision: number;
  backup: Record<string, unknown> | null;
  sessions?: Array<{ digest: string; expires: number }>;
}
type DB = { accounts: Record<string, Account> };
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const ATTEMPTS = new Map<string, { count: number; until: number }>();
const FILE = () => path.join(config.dataDir, "sync-accounts.json");
let serial = Promise.resolve();
const usernameOk = (name: string) => /^[a-z0-9][a-z0-9_-]{2,31}$/.test(name);
const passwordOk = (s: string) => s.length >= 12 && s.length <= 256;
const hash = (password: string, salt: string) => scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex");
function equal(a: string, b: string) {
  if (!/^[a-f0-9]{128}$/.test(a) || !/^[a-f0-9]{128}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
async function read(): Promise<DB> {
  try {
    const data = JSON.parse(await readFile(FILE(), "utf8")) as DB;
    if (data && data.accounts && typeof data.accounts === "object") return data;
  } catch { /* no users created */ }
  return { accounts: {} };
}
async function save(data: DB): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  const tmp = FILE() + ".next";
  await writeFile(tmp, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
  await rename(tmp, FILE());
}
async function transaction<T>(fn: (data: DB) => Promise<T>): Promise<T> {
  const run = serial.then(() => read().then(fn));
  serial = run.then(() => {}, () => {});
  return run;
}
function newSession(username: string, account: Account) {
  const session = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 30 * 86400_000;
  account.sessions = (account.sessions ?? []).filter((s) => s.expires > Date.now()).slice(-9);
  account.sessions.push({ digest: digest(session), expires: expiresAt });
  return { session, username, expiresAt };
}
export class SyncError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function registerAccount(username: string, password: string) {
  username = username.toLowerCase().trim();
  if (!usernameOk(username) || !passwordOk(password)) throw new SyncError(400, "Use 3–32 letters/numbers for the username and a password of at least 12 characters.");
  return transaction(async (db) => {
    if (Object.keys(db.accounts).length >= 8) throw new SyncError(403, "Account limit reached.");
    if (db.accounts[username]) throw new SyncError(409, "Username already exists.");
    const salt = randomBytes(16).toString("hex");
    db.accounts[username] = { salt, hash: hash(password, salt), revision: 0, backup: null };
    const result = newSession(username, db.accounts[username]);
    await save(db);
    return result;
  });
}
export async function loginAccount(username: string, password: string, client: string) {
  username = username.toLowerCase().trim();
  const attempt = ATTEMPTS.get(client);
  if (attempt && attempt.until > Date.now() && attempt.count >= 5) throw new SyncError(429, "Too many attempts. Try later.");
  return transaction(async (db) => {
    const account = db.accounts[username];
    const salt = account?.salt ?? "0".repeat(32);
    const candidate = hash(password, salt);
    if (!account || !equal(candidate, account.hash)) {
      const count = attempt && attempt.until > Date.now() ? attempt.count + 1 : 1;
      ATTEMPTS.set(client, { count, until: Date.now() + 5 * 60_000 });
      throw new SyncError(401, "Invalid username or password.");
    }
    ATTEMPTS.delete(client);
    const result = newSession(username, account);
    await save(db);
    return result;
  });
}
async function usernameFor(session: string | null): Promise<string> {
  if (!session || !/^[a-f0-9]{64}$/.test(session)) throw new SyncError(401, "Log in first.");
  const id = digest(session);
  const db = await read();
  for (const [username, account] of Object.entries(db.accounts)) {
    if ((account.sessions ?? []).some((item) => item.expires > Date.now() && item.digest === id)) return username;
  }
  throw new SyncError(401, "Session expired. Please log in again.");
}
export async function logout(session: string | null) {
  if (!session || !/^[a-f0-9]{64}$/.test(session)) return;
  await transaction(async (db) => {
    const id = digest(session);
    let changed = false;
    for (const a of Object.values(db.accounts)) {
      const before = a.sessions?.length ?? 0;
      a.sessions = (a.sessions ?? []).filter((t) => t.digest !== id);
      if (a.sessions.length !== before) changed = true;
    }
    if (changed) await save(db);
  });
}
export async function getAccountState(session: string | null) {
  const username = await usernameFor(session);
  const db = await read();
  const account = db.accounts[username];
  if (!account) throw new SyncError(401, "Account no longer exists.");
  return { username, revision: account.revision, backup: account.backup };
}
export async function updateAccountState(session: string | null, revision: number, backup: unknown) {
  const username = await usernameFor(session);
  if (!Number.isInteger(revision) || revision < 0) throw new SyncError(400, "Invalid revision.");
  if (!backup || typeof backup !== "object") throw new SyncError(400, "Invalid backup.");
  const b = backup as Record<string, unknown>;
  const lib = b.library as Record<string, unknown> | null;
  if (b.format !== "musike-backup" || b.version !== 1 ||
      !lib || !Array.isArray(lib.favorites) || !Array.isArray(lib.playlists) ||
      !Array.isArray(lib.history) || lib.playlists.length > 1000 ||
      lib.favorites.length > 5000 || lib.history.length > 60 ||
      lib.playlists.some((p: { tracks?: unknown }) => !Array.isArray(p?.tracks) || p.tracks.length > 5000)) {
    throw new SyncError(400, "Invalid library backup.");
  }
  const encoded = JSON.stringify(b);
  if (Buffer.byteLength(encoded, "utf8") > 8 * 1024 * 1024) throw new SyncError(413, "Backup too large.");
  return transaction(async (db) => {
    const a = db.accounts[username];
    if (!a) throw new SyncError(401, "Unknown account.");
    if (a.revision !== revision) throw new SyncError(409, "Another device updated the library. Pull and merge again.");
    a.backup = JSON.parse(encoded) as Record<string, unknown>;
    a.revision++;
    await save(db);
    return { username, revision: a.revision };
  });
}
