import assert from "node:assert/strict";
import { test } from "node:test";
import { identifyLink,identifyFile,providers,supports,isFileSource } from "../../shared/importRegistry.js";
import { parseSpotifyExport } from "../../shared/spotifyExport.js";
test("registry routes valid links and rejects lookalike domains",()=>{
 assert.equal(Object.keys(providers).length,5);
 assert.equal(identifyLink("https://youtu.be/dQw4w9WgXcQ")?.id,"dQw4w9WgXcQ");
 assert.equal(identifyLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghij")?.kind,"playlist");
 assert.equal(identifyLink("https://open.spotify.com/intl-sv/track/0123456789ABCDEFGHIJKL")?.source,"spotify");
 assert.equal(identifyLink("https://suno.com/song/test")?.source,"suno");
 for(const bad of ["https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ","file:///tmp/test","https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ","https://youtube.com:8443/watch?v=dQw4w9WgXcQ","https://youtube.com/watch?v=wrong"])assert.equal(identifyLink(bad),null);
 assert.equal(supports("suno","account-preview"),true);
 assert.equal(supports("spotify","account-preview"),false);
 assert.equal(isFileSource("spotify"),false);
 assert.equal(identifyFile("sound.WAV"),"audio");assert.equal(identifyFile("songs.ZIP"),"archive");assert.equal(identifyFile("sound.exe"),null);
});
test("Spotify nested exports retain all tracks beyond the first batch and deduplicate",()=>{
 const tracks=Array.from({length:123},(_,i)=>({track:{trackName:"Song "+i,artistName:"Artist"}}));
 const parsed=parseSpotifyExport(JSON.stringify({playlists:[{items:tracks},{items:tracks}]}),true);
 assert.equal(parsed.length,123);assert.equal(parsed[122],"Song 122 Artist");
 assert.deepEqual(parseSpotifyExport(JSON.stringify([{master_metadata_track_name:"Song",master_metadata_album_artist_name:"Artist"}]),true),["Song Artist"]);
 assert.deepEqual(parseSpotifyExport("Song, Artist\nsong artist\nOther Artist",false),["Song Artist","Other Artist"]);
});
