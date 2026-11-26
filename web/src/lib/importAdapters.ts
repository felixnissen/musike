import { identifyLink, identifyFile, type ImportTarget, type FileSource, type ImportSourceId } from "../../../shared/importRegistry";
import type { Track } from "./types";
export interface Preview {title:string;tracks:Track[]}
export interface ImportReport {added:number;duplicates:number;errors:string[]}
export {identifyLink,identifyFile};
const previews:Partial<Record<ImportSourceId,()=>Promise<{preview:(target:ImportTarget)=>Promise<Preview>}>>>={youtube:()=>import("./providers/youtube")};
export async function previewLink(target:ImportTarget):Promise<Preview>{
 const load=previews[target.source];if(load)return (await load()).preview(target);
 throw Error("This source requires its own account or export workflow.");
}
export async function readSpotifyExport(file:File){
 if(file.size>5*1024*1024)throw Error("Export file exceeds 5 MB");
 return (await import("../../../shared/spotifyExport")).parseSpotifyExport(await file.text(),/\.json$/i.test(file.name));
}
export async function importFiles(source:FileSource,files:File[],progress:(done:number)=>void):Promise<ImportReport>{
 const report:ImportReport={added:0,duplicates:0,errors:[]};
 // One upload at a time: the local server serializes commits and large files should not multiply RAM use.
 for(let i=0;i<files.length;i++){
  const f=files[i];
  try{
   if(f.size>128*1024*1024)throw Error("128 MB max");
   if(!["audio","archive"].includes(identifyFile(f.name)||""))throw Error("Unsupported audio file");
   const response=await fetch("/api/import/audio?"+new URLSearchParams({name:f.name,source}),{method:"POST",headers:{"content-type":"application/octet-stream","x-musike-import":"1"},body:f});
   const body=await response.json();
   if(!response.ok)throw Error(body.error||response.statusText);
   report.added+=body.added??(body.duplicate?0:1);report.duplicates+=body.duplicates??(body.duplicate?1:0);report.errors.push(...(body.errors||[]));
  }catch(e){report.errors.push(f.name+": "+(e as Error).message);}
  progress(i+1);
 }
 return report;
}
