# Maestro DJ – kodgranskning av donatorprojekt (2026-11-22)

**Syfte:** välja återanvändbara implementationer för Musikes befintliga Windows/Android-spelare – inte starta en separat radiostation. Denna rapport är en granskning av faktisk källkod och licensfiler, **inte** ett påstående om att någon av externa apparna körts eller importerats.

## Dagens Musike-arkitektur (verifierad lokalt)

- `web/src/player/player.ts`: en persistent HTMLAudioElement (`createAudio()`) plus VideoElement, Zustand-kö, `load()`, `onStarted()`, `onEnded()`, lokal/YouTube-fallback.
- `web/src/lib/maestroDJ.ts`: situationer Party, Chill, Skriksjunga, Nattkörning, Mitt läge; spellistebaserad urvalsmotor, lokal lyssnings-/skipprofil och återanvänd Smart Shuffle.
- `web/src/lib/types.ts`: Track har id, title, artist, album, duration, thumb, art och kind; inget pålitligt BPM, genre, key, energy eller MC-beskrivning i spelarens typ.
- Android återanvänder webbfrontend men mediaströmmen skiljer sig; en Web Audio-mixer måste testas mot native-uppspelning och bakgrundsläge.

## Donator 1: AI Radio — snabbaste ljudvägen

Repo: https://github.com/4ttth/ai-radio
Inspekterat: `public/player.js`, `server/director/segments.js`, `server/sequencer/sequencer.js`, `server/ai/dj.js`, `package.json`, `README.md`.

**Faktisk kod:**
- `public/player.js`: två `Audio`-deck → separata GainNodes → musicBus → master; röstkanal vid sidan; `playTrack()` rampas över `crossfadeSeconds`; `duck()` till exempelvis 0,22 och `unduck()` till 1; `playVoice()` avkodar TTS-ljud via `AudioContext.decodeAudioData`. Ger en **minimal donor för MC-mixning** utan Icecast.
- `server/director/segments.js`: SHA-1-baserad TTS-filcache efter motor, röst, text. Kokoro lokalt stöds, om röstmodellen är förladdad. AI-rösten får misslyckas utan att stoppa musiken.
- `server/ai/dj.js`: prompt för intro, handoff och korta segment; kräver bara artist/titel och valfria genre/BPM/årtal.
- `server/sequencer/sequencer.js`: 12-spårig recency-exkludering, BPM-sortering och enkel genreövergång; enklare än Musikes befintliga Smart Shuffle. **Ersätt inte Musikes urvalsmotor**.
- `package.json` anger MIT. Separat LICENSE-fil hittades inte på repos rot; dokumentera attribution/versionspunkt vid återanvändning.

**Brist att rätta innan portning:** `playTrack()` sväljer `HTMLMediaElement.play()`-fel och kan samtidigt fasa ned det aktuella decket, så en blockerad eller oåtkomlig kommande låt riskerar tystnad. Dess fördröjda `setTimeout()` saknar transaktions-/generationstoken: snabb låtväxling kan pausa fel deck. `AudioContext` måste initieras genom användargester; ljudkällor på olika origins måste ha korrekt CORS. Musike behöver bevara skip, seek, paus, köhändelser och bakgrundsbeteende. Använd **idé/arkitektur**, adapter och nya tester, inte okritiskt filbyte.

## Donator 2: Radio Clyde — bäst producentpipeline

Repo: https://github.com/a1anw2/radioclyde
Inspekterat: `src/producer/generateScript.js`, `src/producer/research/trackResearch.js`, `src/director/djAudio.js`, `package.json`.

**Faktisk kod:** en producent som delar upp arbetet i (A) deterministiskt spårurval, (B) faktainsamling från Wikipedia/album med cache och små språkmodellsextraktioner, (C) deterministisk placering av inslag, (D) korta språkmodellsanrop vid låtgränser och (E) granskning för repetition. Resultatet är ett validerat manus med `transcript.json` och förvärmda TTS-klipp. Har `prewarmAudio` och tydlig separation från playout. Det är exakt rätt arkitekturmönster för en MC som undviker påhitt och tjat.

**Begränsning:** knutet till Plex, Liquidsoap, Icecast och Chatterbox; systemd i package-skript och inga relevanta Windows-implementationer granskat. **Ingen LICENSE-fil hittad i repo-roten** – behandla källkoden som **inte fri att kopiera**, trots att repo är publikt. Inspirationsmönster kan implementeras självständigt.

## Donator 3: SUB/WAVE — djupast agent-/röstlogik, tyngst runtime

Repo: https://github.com/perminder-klair/subwave (branch develop)
Inspekterat: `controller/src/broadcast/dj-agent/shortlist-pick.ts`, `pick-context.ts`, `controller/src/audio/tts-fallback.ts`, `piper.ts`, `kokoro.ts`, `controller/src/llm/internal/prompts/recent-speech.ts`, `controller/src/llm/internal/tools/picker/tools/tracks-by-energy.ts`, `controller/src/music/cue-landing.ts`, `package.json`.

**Faktisk kod:**
- DJ väljer mellan en **redan byggd kandidatlista** av kända spår-ID:n; modellen ansvarar för musikaliskt motiv, inte upptäckt eller opålitliga artistnamn. Bra arkitektur för Maestro.
- `shortlistClauseSelectionReason` lägger in titel och artist från vald biblioteksrad i stället för från LLM-output. Stärker attribution och motverkar hallucinationer.
- `recent-speech.ts` sparar gamla yttranden som negativt minne så MC inte upprepar sig.
- `tts-fallback.ts` bygger flera fallbacksteg och skiljer persona-, provider- och stationsfallback.
- `piper.ts`: självständig lokal ONNX-röst via ett subprocess-anrop, modell + .onnx.json, genererar WAV.
- `kokoro.ts`: långlivad Python-worker med JSONL över stdio, readiness-timeout, crash-/timeout-recovery, eller delad lokal server. Mer omfattande än vi behöver i v1.
- `cue-landing.ts`: codec-specifika synkproblem och verkliga Liquidsoap/ffmpeg-kompensationer; helt annan motor än Musikes HTMLAudioElement.
- MIT enligt repo-package/license. Observera att vissa *tillval* marknadsför betal-/cloud-API; licens/funktion är inte samma sak som kostnadsfri runtime.

**Beslut:** portera inte Navidrome/Icecast/Liquidsoap/Docker-miljön. Kopiera högst isolerade MIT-tillåtna delar med licensnotis; föredra självständig adapter kring Musikes befintliga bibliotek.

## Donator 4: Mixxx — tekniskt mest moget, fel form för direkt integration

Repo: https://github.com/mixxxdj/mixxx
Inspekterat: `src/library/autodj/autodjprocessor.cpp`, `src/engine/enginetalkoverducking.cpp`, `src/engine/enginexfader.cpp`, `LICENSE`.

**Faktisk kod:** C++/Qt AutoDJ är en explicit tillståndsmaskin med två deck, cue-in/out, transitionsläge, kontroll för ljudslut, crossfader. Talkover är en sidechain-compressor med justerbar duck strength, sample-rate-anpassning, Auto/Manual/Off. Crossfadern har valbar kurva och kalibrering av upplevd nivå.

**Licens:** huvudprogrammet GPL-2.0-or-later enligt LICENSE. Att kopiera C++-implementeringen in i Musike kan medföra GPL-krav för den distribuerade produkten; kräver separat licensbeslut. Den stora Qt/engine-koden är dessutom olämplig för Android-WebView och den befintliga React/Web Audio-frontendens struktur. **Ta designprinciperna och skriv en egen enklare Web Audio-adapter**, inte Mixxx-koden.

## Extra teknikspår: PulseGrid

Repo: https://github.com/ysy-ym/pulsegrid (MIT)
Inspekterat: `digital-mixer/analysis-worker.js`, `pitch-processor.js`, `transition-policy.mjs` och `transition-policy.test.mjs`.
En browser Worker tar ut waveform-peaks, uppskattar BPM via autocorrelation, harmonisk key med Goertzel och energi. AudioWorklet har en ringbuffert för pitch-ratio; policy skyddar mot för korta övergångar och kräver lyssningsbekräftelse vid vissa utfall. Intressant som **senare experimentell donor**, men inte som bevis att det är en tillförlitlig BPM/tonartsanalys. För långsiktig precision krävs benchmark mot kända referensspår, mobilprestandatest och stabil beatgridding.

## Svenskt tal (viktig korrigering)

Piper listar svenska `sv_SE` röster i sitt officiella röstindex: https://github.com/rhasspy/piper/blob/master/VOICES.md
Lokal ny svensk Kokoro-fintuning finns: https://github.com/joakimeriksson/kokoro-voice-server (12 svenska röster enligt projektet). Rösterna och licensvillkor för respektive modell ska verifieras separat före distribution. Bas-Kokoro har inte generellt inbyggd full svenska. Starta med Piper sv_SE eftersom den är lokal, deterministisk och passar en lättviktig Windows-implementation.

## Rekommenderad integrationsordning

1. **MC v0 utan generativ AI**: Musikes verkliga titel/artist/album + få, verifierade fakta från metadataindex; låg frekvens (t.ex. av/var 3:e/var 6:e låt), svensk Piper-cache. Inget internetkrav för spelning. Tal ska vara helt opt-in.
2. **Separat röstbus och smidig ducking** i Web Audio, inspirerat av AI Radio men med robust generations-ID, avbrutna övergångar, egen musik-/röstvolym och `try/finally` som återställer musiken. Lägg aldrig ett syntesfel på kritisk spelväg.
3. **Research-first producer** enligt Radio Clyde: sparade fakta med URL, säkerhetsgrad och upptäcktsdatum; manus skrivs endast på faktaunderlag; cache per spår och språk; dedupe av redan uttalade fakta.
4. **Smart shortlist** enligt SUB/WAVE: Musikes `maestroDJ` rankar en kandidatpool; eventuell lokal LLM får endast välja bland kända ID:n, inte hitta på låtar. Behåll deterministisk fallback.
5. **Crossfade/beatmatching senare**: först tvådeck-stabilitet, crossfade som inte förstör nuvarande playback; BPM/key/cues efter metadata- och benchmarks. Mixxx som designreferens och PulseGrid som testspecifikation.

## Kritiska acceptanskriterier före kodning i spelaren

- Befintligt Windows- och Android-ljud samt lokal och YouTube-fallback påverkas inte i standardläget.
- Tal avstängt innebär inga röstprocesser/modelldownloads och ingen extra RAM-kostnad i idle.
- Ingen radiopratare när användaren skippar, pausar, startar ett telefonsamtal eller när en röst-/ljudfil misslyckas.
- Ingen LLM får hitta på genrer/BPM eller låtfakta.
- Inga ljudspeglingar, dubbeluppspelning, överlappande MC-klipp eller race mellan två låtskiften.
- Testa mot riktiga musikfiler på Windows och Android; mät RAM och CPU separat.
- Attributions-/licenskontroll innan kod från annan repo läggs i Musike.

**Status:** Källkod läst och arkitektur analyserad. Ingen extern donatorkod importerad; ingen MC-/crossfade-funktion implementerad i denna granskning.
