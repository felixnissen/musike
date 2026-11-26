/** Parse personal exports without dropping tracks after the first page. */
export function parseSpotifyExport(text:string,json:boolean):string[]{
 const terms:string[]=[];
 if(!json)terms.push(...text.split(/\r?\n/));
 else{
 const root:unknown=JSON.parse(text);
 const visit=(value:unknown,depth:number)=>{
  if(depth>8||terms.length>=20000||!value||typeof value!=="object")return;
  if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return;}
  const t=value as Record<string,unknown>;
  const title=t.trackName??t.song??t.name??t.master_metadata_track_name;
  const artist=t.artistName??t.artist??t.master_metadata_album_artist_name??(Array.isArray(t.artists)?t.artists.map(a=>typeof a==="object"&&a?a.name:"").filter(Boolean).join(" "):undefined);
  if(typeof title==="string"&&typeof artist==="string"&&title.trim()&&artist.trim()){terms.push(title+" "+artist);return;}
  for(const key of ["track","tracks","items","playlists","songs"])visit(t[key],depth+1);
 };
 visit(root,0);
 }
 const unique=new Map<string,string>();
 for(const term of terms){const t=term.replace(/,/g," ").replace(/\s+/g," ").trim().slice(0,500);if(t&&!unique.has(t.toLowerCase()))unique.set(t.toLowerCase(),t);}
 return [...unique.values()];
}
