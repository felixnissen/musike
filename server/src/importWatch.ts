import { lstat, realpath, readFile, readdir, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { IMPORT_LIMIT, importAudioToLibrary, type ImportSource } from "./importAudio.js";

import { importZip } from "./importZip.js";
const extensions = new Set([".mp3",".wav",".flac",".ogg",".opus",".m4a",".zip"]);
interface Watch { folder: string; seen: Record<string,string>; lastScan?: number; added?: number; errors?: number; pending?: number; lastError?: string }
type State = Partial<Record<ImportSource,Watch>>;
const file = () => path.join(config.dataDir,"import-watch.json");
let state: State | null = null;
let chain: Promise<unknown> = Promise.resolve();
async function load(): Promise<State> {
  if (state) return state;
  try { state = JSON.parse(await readFile(file(),"utf8")) as State; } catch { state = {}; }
  return state!;
}
async function save() {
  await mkdir(config.dataDir,{recursive:true});
  await writeFile(file()+".tmp", JSON.stringify(state), "utf8");
  await rename(file()+".tmp",file());
}
function serial<T>(fn:()=>Promise<T>):Promise<T> {
  const next=chain.then(fn);
  chain=next.catch(()=>{});
  return next;
}
export async function watchStatus(source:ImportSource) {
  const w=(await load())[source];
  if (!w) return null;
  const {seen,...status}=w;
  return {...status, tracked: Object.keys(seen).length};
}
/** Called only with a directory chosen in Electron's native picker. No filesystem paths from HTTP clients. */
export function configureWatch(source:ImportSource,folder:string|null) {
  return serial(async()=>{
    const s=await load();
    if (folder===null) delete s[source];
    else {
      const resolved=await realpath(folder);
      if (!(await lstat(resolved)).isDirectory() || resolved===path.parse(resolved).root) throw new Error("Choose a dedicated music folder, not a drive root.");
      if (s[source]?.folder!==resolved) s[source]={folder:resolved,seen:{}};
    }
    await save();
    return watchStatus(source);
  });
}
async function scan(source:ImportSource,w:Watch) {
  w.added=0; w.errors=0; w.pending=0; w.lastError=undefined;
  const root=await realpath(w.folder);
  if (root!==w.folder) throw new Error("Watched folder has changed; choose it again.");
  let examined=0, attempted=0;
  async function walk(dir:string,depth:number) {
    if(depth>4||examined>=10000)return;
    const entries=await readdir(dir,{withFileTypes:true});
    for(const entry of entries) {
      if(++examined>10000)break;
      if(entry.isSymbolicLink())continue;
      const full=path.join(dir,entry.name);
      if(entry.isDirectory()) {await walk(full,depth+1);continue;}
      if(!entry.isFile()||!extensions.has(path.extname(entry.name).toLowerCase()))continue;
      try {
        const actual=await realpath(full);
        const relative=path.relative(root,actual);
        if(relative.startsWith("..")||path.isAbsolute(relative))continue;
        const st=await lstat(full);
        if(!st.isFile()||st.size>IMPORT_LIMIT||st.size<32||Date.now()-st.mtimeMs<5000)continue;
        const signature=st.size+":"+st.mtimeMs;
        if(w.seen[relative]===signature)continue;
        if(attempted>=25){w.pending!++;continue;}
        attempted++;
        const data=await readFile(actual);
        const after=await lstat(full);
        if(after.size!==st.size||after.mtimeMs!==st.mtimeMs){w.pending!++;continue;}
        if(path.extname(entry.name).toLowerCase()===".zip") {
          const result=await importZip(data,source);w.added!+=result.added;w.errors!+=result.errors.length;
          if(result.errors.length){w.lastError=result.errors[0];continue;}
        }else{
          const result=await importAudioToLibrary(data,entry.name,source);
          if(!result.duplicate)w.added!++;
        }
        w.seen[relative]=signature;
      }catch(e){w.errors!++;w.lastError=(e as Error).message.slice(0,200);}
    }
  }
  await walk(root,0);
  if(examined>=10000)w.lastError="Scan capped at 10,000 entries. Choose a smaller folder.";
  w.lastScan=Date.now();
}
export function runWatch() {
  return serial(async()=>{
    const s=await load();
    for(const source of ["suno","local","musicgrabber"] as const) {
      const w=s[source]; if(!w)continue;
      try {await scan(source,w);} catch(e){w.errors=(w.errors||0)+1;w.lastError=(e as Error).message.slice(0,200);w.lastScan=Date.now();}
    }
    await save();
  });
}
/** Single in-process worker, active only while desktop Musike runs. */
export function startWatchMonitor() {
  let busy=false;
  const tick=()=>{if(busy)return;busy=true;void runWatch().catch(()=>{}).finally(()=>{busy=false;});};
  const timer=setInterval(tick,60000);
  tick();
  return ()=>clearInterval(timer);
}
