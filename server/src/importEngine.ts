import { identifyFile, isFileSource, type FileSource } from "../../shared/importRegistry.js";
import { importAudioToLibrary, IMPORT_LIMIT } from "./importAudio.js";
export interface ImportReport { added:number; duplicates:number; errors:string[]; }
/** One file entry point for HTTP uploads and watched folders; ZIP decoder loaded only when used. */
export async function importFile(bytes:Buffer,name:string,source:FileSource){
 if(!isFileSource(source)||!name||bytes.length>IMPORT_LIMIT)throw Object.assign(Error("Invalid source or file size"),{statusCode:400});
 const type=identifyFile(name);
 if(type==="archive")return (await import("./importZip.js")).importZip(bytes,source);
 if(type!=="audio")throw Object.assign(Error("Unsupported import file"),{statusCode:400});
 const result=await importAudioToLibrary(bytes,name,source);
 return {...result,added:result.duplicate?0:1,duplicates:result.duplicate?1:0,errors:[] as string[]};
}
