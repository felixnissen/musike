import { ArrowLeftIcon, CaretRightIcon, DownloadSimpleIcon, FolderOpenIcon, YoutubeLogoIcon, SpotifyLogoIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { desktop, type ImportWatchStatus } from "../lib/desktop";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "../components/Page";
import { PeerMusicSection } from "../components/PeerMusicSection";
import { useI18n } from "../i18n";
import { api, capabilities } from "../lib/api";
import type { Track } from "../lib/types";
import { paths } from "../lib/routes";

import { useLibrary } from "../stores/library";

type Source = "youtube" | "suno" | "spotify" | "musicgrabber" | "local";
const btn = "rounded-full bg-accent px-5 py-3 font-semibold text-accent-ink disabled:opacity-40";
export default function ImportMusic() {
  const sv = useI18n(s => s.lang === "sv");
  const tr = (a: string, b: string) => sv ? a : b;
  const navigate = useNavigate();
  const [source, setSource] = useState<Source | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [preview,setPreview] = useState<{title:string;tracks:Track[]} | null>(null);
  const [progress, setProgress] = useState(0);
  const [watch, setWatch] = useState<ImportWatchStatus | null>(null);
  const [watchBusy,setWatchBusy] = useState(false);
  const watchSource = source === "suno" || source === "local" || source === "musicgrabber" ? source : null;
  useEffect(() => {
    setWatch(null);
    if (!watchSource || !desktop?.importWatch) return;
    let live=true;
    const refresh=()=>void desktop!.importWatch!(watchSource,"status").then(v=>{if(live)setWatch(v);}).catch(()=>{});
    refresh(); const timer=setInterval(refresh,5000);
    return ()=>{live=false;clearInterval(timer);};
  },[watchSource]);
  async function watchAction(action:"choose"|"stop"|"scan") {
    if(!watchSource || !desktop?.importWatch) return;
    setWatchBusy(true);
    try { setWatch(await desktop.importWatch(watchSource,action)); await useLibrary.getState().load(); }
    catch(e){setMessages([(e as Error).message]);}
    finally{setWatchBusy(false);}
  }
  const rows = [
    { id: "youtube", title: "YouTube", desc: tr("Låtar och länkar", "Tracks and links"), icon: <YoutubeLogoIcon size={34} weight="fill" />, color: "bg-red-600 text-white" },
    { id: "suno", title: "Suno", desc: tr("Egna skapade låtar · filimport", "Your own creations · file import"), icon: <MusicNotesIcon size={32} weight="fill" />, color: "bg-black text-white" },
    { id: "spotify", title: "Spotify", desc: tr("Låtlistor och låtmatchning", "Track lists and matching"), icon: <SpotifyLogoIcon size={34} weight="fill" />, color: "bg-[#1ed760] text-black" },
    { id: "musicgrabber", title: "MusicGrabber", desc: tr("Lokalt bibliotek och parkoppling", "Local library and pairing"), icon: <DownloadSimpleIcon size={30} />, color: "bg-surface-3" },
    { id: "local", title: tr("Egna musikfiler", "Local music files"), desc: tr("Importera ljudfiler", "Import audio files"), icon: <FolderOpenIcon size={30} />, color: "bg-surface-3" },
  ] as const;
  const select = (s: Source | null) => { setSource(s); setInput(""); setFiles([]); setMessages([]); setProgress(0); setPreview(null); };
  async function loadSpotifyExport(file:File) {
    setMessages([]);
    try {
      if(file.size>5*1024*1024)throw new Error("Export file exceeds 5 MB");
      const text=await file.text();
      let terms:string[];
      if(/\.json$/i.test(file.name)) {
        const data=JSON.parse(text);const rows=Array.isArray(data)?data:Array.isArray(data.tracks)?data.tracks:Array.isArray(data.items)?data.items:[];
        terms=rows.map((entry:any)=>{const t=entry.track||entry;const title=t.trackName||t.song||t.name||t.master_metadata_track_name;const artist=t.artistName||t.artist||t.master_metadata_album_artist_name||t.artists?.map((a:any)=>a.name).join(" ");return typeof title==="string"&&typeof artist==="string"?title+" "+artist:"";}).filter(Boolean);
      } else terms=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      terms=[...new Set(terms)].map(t=>t.replace(/,/g," "));
      if(!terms.length)throw new Error("No track and artist entries found.");
      setInput(terms.slice(0,50).join("\n"));setMessages([tr("Låtar i exporten","Tracks in export")+": "+terms.length+(terms.length>50?" · "+tr("Första 50 i denna omgång.","First 50 in this batch."):"")]);
    }catch(e){setMessages([(e as Error).message]);}
  }
  async function youtubePreview() {
    setBusy(true);setPreview(null);setMessages([]);
    try {
      const u=new URL(input.trim());
      if(!/(^|\.)youtube\.com$|^youtu\.be$/.test(u.hostname)||!/^https?:$/.test(u.protocol)) throw new Error("Not a YouTube URL");
      const list=u.searchParams.get("list");
      if(list && capabilities.video) {
        const res=await fetch("/api/import/youtube/playlist?id="+encodeURIComponent(list));const data=await res.json();
        if(!res.ok)throw new Error(data.error||res.statusText);
        setPreview(data);return;
      }
      const id=u.hostname==="youtu.be"?u.pathname.slice(1):u.searchParams.get("v")||u.pathname.split("/shorts/")[1];
      if(!id||!/^[-_A-Za-z0-9]{11}$/.test(id))throw new Error("A valid track link is required (playlist preview is desktop only).");
      const r=await api.prepare(id);
      setPreview({title:"YouTube imports",tracks:[{id:r.id,title:r.title,artist:"YouTube",duration:r.duration,thumb:"https://i.ytimg.com/vi/"+r.id+"/mqdefault.jpg",art:"https://i.ytimg.com/vi/"+r.id+"/hq720.jpg",kind:"video"}]});
    } catch(e){setMessages([(e as Error).message]);}finally{setBusy(false);}
  }
  async function savePreview() {
    if(!preview?.tracks.length)return;
    setBusy(true);
    try {
      const lib=await api.library();const found=lib.playlists.find(p=>p.name===preview.title.slice(0,80));
      const p=found||await api.createPlaylist(preview.title.slice(0,80),[]);
      for(let i=0;i<preview.tracks.length;i+=500) await api.addToPlaylist(p.id,preview.tracks.slice(i,i+500));
      await useLibrary.getState().load();setMessages([tr("Sparat i spellista", "Saved to playlist")+": "+p.name]);
    }catch(e){setMessages([(e as Error).message]);}finally{setBusy(false);}
  }
  async function importFiles() {
    if (source !== "suno" && source !== "local" && source !== "musicgrabber") return;
    setBusy(true); setMessages([]); setProgress(0);
    let added = 0, duplicates = 0;
    const errors: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          if (f.size > 128 * 1024 * 1024) throw new Error("128 MB max");
          const response = await fetch("/api/import/audio?" + new URLSearchParams({ name: f.name, source }), {
            method: "POST", headers: { "content-type": "application/octet-stream", "x-musike-import": "1" }, body: f,
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || response.statusText);
          if (/\.zip$/i.test(f.name)) { added+=body.added; duplicates+=body.duplicates; errors.push(...body.errors); }
          else if (body.duplicate) duplicates++; else added++;
        } catch (e) { errors.push(f.name + ": " + (e as Error).message); }
        setProgress(i + 1);
      }
      await useLibrary.getState().load();
      setMessages([tr("Nya", "New") + ": " + added + " · " + tr("Redan importerade", "Already imported") + ": " + duplicates + " · " + tr("Fel", "Failed") + ": " + errors.length, ...errors]);
    } catch (e) { setMessages([...errors, (e as Error).message]); }
    finally { setBusy(false); }
  }
  return <div className="pb-8">
    <PageHeader title={tr("Importera musik", "Import music")} actions={<Link to={paths.library} aria-label={tr("Bibliotek", "Library")}><ArrowLeftIcon size={22} /></Link>} />
    <div className="mx-auto max-w-xl px-4 pt-3 md:px-6">
      <div className="rounded-[24px] bg-surface-2 p-4 ring-1 ring-line md:p-6">
        {!source ? <>
          <p className="mb-3 text-fg-2">{tr("Välj varifrån du vill lägga till musik.", "Choose where to add music from.")}</p>
          {rows.map((r, i) => <button key={r.id} type="button" onClick={() => select(r.id)}
            className={"flex w-full items-center gap-4 py-5 text-left hover:bg-surface-3 " + (i ? "border-t border-line" : "")}>
            <span className={"grid size-14 shrink-0 place-items-center rounded-2xl " + r.color}>{r.icon}</span>
            <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">{r.title}</span><span className="block text-sm text-fg-2">{r.desc}</span></span>
            <CaretRightIcon size={20} className="shrink-0" />
          </button>)}
        </> : <div className="flex flex-col gap-4">
          <button type="button" disabled={busy} onClick={() => select(null)} className="flex items-center gap-2 self-start text-sm text-fg-2"><ArrowLeftIcon /> {tr("Alla källor", "All sources")}</button>
          <h2 className="text-xl font-semibold">{rows.find(r => r.id === source)?.title}</h2>
          {source === "youtube" && <>
            <label htmlFor="import-query">{tr("Sök efter en låt eller klistra in en YouTube-länk.", "Search for a track or paste a YouTube link.")}</label>
            <input id="import-query" className="rounded-xl bg-bg p-3" value={input} onChange={e => setInput(e.target.value)} />
            <button type="button" className={btn} disabled={busy||!input.trim()} onClick={() => {if(/^https?:\/\//i.test(input.trim())) void youtubePreview();else navigate(paths.search + "?q=" + encodeURIComponent(input.trim()));}}>{tr("Förhandsvisa eller sök", "Preview or search")}</button>
            {preview && <div className="flex flex-col gap-2"><p>{preview.title} · {preview.tracks.length}</p><div className="max-h-44 overflow-auto text-sm text-fg-2">{preview.tracks.map((t,i)=><p key={t.id+i}>{t.artist} — {t.title}</p>)}</div><button type="button" className={btn} disabled={busy||!preview.tracks.length} onClick={()=>void savePreview()}>{tr("Spara spellista", "Save playlist")}</button></div>}
            <Link to={paths.searchList}>{tr("Sök en lista med låtar", "Search a list of tracks")}</Link>
            <p className="text-sm text-fg-2">{tr("Spara resultat i en spellista. Upp till 500 spår per offentlig YouTube-spellista på datorn.", "Save results to a playlist. Up to 500 tracks per public YouTube playlist on desktop.")}</p>
          </>}
          {source === "spotify" && <>
            <p className="text-sm text-fg-2">{tr("Klistra in exporterade låtnamn och artister (en per rad, upp till 50). Granska matchningarna innan du sparar. Du kan också välja en Spotify JSON-export. Kontosynkning och direkta Spotify-länkar är inte anslutna här ännu.", "Paste exported track names and artists (one per line, up to 50). Review matches before saving. You can also select a Spotify JSON export. Account sync and Spotify URL import are not connected here yet.")}</p>
            <label className="text-sm">{tr("Välj exportfil (JSON/TXT)","Choose export file (JSON/TXT)")}<input type="file" accept=".json,.txt" className="mt-2 block w-full" onChange={e=>{const f=e.target.files?.[0];if(f)void loadSpotifyExport(f);}} /></label>
            <textarea aria-label="Track list" rows={6} className="rounded-xl bg-bg p-3" value={input} onChange={e => setInput(e.target.value)} />
            <button type="button" className={btn} disabled={!input.trim()} onClick={() => navigate(paths.searchList, { state: { text: input } })}>{tr("Matcha och granska", "Match and review")}</button>
          </>}
          {(source === "youtube" || source === "spotify") && <div role="status" className="text-sm text-fg-2">{messages.map((m,i)=><p key={i}>{m}</p>)}</div>}
          {source === "musicgrabber" && <><PeerMusicSection />{capabilities.video && <a href="http://127.0.0.1:38274" target="_blank" rel="noreferrer" className="text-accent-text underline">{tr("Öppna MusicGrabber (Musike Suite)", "Open MusicGrabber (Musike Suite)")}</a>}</> }
          {source === "suno" && <>
            <p className="text-sm text-fg-2">{tr("Exportera dina egna låtar från Suno, enskilt eller som ZIP. Välj exportmapp för automatisk lokal import. Direkt kontosynkning är inte ansluten.", "Export your own tracks from Suno individually or as ZIP. Choose an export folder for automatic local imports. Direct account sync is not connected.")}</p>
            <a href="https://suno.com/" target="_blank" rel="noreferrer" className="text-accent-text underline">{tr("Öppna Suno", "Open Suno")}</a>
          </>}
          {watchSource && desktop?.importWatch && <div className="flex flex-col gap-2 rounded-xl bg-bg p-3">
            <h3 className="font-semibold">{tr("Bevaka en mapp automatiskt", "Automatically watch a folder")}</h3>
            <p className="text-sm text-fg-2">{tr("Välj en särskild exportmapp en gång. Nya ljudfiler importeras medan Musike är öppet; originalen lämnas orörda.", "Choose a dedicated export folder once. New audio files import while Musike is open; originals stay untouched.")}</p>
            {watch && <div className="break-all text-sm text-fg-2">{watch.folder}<br />{tr("Registrerade", "Tracked")}: {watch.tracked} · {tr("Väntar", "Pending")}: {watch.pending || 0} · {tr("Fel", "Errors")}: {watch.errors || 0}{watch.lastError && <p>{watch.lastError}</p>}</div>}
            <button type="button" disabled={watchBusy} className={btn} onClick={()=>void watchAction("choose")}>{watch ? tr("Byt mapp","Change folder") : tr("Välj mapp","Choose folder")}</button>
            {watch && <div className="flex gap-2"><button type="button" disabled={watchBusy} className="rounded-full bg-surface-3 px-4 py-2" onClick={()=>void watchAction("scan")}>{tr("Synka nu","Sync now")}</button><button type="button" disabled={watchBusy} className="rounded-full bg-surface-3 px-4 py-2" onClick={()=>void watchAction("stop")}>{tr("Sluta bevaka","Stop watching")}</button></div>}
          </div>}
          {(source === "suno" || source === "local" || source === "musicgrabber") && (capabilities.video ? <>
            <label className="text-sm font-medium">{tr("Välj ljudfiler eller ZIP (max 128 MB per fil)", "Choose audio files or ZIP (128 MB per file max)")}
              <input type="file" multiple accept=".mp3,.wav,.flac,.ogg,.opus,.m4a,.zip" disabled={busy} onChange={e => { setFiles(Array.from(e.target.files || [])); setMessages([]); }} className="mt-2 block w-full text-sm" />
            </label>
            <button type="button" className={btn} disabled={busy || !files.length} onClick={() => void importFiles()}>{busy ? progress + " / " + files.length : tr("Importera till biblioteket", "Import to library")}</button>
            <div role="status" className="max-h-40 overflow-auto text-sm text-fg-2">{messages.map((m, i) => <p key={i}>{m}</p>)}</div>
          </> : <p className="text-sm text-fg-2">{tr("Filimport görs på datorn. Mobilen kan spela via den privata musikanslutningen.", "Import files on your PC. Mobile playback uses the private music connection.")}</p>)}
        </div>}
      </div>
    </div>
  </div>;
}
