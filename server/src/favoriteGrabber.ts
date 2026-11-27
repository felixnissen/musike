import { mkdir,readFile,writeFile,rename } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { localAudio, invalidateLocalIndex } from "./localAudio.js";
import { VIDEO_ID,type Track } from "./types.js";

export type JobState="queued"|"submitted"|"checking"|"offline"|"needs-review"|"failed"|"cancelled";
type Job={track:Track;state:JobState;at:number;next:number;attempts:number;jobId?:string;error?:string};
type State={enabled:boolean;jobs:Record<string,Job>};
type ProviderJob={id:string;video_id?:string;status:string;file_deleted?:boolean};
const BASE="http://127.0.0.1:38274";
type Deps={fetch:typeof fetch;local:typeof localAudio;invalidate:()=>void;now:()=>number};
export class FavoriteGrabber {
 private state:State={enabled:false,jobs:{}};
 private chain:Promise<unknown>=Promise.resolve();
 private loaded=false;
 private timer:ReturnType<typeof setInterval>|undefined;
 private working=false;
 constructor(private file:string,private deps:Deps={fetch:globalThis.fetch,local:localAudio,invalidate:invalidateLocalIndex,now:Date.now}){}
 private serial<T>(fn:()=>Promise<T>):Promise<T>{const n=this.chain.then(async()=>{if(!this.loaded){try{this.state=JSON.parse(await readFile(this.file,"utf8"));}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw Error("Favorite queue cannot be read; original preserved");}this.loaded=true;}return fn();});this.chain=n.catch(()=>{});return n;}
 private async save(){await mkdir(path.dirname(this.file),{recursive:true});await writeFile(this.file+".tmp",JSON.stringify(this.state),"utf8");await rename(this.file+".tmp",this.file);}
 async status(){return this.serial(async()=>{const jobs=Object.values(this.state.jobs);return {enabled:this.state.enabled,counts:Object.fromEntries(["queued","submitted","checking","offline","needs-review","failed","cancelled"].map(s=>[s,jobs.filter(j=>j.state===s).length])),recent:jobs.sort((a,b)=>b.at-a.at).slice(0,30).map(({track,state,error})=>({id:track.id,title:track.title,state,error}))};});}
 async enable(enabled:boolean){await this.serial(async()=>{this.state.enabled=enabled;await this.save();});return this.status();}
 async enqueue(tracks:Track[]){await this.serial(async()=>{if(!this.state.enabled)return;let changed=false;for(const track of tracks){if(!VIDEO_ID.test(track.id)||track.kind!=="song"||!track.artist||!track.title)continue;const old=this.state.jobs[track.id];if(old&&old.state!=="cancelled")continue;if(Object.keys(this.state.jobs).length>=20000)break;this.state.jobs[track.id]={track,state:"queued",at:this.deps.now(),next:0,attempts:0};changed=true;}if(changed)await this.save();});}
 async cancel(id:string){await this.serial(async()=>{const j=this.state.jobs[id];if(j&&j.state==="queued"){j.state="cancelled";await this.save();}});}
 private async request<T>(route:string,init?:RequestInit):Promise<T>{const r=await this.deps.fetch(BASE+route,{...init,redirect:"error",signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error("MusicGrabber HTTP "+r.status);return r.json() as Promise<T>;}
 private async lookup(j:Job){const result=await this.request<{jobs:ProviderJob[]}>("/api/jobs?limit=100&q="+encodeURIComponent(j.track.title));if(!Array.isArray(result.jobs))throw Error("Unknown MusicGrabber jobs response");return result.jobs.find(x=>x.video_id===j.track.id&&!x.file_deleted&&["pending","queued","running","downloading","processing","completed","in_progress"].includes(x.status));}
 private async reconcile(j:Job,x:ProviderJob){j.jobId=x.id;if(x.status==="completed"){this.deps.invalidate();j.state=await this.deps.local(j.track)?"offline":"needs-review";j.error=j.state==="offline"?undefined:"Downloaded file could not be matched unambiguously";}else if(["failed","cancelled","error","skipped"].includes(x.status)){j.state="failed";j.error="MusicGrabber job "+x.status;}else{j.state="submitted";j.next=this.deps.now()+15000;}}
 async tick(){
 if(this.working)return;this.working=true;
 try{await this.serial(async()=>{
 if(!this.state.enabled)return;
 const now=this.deps.now();const j=Object.values(this.state.jobs).find(x=>["queued","submitted","checking"].includes(x.state)&&x.next<=now);if(!j)return;
 try{
 if(await this.deps.local(j.track)){j.state="offline";j.error=undefined;await this.save();return;}
 if(j.jobId){const x=await this.request<ProviderJob>("/api/jobs/"+encodeURIComponent(j.jobId));await this.reconcile(j,x);}
 else {
 const old=await this.lookup(j);
 if(old){await this.reconcile(j,old);}
 else if(j.state==="checking"){j.state="needs-review";j.error="Previous submission uncertain; no automatic duplicate submission";}
 else {
 // Persist the intent before POST; after a crash, reconcile rather than blindly replay.
 j.state="checking";j.attempts++;j.next=now+30000;await this.save();
 const v=await this.request<{job_id?:string;id?:string}>("/api/download",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({video_id:j.track.id,title:j.track.title,artist:j.track.artist,selected_duration_secs:j.track.duration>0?j.track.duration:undefined,source:"youtube",download_type:"single",convert_audio:false})});
 const id=v.job_id||v.id;if(typeof id!=="string"||!id)throw Error("MusicGrabber did not return a job ID");
 j.jobId=id;j.state="submitted";j.next=now+15000;j.error=undefined;
 }
 }
 }catch(e){j.error=(e as Error).message.slice(0,200);j.next=now+60000;if(j.state==="queued"){j.attempts++;j.next=now+Math.min(3600000,15000*2**Math.min(j.attempts,8));}}
 await this.save();
 });}finally{this.working=false;}
 }
 start(){this.timer=setInterval(()=>void this.tick().catch(()=>{}),5000);this.timer.unref?.();return ()=>{if(this.timer)clearInterval(this.timer);};}
}
export const createFavoriteGrabber=()=>new FavoriteGrabber(path.join(config.dataDir,"favorite-grabber.json"));
