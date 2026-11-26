import { useEffect,useState } from "react";
import { desktop, type SunoResult } from "../lib/desktop";
import { useI18n } from "../i18n";
import { useLibrary } from "../stores/library";

export function SunoConnect(){
  const sv=useI18n(s=>s.lang==="sv");
  const tr=(a:string,b:string)=>sv?a:b;
  const [connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [songs,setSongs]=useState<{id:string;title:string;imported?:boolean}[]>([]),[cursor,setCursor]=useState<string|null>(null);
  const [auto,setAuto]=useState(false),[lastAuto,setLastAuto]=useState<SunoResult["lastAuto"]>();
  useEffect(()=>{let live=true;const refresh=()=>void desktop?.suno?.("status").then(r=>{if(live){setConnected(!!r.connected);setAuto(!!r.auto);setLastAuto(r.lastAuto);}}).catch(()=>{});refresh();const timer=setInterval(refresh,10000);return()=>{live=false;clearInterval(timer);};},[]);
  if(!desktop?.suno)return <p role="alert">{tr("Suno-kontokoppling kräver den nya Windows-appen.","Suno account connection requires the updated desktop app.")}</p>;
  const run=async(action:"connect"|"disconnect"|"library"|"download"|"auto-on"|"auto-off"|"auto-now",value?:string)=>{
    setBusy(true);setMessage("");
    try{
      const r=await desktop!.suno!(action,value);
      if(action==="connect"||action==="disconnect"){setConnected(!!r.connected);setSongs([]);setCursor(null);}
      if(action.startsWith("auto-")){setAuto(!!r.auto);setLastAuto(r.lastAuto);await useLibrary.getState().load();}
      if(action==="library"){setSongs(old=>value?[...new Map([...old,...(r.songs||[])].map(s=>[s.id,s])).values()]:(r.songs||[]));setCursor(r.nextCursor||null);}
      if(action==="download"){
        if(r.status==="imported"){setSongs(old=>old.map(s=>s.id===value?{...s,imported:true}:s));await useLibrary.getState().load();setMessage(r.duplicate?tr("Redan importerad","Already imported"):tr("Importerad till Suno-spellistan","Imported to Suno playlist"));}
        else setMessage(r.status==="processing"?tr("Suno förbereder filen. Försök igen senare.","Suno is preparing the file. Try again later."):tr("Nedladdningen avbröts.","Download cancelled."));
      }
    }catch(e){setMessage((e as Error).message);}
    finally{setBusy(false);}
  };
  const button="rounded-full bg-surface-3 px-4 py-2 text-sm disabled:opacity-40";
  return <section className="flex flex-col gap-3 rounded-xl bg-bg p-3">
    <h3 className="font-semibold">{tr("Anslut Suno-konto (experimentellt)","Connect Suno account (experimental)")}</h3>
    <p className="text-sm text-fg-2">{tr("Officiell Suno-inloggning. Bläddra bland dina egna låtar och importera dem inom kontots nedladdningsvillkor. Musike frågar innan en kredit används.","Official Suno sign-in. Browse your own tracks and import within your account's download rules. Musike asks before using a credit.")}</p>
    {!connected?<button className={button} disabled={busy} onClick={()=>void run("connect")}>{busy?tr("Ansluter…","Connecting…"):tr("Anslut Suno","Connect Suno")}</button>:<>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={()=>void run("library")}>{tr("Hämta bibliotek","Load library")}</button><button className={button} disabled={busy} onClick={()=>void run("disconnect")}>{tr("Koppla från","Disconnect")}</button></div>
      <div className="flex flex-col gap-2 rounded-xl border border-line p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} disabled={busy} onChange={e=>void run(e.target.checked?"auto-on":"auto-off")}/>{tr("Autoimportera redan nedladdade låtar","Auto-import already downloaded songs")}</label><p className="text-xs text-fg-2">{tr("Kontrolleras var femte minut medan Musike körs. Inga nya nedladdningskrediter används automatiskt.","Checks every five minutes while Musike runs. Never automatically uses new download credits.")}</p><button className={button} disabled={busy} onClick={()=>void run("auto-now")}>{tr("Synka tidigare nedladdningar nu","Sync prior downloads now")}</button>{lastAuto&&<p className="text-xs text-fg-2">{tr("Senaste synkning","Last sync")}: {new Date(lastAuto.at).toLocaleTimeString()} · {lastAuto.imported} {tr("importerade","imported")}{lastAuto.error?" · "+lastAuto.error:""}</p>}</div>
      <div className="max-h-64 overflow-auto">{songs.map(s=><div key={s.id} className="flex items-center justify-between gap-2 border-b border-line py-2"><span className="min-w-0 truncate text-sm">{s.title}</span><button className={button} disabled={busy||s.imported} onClick={()=>void run("download",s.id)}>{s.imported?tr("Importerad","Imported"):tr("Importera","Import")}</button></div>)}</div>
      {cursor&&<button className={button} disabled={busy} onClick={()=>void run("library",cursor)}>{tr("Visa fler","Load more")}</button>}
    </>}
    {message&&<p role="status" className="text-sm text-fg-2">{message}</p>}
  </section>;
}
