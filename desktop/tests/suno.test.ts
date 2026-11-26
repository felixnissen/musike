import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setOpenHandler } from "./electronMock.js";
import { config } from "../../server/src/config.js";
import * as library from "../../server/src/library.js";
import { fileStorage } from "../../server/src/libraryFile.js";
import { readSunoMetadata } from "../../server/src/importMetadata.js";
import { connectSuno,disconnectSuno,sunoStatus,sunoLibrary,sunoDownload,sunoAutoTick,setSunoAuto } from "../src/suno.js";

test("Suno OAuth PKCE, MCP SSE catalog, credit approval, local import and duplicate protection (simulated service)",async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),"musike-suno-test-"));
  process.env.MUSIKE_TEST_USER_DATA=temp;config.dataDir=temp;library.useLibraryStorage(fileStorage());
  const original=globalThis.fetch;
  const issuer="https://studio-api-prod.suno.com/api/v2/external/oauth";
  let quotes=0,spends=0,downloads=0,expectedRedirect="",challenge="";
  const result=(v:unknown)=>Response.json(v);
  setOpenHandler(async link=>{
    const u=new URL(link);assert.equal(u.origin,"https://studio-api-prod.suno.com");
    assert.equal(u.searchParams.get("redirect_uri"),expectedRedirect);assert.equal(u.searchParams.get("code_challenge_method"),"S256");challenge=u.searchParams.get("code_challenge")!;
    const wrong=await original(expectedRedirect+"?code=fake&state=wrong");assert.equal(wrong.status,400);
    const res=await original(expectedRedirect+"?code=fake&state="+encodeURIComponent(u.searchParams.get("state")!));assert.equal(res.status,200);
  });
  const wav=Buffer.alloc(16044);wav.write("RIFF",0);wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(16000,40);
  globalThis.fetch=async(input,init)=>{
    const u=String(input);
    if(u.includes(".well-known"))return result({issuer,authorization_endpoint:issuer+"/authorize/",token_endpoint:issuer+"/token/",registration_endpoint:issuer+"/register/",code_challenge_methods_supported:["S256"],token_endpoint_auth_methods_supported:["none"]});
    if(u.endsWith("/register/")){const b=JSON.parse(String(init?.body));expectedRedirect=b.redirect_uris[0];assert.equal(b.token_endpoint_auth_method,"none");assert.ok(!b.scope.includes("credits:spend"));return result({client_id:"test-client"});}
    if(u.endsWith("/token/")){const b=new URLSearchParams(String(init?.body));assert.equal(b.get("code"),"fake");const {createHash}=await import("node:crypto");assert.equal(createHash("sha256").update(b.get("code_verifier")!).digest("base64url"),challenge);return result({access_token:"test-access",refresh_token:"test-refresh",expires_in:900});}
    if(u==="https://api.suno.com/mcp"){
      assert.equal(new Headers(init?.headers).get("authorization"),"Bearer test-access");
      const b=JSON.parse(String(init?.body));const rpc=(v:unknown)=>result({jsonrpc:"2.0",id:b.id,result:v});
      if(b.method==="initialize")return rpc({protocolVersion:"2025-03-26"});
      if(b.method==="notifications/initialized")return new Response(null,{status:202});
      if(b.method==="tools/list"){const tools=["library-list","audio-download","audio-retrieve"].map(name=>({name,inputSchema:{properties:{limit:{},cursor:{},id:{},format:{},confirm:{},downloaded:{}}}}));return new Response("data: "+JSON.stringify({jsonrpc:"2.0",id:b.id,result:{tools}})+"\n\n",{headers:{"content-type":"text/event-stream"}});}
      const a=b.params.arguments;
      if(b.params.name==="library-list")return rpc({content:[{type:"text",text:JSON.stringify({items:a.downloaded?[{id:"clip-123",title:"Test song"},{id:"clip-credit",title:"Credit blocked"}]:[{id:"clip-123",title:"Test song"}]})}]});
      if(b.params.name==="audio-retrieve")return rpc({structuredContent:{id:a.id,title:"Test song",metadata:{lyrics:"Original test lyrics",style:"rock"}}});
      if(b.params.name==="audio-download"){if(!a.confirm){quotes++;return rpc({structuredContent:{status:"requires_credit"}});}spends++;return rpc({structuredContent:{url:"https://cdn.suno.ai/test.mp3"}});}
    }
    if(u==="https://cdn.suno.ai/test.mp3"){downloads++;assert.equal(new Headers(init?.headers).get("authorization"),null);return new Response(wav);}
    throw Error("Unexpected request "+u);
  };
  try{
    assert.equal((await sunoStatus()).connected,false);
    assert.equal((await connectSuno()).connected,true);
    const listing=await sunoLibrary();assert.equal(listing.songs[0].title,"Test song");
    await assert.rejects(()=>sunoDownload("clip-123",true),/quote/);
    assert.equal((await sunoDownload("clip-123")).status,"requires_credit");assert.equal(spends,0);assert.equal(downloads,0);
    assert.equal((await sunoDownload("clip-123",true)).status,"imported");assert.equal(spends,1);assert.equal(downloads,1);
    const lib=await library.getLibrary();assert.equal(lib.playlists[0].tracks.length,1);
    assert.equal((await readSunoMetadata(lib.playlists[0].tracks[0].id))?.lyrics,"Original test lyrics");
    assert.equal((await sunoLibrary()).songs[0].imported,true);
    assert.equal((await sunoDownload("clip-123")).duplicate,true);assert.equal(quotes,1);assert.equal(spends,1);
    assert.equal((await sunoStatus()).auto,false);
    await sunoAutoTick();assert.equal(quotes,1);
    await setSunoAuto(true);const auto=await sunoAutoTick();assert.equal(auto.lastAuto?.skipped,1);assert.equal(spends,1);assert.equal(downloads,1);assert.equal(quotes,2);
    assert.equal((await disconnectSuno()).connected,false);assert.equal((await sunoStatus()).auto,false);
  }finally{globalThis.fetch=original;await rm(temp,{recursive:true,force:true});}
});
