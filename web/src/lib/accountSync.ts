import { createBackup, restoreBackup, type Backup } from "./backup";
import { capabilities } from "./api";
import { readPeer } from "./peerConfig";

const KEY = "musike:account-session:v1";
export interface AccountSession { url: string; username: string; session: string }
export function currentAccount(): AccountSession | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as AccountSession | null;
    return v && v.url && v.username && /^[a-f0-9]{64}$/.test(v.session) ? v : null;
  } catch { return null; }
}
export function endpoint(): string {
  if (capabilities.video) return "http://127.0.0.1:4283";
  const peer = readPeer();
  if (!peer.url || !/^https:\/\//i.test(peer.url)) throw new Error("Connect your private HTTPS music peer first.");
  return peer.url;
}
async function call<T>(url: string, route: string, method: string, data?: unknown, session?: string, pairing?: string): Promise<T> {
  const response = await fetch(url + route, {
    method, signal: AbortSignal.timeout(12000), cache: "no-store",
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Authorization: "Bearer " + session } : {}),
      ...(pairing ? { "X-Musike-Pairing": pairing } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Sync server HTTP " + response.status);
  return payload as T;
}
export async function createAccount(username: string, password: string) {
  if (!capabilities.video) throw new Error("Create the account on your computer, then sign in on your phone.");
  const pair = await fetch("/api/local/pairing", { signal: AbortSignal.timeout(3500) }).then((r) => r.json()) as { token?: string };
  if (!pair.token) throw new Error("Private music service is unavailable.");
  const url = endpoint();
  const session = await call<{ username: string; session: string }>(url, "/v1/sync/register", "POST", { username, password }, undefined, pair.token);
  const value = { url, username: session.username, session: session.session };
  localStorage.setItem(KEY, JSON.stringify(value));
  return value;
}
export async function login(username: string, password: string) {
  const url = endpoint();
  const session = await call<{ username: string; session: string }>(url, "/v1/sync/login", "POST", { username, password });
  const value = { url, username: session.username, session: session.session };
  localStorage.setItem(KEY, JSON.stringify(value));
  return value;
}
export async function logout() {
  const previous = currentAccount();
  localStorage.removeItem(KEY);
  if (previous) await call(previous.url, "/v1/sync/logout", "POST", undefined, previous.session).catch(() => {});
}
export async function syncAccount(): Promise<{ favorites: number; playlists: number; revision: number }> {
  const account = currentAccount();
  if (!account) throw new Error("Sign in to synchronize.");
  // A conflict must not silently overwrite another device: read and merge
  // its latest version then compare-and-swap at the server.
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await call<{ revision: number; backup: Backup | null }>(account.url, "/v1/sync/state", "GET", undefined, account.session);
    if (remote.backup) {
      await restoreBackup(remote.backup, "merge", true);
    }
    const backup = await createBackup();
    try {
      const saved = await call<{ revision: number }>(account.url, "/v1/sync/state", "PUT",
        { revision: remote.revision, backup }, account.session);
      return { favorites: backup.library.favorites.length, playlists: backup.library.playlists.length, revision: saved.revision };
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Another device updated") || attempt === 2) throw error;
    }
  }
  throw new Error("Could not synchronize after conflicting updates.");
}
