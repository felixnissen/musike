import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FavoriteGrabber } from "../src/favoriteGrabber.js";
import type { Track } from "../src/types.js";
const song=(id:string):Track=>({id,title:"Test song",artist:"Test artist",duration:180,art:"",thumb:"",kind:"song"});
test("heart queue persists across restart, reuses local files, submits exact ID once, never deletes audio",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"musike-heart-"));let now=1000,posts=0,available=false,completed=false;
 const fetchMock:typeof fetch=async(input,init)=>{
 const url=new URL(String(input));assert.equal(url.origin,"http://127.0.0.1:38274");
 if(url.pathname==="/api/jobs")return Response.json({jobs:[]});
 if(url.pathname==="/api/download"){posts++;const data=JSON.parse(String(init?.body));assert.equal(data.video_id,"abcdefghijk");assert.equal(data.download_type,"single");return Response.json({job_id:"job-1"});}
 if(url.pathname==="/api/jobs/job-1")return Response.json({id:"job-1",status:completed?"completed":"downloading"});
 throw Error("Unexpected route "+url.pathname);};
 const deps={fetch:fetchMock,local:async(t:Track)=>t.id==="existingabc"||available?{file:"test",mime:"audio/wav"}:null,invalidate:()=>{},now:()=>now};
 const file=path.join(dir,"queue.json");
 try{
 let q=new FavoriteGrabber(file,deps);
 await q.enqueue([song("abcdefghijk")]);assert.equal((await q.status()).counts.queued,0);
 await q.enable(true);await q.enqueue([song("abcdefghijk"),song("abcdefghijk"),song("existingabc"),song("cancelledab")]);await q.cancel("cancelledab");
 assert.equal((await q.status()).counts.queued,2);
 await q.tick();assert.equal(posts,1);
 q=new FavoriteGrabber(file,deps);assert.equal((await q.status()).counts.submitted,1);
 await q.tick();assert.equal((await q.status()).counts.offline,1);assert.equal(posts,1);
 now+=16000;await q.tick();assert.equal((await q.status()).counts.submitted,1);
 now+=16000;completed=true;available=true;await q.tick();assert.equal((await q.status()).counts.offline,2);
 await q.cancel("abcdefghijk");assert.equal((await q.status()).counts.offline,2);
 await q.enqueue([song("abcdefghijk")]);await q.tick();assert.equal(posts,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("uncertain POST never blindly resubmits after restart",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"musike-heart-"));let now=1000,posts=0;
 const deps={fetch:(async(input:RequestInfo|URL)=>{if(String(input).endsWith("/api/download")){posts++;throw Error("lost response");}return Response.json({jobs:[]});}) as typeof fetch,local:async()=>null,invalidate:()=>{},now:()=>now};
 try{const file=path.join(dir,"queue.json");let q=new FavoriteGrabber(file,deps);await q.enable(true);await q.enqueue([song("abcdefghijk")]);await q.tick();assert.equal((await q.status()).counts.checking,1);q=new FavoriteGrabber(file,deps);now+=61000;await q.tick();assert.equal(posts,1);assert.equal((await q.status()).counts["needs-review"],1);}finally{await rm(dir,{recursive:true,force:true});}
});
