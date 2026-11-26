import { resolveAudio } from "./streams";

import { readPeer } from "../lib/peerConfig";

const rejects = new Map<string, number>();
let unavailableUntil = 0;

export async function streamWithPeer(id: string): Promise<string> {
  const peer = readPeer();
  if (peer.url && /^[a-f\d]{64}$/.test(peer.token) && Date.now() > unavailableUntil &&
      (rejects.get(id) ?? 0) < Date.now()) {
    const endpoint = peer.url + "/v1/available/" + encodeURIComponent(id) + "?token=" + peer.token;
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000), cache: "no-store" });
      if (response.ok && (await response.json()).available === true) {
        return peer.url + "/v1/stream/" + encodeURIComponent(id) + "?token=" + peer.token;
      }
      if (response.status === 404) rejects.set(id, Date.now() + 30_000);
      else if (!response.ok) unavailableUntil = Date.now() + 10_000;
    } catch { unavailableUntil = Date.now() + 10_000; }
  }
  if (/^local-[a-f0-9]{64}$/.test(id)) throw new Error("Imported audio requires the paired Musike computer.");
  return (await resolveAudio(id)).url;
}

/** Called before the player's existing retry; switch its next attempt back to YouTube. */
export function forgetPeerStream(url: string): void {
  const peer = readPeer();
  if (!peer.url || !url.startsWith(peer.url + "/v1/stream/")) return;
  const found = /\/v1\/stream\/([\w-]{11}|local-[a-f0-9]{64})\?/.exec(url);
  if (found) rejects.set(found[1], Date.now() + 90_000);
}
