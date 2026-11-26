/** Shared provider manifest. No network or SDK work at module load. */
export const IMPORT_SOURCES = ["youtube","suno","spotify","musicgrabber","local"] as const;
export type ImportSourceId = typeof IMPORT_SOURCES[number];
export type FileSource = "suno"|"musicgrabber"|"local";
export type Capability = "route-link"|"links"|"search"|"playlist"|"export"|"audio"|"archive"|"folder"|"account-preview"|"peer";
export interface Provider { id:ImportSourceId; capabilities:readonly Capability[]; hosts:readonly string[]; }
export const providers:Readonly<Record<ImportSourceId,Provider>> = {
 youtube:{id:"youtube",capabilities:["links","search","playlist"],hosts:["youtube.com","youtu.be"]},
 suno:{id:"suno",capabilities:["route-link","audio","archive","folder","account-preview"],hosts:["suno.com","suno.ai"]},
 spotify:{id:"spotify",capabilities:["route-link","export"],hosts:["spotify.com"]},
 musicgrabber:{id:"musicgrabber",capabilities:["audio","archive","folder","peer"],hosts:[]},
 local:{id:"local",capabilities:["audio","archive","folder"],hosts:[]},
};
export function supports(source:ImportSourceId,cap:Capability){return providers[source].capabilities.includes(cap);}
export function isFileSource(source:unknown):source is FileSource {return source==="suno"||source==="musicgrabber"||source==="local";}
export type ImportTarget={source:ImportSourceId;kind:"track"|"playlist"|"album"|"link";id?:string;url:string};
const video=/^[A-Za-z0-9_-]{11}$/;
export function identifyLink(input:string):ImportTarget|null {
 let url:URL;try{url=new URL(input.trim());}catch{return null;}
 if(!["https:","http:"].includes(url.protocol)||url.username||url.password||url.port)return null;
 const host=url.hostname.toLowerCase(),parts=url.pathname.split("/").filter(Boolean);
 const source=IMPORT_SOURCES.find(id=>providers[id].hosts.some(h=>host===h||host.endsWith("."+h)));
 if(!source)return null;
 if(source==="youtube"){
 const list=url.searchParams.get("list");
 if(list&&/^[A-Za-z0-9_-]{10,100}$/.test(list))return {source,kind:"playlist",id:list,url:url.href};
 const id=host==="youtu.be"?parts[0]:url.searchParams.get("v")||(["shorts","live","embed"].includes(parts[0])?parts[1]:null);
 return id&&video.test(id)?{source,kind:"track",id,url:url.href}:null;
 }
 if(source==="spotify"){
 const kind=parts.find(p=>["track","playlist","album"].includes(p)) as ImportTarget["kind"]|undefined;
 const id=kind?parts[parts.indexOf(kind)+1]:undefined;
 return kind&&id&&/^[A-Za-z0-9]{22}$/.test(id)?{source,kind,id,url:url.href}:null;
 }
 if(source==="suno")return {source,kind:"link",url:url.href};
 return null;
}
export function identifyFile(name:string):"audio"|"archive"|"export"|null {
 if(/\.(mp3|wav|flac|ogg|opus|m4a)$/i.test(name))return "audio";
 if(/\.zip$/i.test(name))return "archive";
 if(/\.(json|txt)$/i.test(name))return "export";
 return null;
}
