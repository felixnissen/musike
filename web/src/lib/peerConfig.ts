const KEY = "musike:music-peer:v1";
const suggestedLanUrl = import.meta.env.VITE_MUSIKE_LAN_URL || "";
export interface PeerConfig { url: string; token: string }
export type PeerTestResult =
  | { ok: true; message: string }
  | { ok: false; message: string };
export function readPeer(): PeerConfig {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<PeerConfig>;
    return { url: typeof data.url === "string" && data.url ? data.url : suggestedLanUrl, token: typeof data.token === "string" ? data.token : "" };
  } catch { return { url: suggestedLanUrl, token: "" }; }
}
export function savePeer(config: PeerConfig): void {
  const url = config.url.trim().replace(/\/+$/, "");
  if (url && (!/^https:\/\//i.test(url) || new URL(url).username || new URL(url).password))
    throw new Error("Use a private HTTPS music address.");
  const token = config.token.trim();
  if (token && !/^[a-f\d]{64}$/.test(token)) throw new Error("Invalid pairing key: expected 64 hexadecimal characters.");
  localStorage.setItem(KEY, JSON.stringify({ url, token }));
}
export async function diagnosePeer(config: PeerConfig): Promise<PeerTestResult> {
  if (!/^https:\/\//i.test(config.url)) return { ok: false, message: "Ange musikserverns HTTPS-adress." };
  if (!/^[a-f\d]{64}$/.test(config.token)) return { ok: false, message: "Parkopplingsnyckeln är ogiltig. Kopiera den från Musike på datorn." };
  try {
    const response = await fetch(config.url.replace(/\/+$/, "") + "/v1/health?token=" + config.token, {
      signal: AbortSignal.timeout(9000), cache: "no-store",
    });
    if (response.status === 401 || response.status === 403) return {
      ok: false, message: "Datorn nås, men musikens parkopplingsnyckel är fel. Kopiera nyckeln igen från datorns Musike-inställningar.",
    };
    if (!response.ok) return { ok: false, message: "Musikservern svarar med HTTP " + response.status + "." };
    const result = await response.json() as { ok?: boolean };
    if (result.ok === true) return { ok: true, message: "Ansluten! Musik från datorn används när låten finns lokalt." };
    return { ok: false, message: "Musikservern svarade oväntat." };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") return {
      ok: false, message: "Tidsgränsen gick ut. Kontrollera Wi-Fi och Windows-brandväggen för port 4284.",
    };
    return {
      ok: false, message: "Kunde inte ansluta. Kontrollera Wi-Fi, brandvägg och att HTTPS-adressen stämmer.",
    };
  }
}
export async function checkPeer(config: PeerConfig): Promise<boolean> {
  return (await diagnosePeer(config)).ok;
}
