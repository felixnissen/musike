import { useEffect, useState } from "react";
import { capabilities } from "../lib/api";
import { useI18n } from "../i18n";
import { diagnosePeer, readPeer, savePeer } from "../lib/peerConfig";

interface Pairing { enabled: boolean; port?: number; token?: string }
export function PeerMusicSection() {
  const desktop = capabilities.video;
  const isSwedish = useI18n((state) => state.lang === "sv");
  const [pair, setPair] = useState<Pairing | null>(null);
  const [url, setUrl] = useState(() => readPeer().url);
  const [token, setToken] = useState(() => readPeer().token);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (desktop) void fetch("/api/local/pairing").then((r) => r.json())
      .then((x: Pairing) => setPair(x)).catch(() => {});
  }, [desktop]);
  async function test() {
    setBusy(true);
    const value = { url: url.trim().replace(/\/+$/, ""), token: token.trim() };
    try {
      savePeer(value);
      setMessage((await diagnosePeer(value)).message);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="flex flex-col gap-2">
    <h3 className="text-xs font-medium text-fg-3">{isSwedish ? "Hybridmusik · MusicGrabber" : "Hybrid music · MusicGrabber"}</h3>
    <div className="flex flex-col gap-3 rounded-[16px] bg-surface-1 p-4 ring-1 ring-line">
      {desktop ? <>
        <p className="text-sm text-fg-2">{isSwedish ? "Musike spelar automatiskt matchande låtar från din MusicGrabber-mapp och använder YouTube som reserv." : "Musike automatically plays matching songs from your MusicGrabber folder, then falls back to YouTube."}</p>
        {pair?.enabled ? <>
          <p className="text-xs text-fg-2">{isSwedish ? "Privat musiktjänst: 127.0.0.1:" : "Private music service: 127.0.0.1:"}{pair.port}{isSwedish ? ". Använd HTTPS-miniservern på hemmets Wi-Fi eller en privat HTTPS-tunnel utanför hemmet. Öppna aldrig porten i routern." : ". Use the HTTPS mini-server on the home Wi-Fi, or a private HTTPS tunnel away from home. Never forward the port from your router."}</p>
          <label className="text-xs text-fg-2" htmlFor="peer-key">{isSwedish ? "Parkopplingsnyckel till mobilen" : "Pairing key for your phone"}</label>
          <input id="peer-key" type="password" readOnly value={pair.token || ""} className="w-full rounded-xl bg-bg p-2 font-mono text-xs text-fg" />
          <button type="button" className="rounded-full bg-surface-3 px-4 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(pair.token || "")}>
            {isSwedish ? "Kopiera parkopplingsnyckel" : "Copy pairing key"}
          </button>
        </> : <p className="text-sm text-fg-2">{isSwedish ? "Den privata musiktjänsten är inte igång." : "Private music service is not running."}</p>}
      </> : <>
        <p className="text-sm text-fg-2">{isSwedish ? "Spela musik från datorn via den privata HTTPS-anslutningen. YouTube används automatiskt som reserv." : "Use your PC music when connected to its private HTTPS endpoint. YouTube remains the automatic fallback."}</p>
        <label className="text-xs text-fg-2" htmlFor="peer-url">Privat HTTPS-adress (hemma-Wi-Fi eller privat tunnel)</label>
        <input id="peer-url" autoCapitalize="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://192.168.0.41:4284" className="w-full rounded-xl bg-bg p-2 text-sm text-fg" />
        <label className="text-xs text-fg-2" htmlFor="peer-token">{isSwedish ? "Parkopplingsnyckel från datorn" : "Pairing key from PC"}</label>
        <input id="peer-token" type="password" autoCapitalize="off" value={token} onChange={(e) => setToken(e.target.value)} className="w-full rounded-xl bg-bg p-2 font-mono text-xs text-fg" />
        <button type="button" disabled={busy} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink" onClick={() => void test()}>
          {busy ? (isSwedish ? "Ansluter…" : "Connecting...") : (isSwedish ? "Spara och testa" : "Save and test")}
        </button>
        {message && <p role="status" className="text-xs text-fg-2">{message}</p>}
      </>}
    </div>
  </section>;
}
