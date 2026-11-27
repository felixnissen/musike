import { app, safeStorage, shell } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { normalizeSunoMetadata, saveSunoMetadata } from "../../server/src/importMetadata.js";
import { importAudioToLibrary, importedAudio, IMPORT_LIMIT } from "../../server/src/importAudio.js";

const MCP="https://api.suno.com/mcp";
const ISSUER="https://studio-api-prod.suno.com/api/v2/external/oauth";
const METADATA="https://studio-api-prod.suno.com/.well-known/oauth-authorization-server/api/v2/external/oauth";
const SCOPE="api:v0 library:read download offline_access";
type Json=Record<string,any>;
type Session={clientId:string;access:string;refresh?:string;expires:number};
type Tool={name:string;inputSchema?:Json};
const file=()=>path.join(app.getPath("userData"),"suno-authorization.enc");
const indexFile=()=>path.join(app.getPath("userData"),"suno-import-index.json");
const autoFile=()=>path.join(app.getPath("userData"),"suno-auto-import.json");
const autoAttempted=new Set<string>();
let autoCursor:string|undefined, lastAuto:{at:number;imported:number;skipped:number;error?:string}|undefined;
async function autoEnabled(){try{return JSON.parse(await readFile(autoFile(),"utf8")).enabled===true;}catch{return false;}}
export async function setSunoAuto(enabled:boolean){if(enabled&&!((await sunoStatus()).connected))throw Error("Connect Suno first");await writeFile(autoFile(),JSON.stringify({enabled}),"utf8");autoCursor=undefined;autoAttempted.clear();return sunoStatus();}
async function readIndex():Promise<Record<string,string>>{try{return JSON.parse(await readFile(indexFile(),"utf8"));}catch{return {};}}
async function remember(id:string,localId:string){const index=await readIndex();index[id]=localId;await writeFile(indexFile()+".tmp",JSON.stringify(index),"utf8");await rename(indexFile()+".tmp",indexFile());}
let session:Session|null=null, loaded=false, busy=false;
const diagFile=()=>path.join(app.getPath("userData"),"suno-diagnostic.json");
async function diag(stage:string,info:Json={}){await writeFile(diagFile(),JSON.stringify({at:Date.now(),stage,...info}),"utf8").catch(()=>{});}
const keys=(v:unknown)=>v&&typeof v==="object"?Object.keys(v).slice(0,40):[];
let tools:Tool[]=[];let sessionId="", protocol="2025-03-26", seq=0;
const selected=new Map<string,{title:string;metadata:Json}>();
const pendingCredits=new Set<string>();
const random=()=>randomBytes(32).toString("base64url");
async function json(url:string,init:RequestInit={}) {
  const r=await fetch(url,{...init,redirect:"error",signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error("Suno HTTP "+r.status);
  return await r.json() as Json;
}
async function metadata(){
  const m=await json(METADATA);
  if(m.issuer!==ISSUER||!m.code_challenge_methods_supported?.includes("S256")||!m.token_endpoint_auth_methods_supported?.includes("none"))throw Error("Unsupported Suno OAuth configuration");
  for(const key of ["authorization_endpoint","token_endpoint","registration_endpoint"]){
    if(typeof m[key]!=="string"||!m[key].startsWith(ISSUER+"/"))throw Error("Unexpected Suno OAuth endpoint");
  }
  return m;
}
async function load(){
  if(loaded)return;
  loaded=true;
  if(!safeStorage.isEncryptionAvailable())return;
  try{session=JSON.parse(safeStorage.decryptString(await readFile(file())));}catch(e){session=null;await diag("authorization-unavailable",{missing:(e as NodeJS.ErrnoException).code==="ENOENT"});}
}
async function persist(s:Session){
  session=s;loaded=true;
  if(!safeStorage.isEncryptionAvailable()||(process.platform==="linux"&&safeStorage.getSelectedStorageBackend()==="basic_text"))return;
  await writeFile(file()+".tmp",safeStorage.encryptString(JSON.stringify(s)),{mode:0o600});
  await rename(file()+".tmp",file());
}
async function token(m:Json,params:Record<string,string>,old?:Session){
  const t=await json(m.token_endpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params)});
  if(typeof t.access_token!=="string")throw Error("Suno returned no access token");
  await persist({clientId:params.client_id,access:t.access_token,refresh:t.refresh_token||old?.refresh,expires:Date.now()+1000*(Number(t.expires_in)||900)});
}
async function access(){
  await load();
  if(!session)throw Error("Connect Suno first");
  if(session.expires<Date.now()+60000){
    if(!session.refresh)throw Error("Suno authorization expired; connect again");
    const old=session;
    await token(await metadata(),{grant_type:"refresh_token",client_id:old.clientId,refresh_token:old.refresh!,resource:MCP},old);
  }
  return session!.access;
}
function resetMcp(){tools=[];sessionId="";selected.clear();pendingCredits.clear();}
async function rpc(method:string,params:Json={},notify=false):Promise<Json>{
  const id=++seq;
  const r=await fetch(MCP,{method:"POST",redirect:"error",signal:AbortSignal.timeout(70000),headers:{authorization:"Bearer "+await access(),"content-type":"application/json",accept:"application/json, text/event-stream","MCP-Protocol-Version":protocol,...(sessionId?{"Mcp-Session-Id":sessionId}:{})},body:JSON.stringify({jsonrpc:"2.0",...(notify?{}:{id}),method,params})});
  if(!r.ok){await diag("http-error",{method,status:r.status});throw Error("Suno MCP "+method+" HTTP "+r.status);}
  sessionId=r.headers.get("mcp-session-id")||sessionId;
  if(notify||r.status===202){await r.body?.cancel();return {};}
  let result:Json|undefined;
  if(r.headers.get("content-type")?.includes("text/event-stream")){
    const reader=r.body!.getReader(),decoder=new TextDecoder();let buffer="";
    try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>4_000_000)throw Error("Suno response too large");
      let match;while((match=/\r?\n\r?\n/.exec(buffer))){const event=buffer.slice(0,match.index);buffer=buffer.slice(match.index+match[0].length);const data=event.split(/\r?\n/).filter(l=>l.startsWith("data:")).map(l=>l.slice(5).trimStart()).join("\n");if(!data)continue;const v=JSON.parse(data);if(v.id===id){result=v;break;}}
      if(result)break;}}finally{await reader.cancel();}
  }else result=await r.json() as Json;
  if(!result||result.id!==id||result.error){await diag("rpc-error",{method,code:result?.error?.code});throw Error("Suno MCP "+method+" failed"+(typeof result?.error?.code==="number"?" ("+result.error.code+")":""));}
  return result.result||{};
}
async function connectMcp(){
  if(tools.length)return;
  sessionId="";protocol="2025-03-26";
  const result=await rpc("initialize",{protocolVersion:protocol,capabilities:{},clientInfo:{name:"Musike",version:"1.5.9"}});
  if(typeof result.protocolVersion==="string")protocol=result.protocolVersion;
  await rpc("notifications/initialized",{},true);
  let cursor:string|undefined;
  const found:Tool[]=[];let pages=0;
  do{const page=await rpc("tools/list",cursor?{cursor}:{});if(!Array.isArray(page.tools))throw Error("Unexpected Suno tools response");found.push(...page.tools);cursor=page.nextCursor;}while(cursor&&found.length<200&&++pages<10);
  tools=found;
}
async function call(name:"library-list"|"audio-retrieve"|"audio-download",args:Json){
  await connectMcp();
  const t=tools.find(t=>t.name===name);
  if(!t||Object.keys(args).some(k=>!Object.hasOwn(t.inputSchema?.properties||{},k))){await diag("schema-error",{tool:name,available:tools.map(t=>t.name),properties:keys(t?.inputSchema?.properties)});throw Error("Suno tool schema changed: "+name);}
  const r=await rpc("tools/call",{name,arguments:args});
  let value:Json|undefined;
  if(r.structuredContent&&typeof r.structuredContent==="object")value=r.structuredContent as Json;
  if(!value)for(const c of r.content||[]){if(c.type==="text"){try{const v=JSON.parse(c.text);if(v&&typeof v==="object"){value=v;break;}}catch{/* human text */}}}
  if(value){let parsed:Json=value;if(parsed.result&&typeof parsed.result==="object")parsed=parsed.result as Json;if(parsed.data&&typeof parsed.data==="object"&&!Array.isArray(parsed.data)&&!parsed.items&&!parsed.clips&&!parsed.songs&&!parsed.url&&!parsed.status&&!parsed.reason)parsed={...parsed,...parsed.data};if(r.isError&&parsed.reason!=="requires_credit"&&parsed.status!=="requires_credit"){const reason=typeof parsed.reason==="string"&&/^[a-z_]{1,60}$/.test(parsed.reason)?parsed.reason:"tool_error";await diag("tool-error",{tool:name,reason,keys:keys(parsed)});throw Error("Suno "+name+": "+reason);}return parsed;}
  await diag("unknown-response",{tool:name,keys:keys(r),contentTypes:(r.content||[]).map((c:Json)=>c.type)});throw Error("Unexpected Suno "+name+" response");
}
export async function connectSuno(){
  if(busy)throw Error("Suno connection already in progress");
  busy=true;
  const state=random(),verifier=random();
  let callback:((code:string)=>void)|undefined, rejectCallback:((e:Error)=>void)|undefined;
  const http=createServer((req,res)=>{
    const u=new URL(req.url||"/","http://127.0.0.1");
    if(u.pathname!=="/callback"||u.searchParams.get("state")!==state){res.writeHead(400);res.end("Invalid request");return;}
    const code=u.searchParams.get("code");
    res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"});res.end(code?"Authorization received. Return to Musike to see the result.":"Suno authorization cancelled.");
    if(code)callback?.(code);else rejectCallback?.(Error("Suno authorization cancelled"));
  });
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    await new Promise<void>((resolve,reject)=>{http.once("error",reject);http.listen(0,"127.0.0.1",resolve);});
    const addr=http.address();if(!addr||typeof addr==="string")throw Error("Cannot start OAuth callback");
    const redirect="http://127.0.0.1:"+addr.port+"/callback";
    const m=await metadata();
    const client=await json(m.registration_endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client_name:"Musike",redirect_uris:[redirect],grant_types:["authorization_code","refresh_token"],response_types:["code"],token_endpoint_auth_method:"none",scope:SCOPE})});
    if(typeof client.client_id!=="string")throw Error("Suno client registration failed");
    const u=new URL(m.authorization_endpoint);
    u.search=new URLSearchParams({response_type:"code",client_id:client.client_id,redirect_uri:redirect,scope:SCOPE,resource:MCP,state,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"}).toString();
    const wait=new Promise<string>((resolve,reject)=>{callback=resolve;rejectCallback=reject;timer=setTimeout(()=>reject(Error("Suno sign-in timed out")),180000);});
    await shell.openExternal(u.toString());
    const code=await wait;
    await token(m,{grant_type:"authorization_code",client_id:client.client_id,code,redirect_uri:redirect,code_verifier:verifier,resource:MCP});
    await setSunoAuto(false);resetMcp();await connectMcp();
    return sunoStatus();
  }finally{if(timer)clearTimeout(timer);http.close();busy=false;}
}
export async function sunoStatus(){await load();return {connected:!!session, persistent:safeStorage.isEncryptionAvailable()&&!(process.platform==="linux"&&safeStorage.getSelectedStorageBackend()==="basic_text"),auto:await autoEnabled(),lastAuto};}
export async function disconnectSuno(){session=null;loaded=true;resetMcp();await setSunoAuto(false);await rm(file(),{force:true});return sunoStatus();}
export async function sunoLibrary(cursor?:string,downloaded=false){
  const result=await call("library-list",{limit:50,...(cursor?{cursor}:{}),...(downloaded?{downloaded:true}:{})});
  const rows=Array.isArray(result)?result:result.items??result.clips??result.songs??(Array.isArray(result.data)?result.data:result.data?.items??result.data?.clips??result.data?.songs);
  if(!Array.isArray(rows)){await diag("library-unknown",{keys:keys(result),dataKeys:keys(result.data)});throw Error("Suno library returned an unknown format");}
  const index=await readIndex();
  const songs=await Promise.all(rows.map((x:Json)=>x&&({...x,id:x.id??x.clip_id??x.clip?.id,title:x.title??x.clip?.title})).filter((x:Json)=>x&&typeof x.id==="string"&&/^[a-zA-Z0-9_-]{1,100}$/.test(x.id)).map(async(x:Json)=>{
    const title=String(x.title||x.metadata?.title||"Untitled").slice(0,300);
    selected.set(x.id,{title,metadata:x});
    return {id:x.id,title,imported:!!(index[x.id]&&await importedAudio(index[x.id]))};
  }));
  await diag("library-loaded",{rows:rows.length,accepted:songs.length,rowKeys:keys(rows[0]),hasNext:!!(result.next_cursor??result.nextCursor)});
  const next=result.next_cursor??result.nextCursor;return {songs,nextCursor:typeof next==="string"?next:null};
}
export async function sunoDownload(id:string,confirm=false){
  const song=selected.get(id);if(!song)throw Error("Select a song from your Suno library first");
  const known=(await readIndex())[id];
  if(known&&await importedAudio(known))return {status:"imported",duplicate:true};
  if(confirm&&!pendingCredits.has(id))throw Error("Request a download quote first");
  const r=await call("audio-download",{id,format:"mp3",...(confirm?{confirm:true}:{})});
  if(r.status==="requires_credit"||r.requires_credit===true||r.reason==="requires_credit"){pendingCredits.add(id);return {status:"requires_credit"};}
  pendingCredits.delete(id);
  if(r.status==="processing")return {status:"processing"};
  if(typeof r.url!=="string")throw Error("Suno download unavailable: "+String(r.reason||r.status||"unknown"));
  const u=new URL(r.url);
  if(u.protocol!=="https:"||u.username||u.password||!(u.hostname==="suno.com"||u.hostname.endsWith(".suno.com")||u.hostname==="suno.ai"||u.hostname.endsWith(".suno.ai")))throw Error("Unexpected Suno download host; use Suno's export option instead");
  const response=await fetch(u,{redirect:"error",signal:AbortSignal.timeout(120000)});
  if(!response.ok||!response.body)throw Error("Suno file download failed");
  const reader=response.body.getReader(), chunks:Buffer[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>IMPORT_LIMIT)throw Error("Audio exceeds import limit");chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  const result=await importAudioToLibrary(Buffer.concat(chunks),song.title.replace(/[\\/\\\\]/g,"_")+".mp3","suno");
  await remember(id,result.track.id);
  let details=song.metadata;try{details=await call("audio-retrieve",{id});}catch{/* use catalog metadata */}
  await saveSunoMetadata(result.track.id,normalizeSunoMetadata(id,details)).catch(()=>{});
  return {status:"imported",duplicate:result.duplicate};
}

/** Only already-downloaded songs are considered, and never confirm a credit spend. */
export async function sunoAutoTick(force=false){
  if(!(await sunoStatus()).connected||(!force&&!(await autoEnabled())))return sunoStatus();
  let imported=0,skipped=0,error:string|undefined;
  try{
    const page=await sunoLibrary(autoCursor,true);
    let more=false,attempted=0;
    for(const song of page.songs){
      if(song.imported||autoAttempted.has(song.id))continue;
      if(attempted>=5){more=true;break;}
      attempted++;
      const r=await sunoDownload(song.id,false);autoAttempted.add(song.id);
      if(r.status==="imported")imported++;else skipped++;
      if(r.status==="requires_credit"){pendingCredits.delete(song.id);}
      if(r.status==="processing"){more=true;break;}
    }
    // Move through the catalog, including sparse pages. A later pass starts from the newest page again.
    if(!more){autoCursor=page.nextCursor||undefined;autoAttempted.clear();}
  }catch(e){error=(e as Error).message.slice(0,200);}
  lastAuto={at:Date.now(),imported,skipped,error};
  return sunoStatus();
}
