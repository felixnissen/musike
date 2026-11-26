import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export interface SunoMetadata { sunoId:string; title?:string; lyrics?:string; style?:string; cover?:string; duration?:number; }
const dir=()=>path.join(config.dataDir,"imported-metadata");
const localId=(id:string)=>/^local-[a-f0-9]{64}$/.test(id);
function text(v:unknown,max:number){return typeof v==="string"?v.slice(0,max):undefined;}
export function normalizeSunoMetadata(id:string,input:unknown):SunoMetadata{
  const v=(input&&typeof input==="object"?input:{}) as Record<string,any>;
  const m=(v.metadata&&typeof v.metadata==="object"?v.metadata:{}) as Record<string,any>;
  const cover=text(v.image_url??v.cover_url??m.image_url,1000);
  let safeCover:string|undefined;
  if(cover)try{const u=new URL(cover);if(u.protocol==="https:"&&!u.username&&!u.password&&(u.hostname.endsWith(".suno.com")||u.hostname.endsWith(".suno.ai")))safeCover=cover;}catch{}
  const duration=Number(v.duration??m.duration);
  return {sunoId:id,title:text(v.title??m.title,300),lyrics:text(m.lyrics??v.lyrics,50000),style:text(m.style??v.style??m.tags,4000),cover:safeCover,duration:Number.isFinite(duration)&&duration>=0?duration:undefined};
}
export async function saveSunoMetadata(id:string,metadata:SunoMetadata){
  if(!localId(id))throw Error("Invalid local audio ID");
  await mkdir(dir(),{recursive:true});
  const p=path.join(dir(),id+".json");
  await writeFile(p+".tmp",JSON.stringify(metadata),"utf8");await rename(p+".tmp",p);
}
export async function readSunoMetadata(id:string):Promise<SunoMetadata|null>{
  if(!localId(id))return null;
  try{return JSON.parse(await readFile(path.join(dir(),id+".json"),"utf8"));}catch{return null;}
}
