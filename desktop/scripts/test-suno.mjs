import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const temp=await mkdtemp(path.join(tmpdir(),"musike-suno-bundle-"));
try {
 const outfile=path.join(temp,"test.mjs");
 await build({entryPoints:[path.join(root,"tests/suno.test.ts")],outfile,bundle:true,platform:"node",format:"esm",alias:{electron:path.join(root,"tests/electronMock.ts")},target:"node22"});
 const r=spawnSync(process.execPath,["--test",outfile],{stdio:"inherit"});process.exitCode=r.status??1;
}finally{await rm(temp,{recursive:true,force:true});}
