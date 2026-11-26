import { ArrowLeftIcon, CaretRightIcon, DownloadSimpleIcon, FolderOpenIcon, YoutubeLogoIcon, SpotifyLogoIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { SunoConnect } from "../components/SunoConnect";
import { desktop, type ImportWatchStatus } from "../lib/desktop";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "../components/Page";
import { PeerMusicSection } from "../components/PeerMusicSection";
import { useI18n } from "../i18n";
import { api, capabilities } from "../lib/api";
import { identifyLink, importFiles as executeFiles, previewLink, readSpotifyExport, type Preview } from "../lib/importAdapters";
import { isFileSource, supports, type ImportSourceId } from "../../../shared/importRegistry";

import { paths } from "../lib/routes";

import { useLibrary } from "../stores/library";

type Source = ImportSourceId;
let spotifyDraft:{terms:string[];page:number;input:string}={terms:[],page:0,input:""};
const btn = "rounded-full bg-accent px-5 py-3 font-semibold text-accent-ink disabled:opacity-40";
export default function ImportMusic() {
  const sv = useI18n(s => s.lang === "sv");
  const tr = (a: string, b: string) => sv ? a : b;
  const navigate = useNavigate();
  const [source, setSource] = useState<Source | null>(()=>new URLSearchParams(window.location.search).get("source")==="suno"?"suno":null);
  const [input, setInput] = useState("");
  const [smartLink,setSmartLink]=useState("");
  const [spotifyTerms,setSpotifyTerms]=useState<string[]>([]);
  const [spotifyPage,setSpotifyPage]=useState(0);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [preview,setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState(0);
  const [watch, setWatch] = useState<ImportWatchStatus | null>(null);
  const [watchBusy,setWatchBusy] = useState(false);
  useEffect(()=>{if(source==="spotify")spotifyDraft={terms:spotifyTerms,page:spotifyPage,input};},[source,spotifyTerms,spotifyPage,input]);
  const watchSource = isFileSource(source) && supports(source,"folder") ? source : null;
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
  const select = (s: Source | null) => { setSource(s); setInput(s==="spotify"?spotifyDraft.input:""); setFiles([]); setMessages([]); setProgress(0); setPreview(null);setSpotifyTerms(s==="spotify"?spotifyDraft.terms:[]);setSpotifyPage(s==="spotify"?spotifyDraft.page:0); };
  async function loadSpotifyExport(file:File) {
    setMessages([]);
    try {
      const terms=await readSpotifyExport(file);
      if(!terms.length)throw new Error("No track and artist entries found.");
      setSpotifyTerms(terms);setSpotifyPage(0);setInput(terms.slice(0,50).join("\n"));setMessages([tr("Låtar i exporten","Tracks in export")+": "+terms.length]);
    }catch(e){setMessages([(e as Error).message]);}
  }
  async function youtubePreview() {
    setBusy(true);setPreview(null);setMessages([]);
    try {
      const target=identifyLink(input);
      if(!target||target.source!=="youtube")throw Error("Not a supported YouTube link");
      setPreview(await previewLink(target));
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
    if(!isFileSource(source))return;
    setBusy(true);setMessages([]);setProgress(0);
    try{
      const r=await executeFiles(source,files,setProgress);
      await useLibrary.getState().load();
      setMessages([tr("Nya","New")+": "+r.added+" · "+tr("Redan importerade","Already imported")+": "+r.duplicates+" · "+tr("Fel","Failed")+": "+r.errors.length,...r.errors]);
    }catch(e){setMessages([(e as Error).message]);}finally{setBusy(false);}
  }
  async function routeSmartLink(){
    const target=identifyLink(smartLink);
    if(!target){setMessages([tr("Länken stöds inte","Unsupported link")]);return;}
    select(target.source);
    setInput(target.url);
    if(target.source==="youtube"){
      setBusy(true);try{setPreview(await previewLink(target));}catch(e){setMessages([(e as Error).message]);}finally{setBusy(false);}
    }else if(target.source==="spotify") {setInput(spotifyDraft.input);setMessages([tr("Spotify-länk identifierad. Använd exportfil eller låtlista för import.","Spotify link detected. Import via an export file or track list.")]);}else if(target.source==="suno"){setMessages([tr("Suno-länk identifierad. Anslut kontot och välj låten i biblioteket.","Suno link detected. Connect your account and select the song from your library.")]);}
  }
  return <div className="pb-8">
    <PageHeader title={tr("Importera musik", "Import music")} actions={<Link to={paths.library} aria-label={tr("Bibliotek", "Library")}><ArrowLeftIcon size={22} /></Link>} />
    <div className="mx-auto max-w-xl px-4 pt-3 md:px-6">
      <div className="rounded-[24px] bg-surface-2 p-4 ring-1 ring-line md:p-6">
        {!source ? <>
          <p className="mb-3 text-fg-2">{tr("Välj varifrån du vill lägga till musik.", "Choose where to add music from.")}</p>
          <form onSubmit={e=>{e.preventDefault();void routeSmartLink();}} className="mb-3 flex flex-wrap gap-2"><input aria-label={tr("Musiklänk","Music link")} value={smartLink} onChange={e=>setSmartLink(e.target.value)} placeholder={tr("Klistra in en musiklänk","Paste a music link")} className="min-w-0 flex-1 rounded-xl bg-bg p-3"/><button className={btn} disabled={!smartLink.trim()||busy}>{tr("Identifiera","Detect")}</button></form>
          {messages.map((m,i)=><p key={i} role="status" className="text-sm">{m}</p>)}
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
            {spotifyTerms.length>50&&<div className="flex items-center justify-between gap-2"><button disabled={spotifyPage===0} onClick={()=>{const p=spotifyPage-1;setSpotifyPage(p);setInput(spotifyTerms.slice(p*50,p*50+50).join("\n"));}}>←</button><span>{spotifyPage+1} / {Math.ceil(spotifyTerms.length/50)}</span><button disabled={(spotifyPage+1)*50>=spotifyTerms.length} onClick={()=>{const p=spotifyPage+1;setSpotifyPage(p);setInput(spotifyTerms.slice(p*50,p*50+50).join("\n"));}}>→</button></div>}
            <textarea aria-label="Track list" rows={6} className="rounded-xl bg-bg p-3" value={input} onChange={e => setInput(e.target.value)} />
            <button type="button" className={btn} disabled={!input.trim()} onClick={() => navigate(paths.searchList, { state: { text: input } })}>{tr("Matcha och granska", "Match and review")}</button>
          </>}
          {(source === "youtube" || source === "spotify" || (source === "suno" && !capabilities.video)) && <div role="status" className="text-sm text-fg-2">{messages.map((m,i)=><p key={i}>{m}</p>)}</div>}
          {source === "musicgrabber" && <><PeerMusicSection />{capabilities.video && <a href="http://127.0.0.1:38274" target="_blank" rel="noreferrer" className="text-accent-text underline">{tr("Öppna MusicGrabber (Musike Suite)", "Open MusicGrabber (Musike Suite)")}</a>}</> }
          {source === "suno" && <>
            <SunoConnect />
            <p className="text-sm text-fg-2">{tr("Exportera dina egna låtar från Suno, enskilt eller som ZIP. Välj exportmapp för automatisk lokal import. Direkt kontokoppling finns som experimentell förhandsversion på datorn.", "Export your own tracks from Suno individually or as ZIP. Choose an export folder for automatic local imports. Direct account connection is an experimental desktop preview.")}</p>
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
