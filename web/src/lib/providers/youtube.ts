import type { ImportTarget } from "../../../../shared/importRegistry";
import { api,capabilities } from "../api";
import type { Preview } from "../importAdapters";
export async function preview(target:ImportTarget):Promise<Preview>{
 if(target.source!=="youtube"||!target.id)throw Error("Invalid YouTube link");
 if(target.kind==="playlist"){
  if(!capabilities.video)throw Error("Playlist preview is desktop only.");
  const res=await fetch("/api/import/youtube/playlist?id="+encodeURIComponent(target.id));const data=await res.json();
  if(!res.ok)throw Error(data.error||res.statusText);return data;
 }
 const r=await api.prepare(target.id);
 return {title:"YouTube imports",tracks:[{id:r.id,title:r.title,artist:"YouTube",duration:r.duration,thumb:"https://i.ytimg.com/vi/"+r.id+"/mqdefault.jpg",art:"https://i.ytimg.com/vi/"+r.id+"/hq720.jpg",kind:"video"}]};
}
