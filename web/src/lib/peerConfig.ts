const KEY = "musike:music-peer:v1";
const suggestedLanUrl = import.meta.env.VITE_MUSIKE_LAN_URL || "";
export interface PeerConfig { url: string; token: string }
export function readPeer(): PeerConfig {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<PeerConfig>;
    return { url: typeof data.url === "string" && data.url ? data.url : suggestedLanUrl, token: typeof data.token === "string" ? data.token : "" };
  } catch { return { url: suggestedLanUrl, token: "" }; }
}
export function savePeer(config: PeerConfig): void {
  const url = config.url.trim().replace(/\/+$/, "");
  if (url && (!/^https:\/\//i.test(url) || new URL(url).username || new URL(url).password))
    throw new Error("Use an HTTPS address, such as a private Tailscale Serve URL.");
  const token = config.token.trim();
  if (token && !/^[a-f\d]{64}$/.test(token)) throw new Error("Invalid pairing key.");
  localStorage.setItem(KEY, JSON.stringify({ url, token }));
}
export async function checkPeer(config: PeerConfig): Promise<boolean> {
  if (!/^https:\/\//.test(config.url) || !/^[a-f\d]{64}$/.test(config.token)) return false;
  try {
    const response = await fetch(config.url.replace(/\/+$/, "") + "/v1/health?token=" + config.token, {
      signal: AbortSignal.timeout(2500), cache: "no-store",
    });
    return response.ok && (await response.json()).ok === true;
  } catch { return false; }
}
