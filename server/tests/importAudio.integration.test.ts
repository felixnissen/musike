import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { config } from "../src/config.js";
import { startServer } from "../src/app.js";
import { audioFormat } from "../src/importAudio.js";
import { configureWatch, runWatch, watchStatus } from "../src/importWatch.js";
import { crc32, deflateRawSync } from "node:zlib";

function wav() {
  const b = Buffer.alloc(44 + 16000);
  b.write("RIFF",0); b.writeUInt32LE(b.length-8,4); b.write("WAVEfmt ",8);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
  b.writeUInt32LE(8000,24); b.writeUInt32LE(16000,28); b.writeUInt16LE(2,32);
  b.writeUInt16LE(16,34); b.write("data",36); b.writeUInt32LE(16000,40);
  return b;
}
function zip(name:string,bytes:Buffer) {
  const n=Buffer.from(name),d=deflateRawSync(bytes),crc=crc32(bytes);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(d.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(n.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(d.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(n.length,28);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+n.length,12);end.writeUInt32LE(30+n.length+d.length,16);
  return Buffer.concat([local,n,d,central,n,end]);
}
test("imports an owned audio file, deduplicates bytes, saves playlist, serves ranges, rejects invalid input", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "musike-import-test-"));
  const old = config.dataDir, cache = config.cacheDir;
  config.dataDir = dir; config.cacheDir = path.join(dir,"cache");
  const oldPeer = process.env.MUSIKE_PEER_ENABLED;
  delete process.env.MUSIKE_PEER_ENABLED;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    server = await startServer({host:"127.0.0.1",port: 48917,portFallback:true});
    const base = "http://127.0.0.1:" + server.port;
    const audio = wav();
    assert.equal(audioFormat(audio),"wav");
    const headers = {"content-type":"application/octet-stream","x-musike-import":"1"};
    const send = (name:string, body:Buffer, h:Record<string,string> = headers) => fetch(base+"/api/import/audio?source=suno&name="+encodeURIComponent(name), {method:"POST",headers:h,body});
    assert.equal((await send("bad.wav",Buffer.alloc(100))).status,400);
    assert.equal((await send("blocked.wav",audio,{"content-type":"application/octet-stream"})).status,403);
    const first = await send("Rickard - Song.wav",audio);
    assert.equal(first.status,200,await first.clone().text());
    const {track} = await first.json();
    assert.match(track.id,/^local-[a-f0-9]{64}$/); assert.equal(track.title,"Song");
    const second = await send("Duplicate.wav",audio);
    const duplicate=await second.json();assert.equal(duplicate.track.id,track.id);assert.equal(duplicate.duplicate,true);
    const changed=Buffer.from(audio);changed[44]=1;
    const archive=zip("../Rickard - Zip.wav",changed);
    const zipped=await send("Suno.zip",archive);assert.equal(zipped.status,200,await zipped.clone().text());assert.equal((await zipped.json()).added,1);
    const zrepeat=await send("Suno.zip",archive);assert.equal((await zrepeat.json()).duplicates,1);
    const watchFolder=path.join(dir,"exports");await mkdir(watchFolder);const watched=Buffer.from(audio);watched[45]=2;const watchFile=path.join(watchFolder,"Rickard - Watch.wav");await writeFile(watchFile,watched);await utimes(watchFile,new Date(0),new Date(0));
    await configureWatch("suno",watchFolder);await runWatch();assert.equal((await watchStatus("suno"))?.tracked,1);assert.equal((await watchStatus("suno"))?.added,1);await runWatch();assert.equal((await watchStatus("suno"))?.added,0);await configureWatch("suno",null);
    const lib = await (await fetch(base+"/api/library")).json();
    assert.equal(lib.playlists[0].tracks[0].id,track.id);assert.equal(lib.playlists[0].tracks.length,3);
    const range = await fetch(base+"/api/stream/"+track.id+"/audio",{headers:{Range:"bytes=0-43"}});
    assert.equal(range.status,206); assert.deepEqual(Buffer.from(await range.arrayBuffer()),audio.subarray(0,44));
    assert.equal((await fetch(base+"/api/stream/local-"+"0".repeat(64)+"/audio?youtube=1")).status,404);
    const favorite = await fetch(base+"/api/favorites/"+track.id,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(track)});
    assert.equal(favorite.status,200);
    assert.equal((await fetch(base+"/api/favorites/"+track.id,{method:"DELETE"})).status,200);
  } finally { await server?.close(); config.dataDir=old; config.cacheDir=cache; if(oldPeer !== undefined) process.env.MUSIKE_PEER_ENABLED=oldPeer; await rm(dir,{recursive:true,force:true}); }
});
