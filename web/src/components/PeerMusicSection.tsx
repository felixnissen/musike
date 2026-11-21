import { useEffect, useState } from "react";
import { capabilities } from "../lib/api";
import { checkPeer, readPeer, savePeer } from "../lib/peerConfig";

interface Pairing { enabled: boolean; port?: number; token?: string }
export function PeerMusicSection() {
  const desktop = capabilities.video;
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
      setMessage(await checkPeer(value) ? "Connected! Local music will be preferred." :
        "Not reachable. YouTube Music remains available as usual.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="flex flex-col gap-2">
    <h3 className="text-xs font-medium text-fg-3">Hybrid music · MusicGrabber</h3>
    <div className="flex flex-col gap-3 rounded-[16px] bg-surface-1 p-4 ring-1 ring-line">
      {desktop ? <>
        <p className="text-sm text-fg-2">Musike automatically plays matching songs from your MusicGrabber folder, then falls back to YouTube.</p>
        {pair?.enabled ? <>
          <p className="text-xs text-fg-2">Private music service: 127.0.0.1:{pair.port}. Publish only through a private HTTPS tunnel (such as Tailscale Serve). Never forward this port directly from your router.</p>
          <label className="text-xs text-fg-2" htmlFor="peer-key">Pairing key for your phone</label>
          <input id="peer-key" type="password" readOnly value={pair.token || ""} className="w-full rounded-xl bg-bg p-2 font-mono text-xs text-fg" />
          <button type="button" className="rounded-full bg-surface-3 px-4 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(pair.token || "")}>
            Copy pairing key
          </button>
        </> : <p className="text-sm text-fg-2">Private music service is not running.</p>}
      </> : <>
        <p className="text-sm text-fg-2">Use your PC music when connected to its private HTTPS endpoint. YouTube remains the automatic fallback.</p>
        <label className="text-xs text-fg-2" htmlFor="peer-url">Private HTTPS address (Tailscale Serve)</label>
        <input id="peer-url" autoCapitalize="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-computer.tailnet.ts.net" className="w-full rounded-xl bg-bg p-2 text-sm text-fg" />
        <label className="text-xs text-fg-2" htmlFor="peer-token">Pairing key from PC</label>
        <input id="peer-token" type="password" autoCapitalize="off" value={token} onChange={(e) => setToken(e.target.value)} className="w-full rounded-xl bg-bg p-2 font-mono text-xs text-fg" />
        <button type="button" disabled={busy} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink" onClick={() => void test()}>
          {busy ? "Connecting..." : "Save and test"}
        </button>
        {message && <p role="status" className="text-xs text-fg-2">{message}</p>}
      </>}
    </div>
  </section>;
}
