import { inflateRawSync, crc32 } from "node:zlib";
import { IMPORT_LIMIT, importAudioToLibrary, type ImportSource } from "./importAudio.js";

const MAX_ENTRIES = 1000;
const MAX_TOTAL = 512 * 1024 * 1024;
const AUDIO = /\.(mp3|wav|flac|ogg|opus|m4a)$/i;
const bad = (message:string) => Object.assign(new Error(message), {statusCode:400});
interface Entry { name:string; size:number; compressed:number; offset:number; method:number; flags:number; crc:number }
export function zipEntries(b:Buffer): Entry[] {
  if(b.length>IMPORT_LIMIT || b.length<22)throw bad("ZIP is too large or invalid.");
  let eocd=-1;
  for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--)if(b.readUInt32LE(p)===0x06054b50 && p+22+b.readUInt16LE(p+20)===b.length){eocd=p;break;}
  if(eocd<0)throw bad("ZIP end record not found.");
  if(b.readUInt16LE(eocd+4)||b.readUInt16LE(eocd+6))throw bad("Multi-disk ZIP not supported.");
  const count=b.readUInt16LE(eocd+10), length=b.readUInt32LE(eocd+12), start=b.readUInt32LE(eocd+16);
  if(count>MAX_ENTRIES||start+length>eocd||b.readUInt16LE(eocd+8)!==count)throw bad("ZIP directory exceeds limits.");
  const entries:Entry[]=[];let total=0,p=start;
  for(let i=0;i<count;i++){
    if(p+46>start+length||b.readUInt32LE(p)!==0x02014b50)throw bad("Invalid ZIP directory.");
    const flags=b.readUInt16LE(p+8),method=b.readUInt16LE(p+10),crc=b.readUInt32LE(p+16),compressed=b.readUInt32LE(p+20),size=b.readUInt32LE(p+24);
    const n=b.readUInt16LE(p+28),x=b.readUInt16LE(p+30),c=b.readUInt16LE(p+32),offset=b.readUInt32LE(p+42);
    if(p+46+n+x+c>start+length)throw bad("Invalid ZIP entry.");
    const name=b.toString("utf8",p+46,p+46+n);
    p+=46+n+x+c;
    if(!AUDIO.test(name)||name.endsWith("/"))continue;
    if(flags&1||![0,8].includes(method)||size>IMPORT_LIMIT||compressed>IMPORT_LIMIT||offset>=start)throw bad("Encrypted, unsupported or oversized ZIP audio entry.");
    total+=size;
    if(total>MAX_TOTAL)throw bad("ZIP expands beyond 512 MB; unpack it into your watched folder.");
    entries.push({name,size,compressed,offset,method,flags,crc});
  }
  return entries;
}
function extract(b:Buffer,e:Entry) {
  const p=e.offset;
  if(p+30>b.length||b.readUInt32LE(p)!==0x04034b50)throw bad("Invalid ZIP file header.");
  if(b.readUInt16LE(p+8)!==e.method||(b.readUInt16LE(p+6)&1))throw bad("ZIP header mismatch.");
  const start=p+30+b.readUInt16LE(p+26)+b.readUInt16LE(p+28);
  if(start+e.compressed>b.length)throw bad("Truncated ZIP entry.");
  const data=b.subarray(start,start+e.compressed);
  const bytes=e.method===0?data:inflateRawSync(data,{maxOutputLength:Math.max(1,e.size)});
  if(bytes.length!==e.size||crc32(bytes)!==e.crc)throw bad("ZIP integrity check failed.");
  return bytes;
}
/** Files are read in memory, never extracted using paths from the archive. */
export async function importZip(bytes:Buffer,source:ImportSource) {
  const entries=zipEntries(bytes);
  if(!entries.length)throw bad("No supported audio files in ZIP.");
  let added=0,duplicates=0;
  const errors:string[]=[];
  for(const entry of entries){
    try{
      const data=extract(bytes,entry);
      const result=await importAudioToLibrary(data,entry.name,source);
      if(result.duplicate)duplicates++;else added++;
    }catch(e){errors.push(entry.name.slice(0,200)+": "+(e as Error).message);}
  }
  return {added,duplicates,errors};
}
