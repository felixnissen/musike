# Musike – produktbacklog v2.0

Uppdaterad: 2026-11-22
Projekt: https://github.com/felixnissen/musike
Status: planeringsdokument. **En ej ikryssad ruta är inte implementerad.**

## Produktmål och regler

- Musikspelare för Windows och Android; lokal först, YouTube-reserv när användningen tillåts.
- Ingen obligatorisk betald AI, Docker, molndatabas eller omfattande fjärråtkomst.
- MusikGrabber och befintliga Musike-spellistor lämnas orörda vid migration; export/återställning testas först.
- Minimera RAM/CPU, särskilt vid bakgrundsanalys och på mobil. Inga synliga konsolfönster.
- Bygg en vertikal, verifierbar funktion per PR: datamodell → analys/API → gränssnitt → test → paketering.
- Läs och återanvänd befintliga radio-/shuffle-/historik-/synkimplementationer innan nya moduler införs.
- Lokala musikfiler och poddar hanteras efter användarens och källans rättigheter; inga obehöriga nedladdningar.
- Varje funktion ska fungera utan AI-komponent, om AI-analysen inte är tillgänglig.

## Befintligt (verifierat tidigare, kräver löpande regression)

- [x] Windows- och Android-appar, separata Android-testbyggen.
- [x] Lovely (822) och Spotify gillade (440) importerade; viss överlappning.
- [x] MusicGrabber-kö för unika YouTube-ID, lokalt ljud med reservkälla.
- [x] Lokal begränsad musiktjänst, TLS-LAN-brygga, kontosynk och LRC-textvy.
- [x] Grundläggande radio, Auto-Radio och shuffle finns redan i koden.
- [x] Källindikator och LRCLIB-reserv har kodats; observerad mobilfunktion behöver separat test.
- [ ] Verifierad direkt lokal ljuduppspelning i **fysisk Android** med nätverk och cache isolerade.
- [ ] Slutförd nedladdningskö inklusive manuell granskningslista över fel.

## P0 – Stabilitet och faktiskt end-to-end-test

- [ ] **MUS-001 Bevisa verklig ljudkälla.** Öppna lokal låt på telefonen; observera ”Från datorn”, separat serverlogg och HTTP 206. Stäng av Wi-Fi, verifiera korrekt byte eller tydlig status. Ingen falsk lokalindikator.
- [ ] **MUS-002 Nätverksläge.** Identifiera LAN, mobildata och offline. Uppspelning får inte hänga på en otillgänglig peer. Konto-/musiknycklar blandas inte ihop. Extern 5G-åtkomst förblir valfri och kräver separat säker tunnel.
- [ ] **MUS-003 Förlustfri synk v2.** Skapa merge-test med samma låt ändrad på två enheter, frivilliga tombstones för borttagning och återställningstest. Ingen destruktiv sync av 440/822-biblioteken.
- [ ] **MUS-004 Slutför MusicGrabber-importen.** Lägg fram slutrapport: unika, färdiga, fel, permanent otillgängliga och eventuella dubbletter. Återförsök begränsat och idempotent, inga popup-konsoler.
- [ ] **MUS-005 Ljud- och mobilregression.** Spela, pausa, spola, Bluetooth, hörlurar, låsskärm, bakgrund, omstart, offline och svagt Wi-Fi. Android/WebView och desktop testas separat.
- [ ] **MUS-006 Prestandabaslinje.** Mät starttid, RAM, CPU, batteri, nätverksförfrågningar samt stall/lagg i bibliotek på >1 000 låtar. Dokumentera före/efter.

## P1 – Visual+, kö och smakregler (första stora användarleveransen)

- [ ] **MUS-101 Waveform-indexering.** Förberäkna 200–400 peak-värden per lokal ljudfil, med durationsreferens, filfingeravtryck och analysversion. Inkrementellt vid nya nedladdningar; ingen nyanalys för oförändrade filer.
- [ ] **MUS-102 WaveformScrubber.** Klick/drag för seek, progress, buffring, tangentbordsstöd, tillgänglighet, fall tillbaka till nuvarande tidslinje utan peaks. Test på mobil och desktop.
- [ ] **MUS-103 Dynamiska omslagsfärger.** Cachelagra 2–4 färgtokens per omslag. Respektera reduced-motion, låg batterinivå och prestandaläge.
- [ ] **MUS-104 Smart Shuffle v1.** Reproducerbar seed; viktning efter senaste uppspelning, skip och artistspacing. Ingen omedelbar repetition när alternativ finns. Knapp för vanlig shuffle.
- [ ] **MUS-105 Smakregler.** Snooza låt i 30 dagar, ”spela mindre av detta”, exkludera spellista från rekommendationer. Synka regler och visa/återställ dem i inställningar.
- [ ] **MUS-106 Förklara kön.** Visa källa till föreslagen låt och knappar ”spela liknande härnäst”, ”inte nu”, ”behåll ordning”. Inget tyst kööverskrivande.

## P2 – Gemensam ljudanalysmotor och metadataindex

- [ ] **MUS-201 SQLite sidodatabas (föreslagen).** Inför endast metadataanalys/index; ingen ersättning av befintlig bibliotekslagring. Migrations-/rollback-test och fungerande Windows-native installerare.
- [ ] **MUS-202 Analysjobb.** Kö med återupptagning, låg prioritet, max CPU/RAM, cancel/pause, progress, felrapport, hash + analyzer_version för idempotens.
- [ ] **MUS-203 ReplayGain-värden.** Integrated LUFS, true peak, album-/track-gain och limiter-guard. *Tillämpning* kräver AudioEngine-stöd i P3.
- [ ] **MUS-204 Tempo/tonart.** BPM, meter (om möjligt), key/mode, Camelot, confidence och osäker/okänd status. Utvärdera Essentia mot verifierade låtar.
- [ ] **MUS-205 Energi och mixpunkter.** RMS, loudness-kurva, onsets, tystnad, intro/outro- och lämpliga övergångssegment. Förväxla inte amplitudpeak med ”basdrop”.
- [ ] **MUS-206 API och cachning.** `GET /api/tracks/:id/analysis`, `GET /api/tracks/:id/waveform`, `POST /api/analysis/jobs`, `GET /api/analysis/jobs/:id`. Säkra LAN-endpoints separata och behörighetsstyrda.

## P3 – DJ och ljudbehandling

- [ ] **MUS-301 AudioEngine v2.** En sammanhållen uppspelningsmotor med dubbla buffers/spelare, state machine, preloading, seek och fallback för källa utan CORS-kompatibel ljudbehandling. Mät minne.
- [ ] **MUS-302 Gapless.** Låtar utan onödig paus, gapless metadata/encoder padding om tillgängligt. Ingen artificiell crossfade för vanliga album som default.
- [ ] **MUS-303 Crossfade.** 0=av, 1–12 s, equal-power eller kontrollerad volymkurva, aldrig två oönskade samtidiga strömmar efter skip/seek.
- [ ] **MUS-304 EQ.** 5-band först med pre-sets, neutral bypass, gain-staging mot clipping; exponerade inställningar per enhet.
- [ ] **MUS-305 Volymnormalisering.** ReplayGain/LUFS vid uppspelning med peak-skydd; fallback när metadata saknas.
- [ ] **MUS-306 Auto-DJ/harmonisk mix.** Camelot-kompatibilitet, BPM-temposkillnad, confidence och intro/outro, explicit sätt att stänga av och visa vald övergång.
- [ ] **MUS-307 Ljudplattformstest.** Testa Web Audio CORS, Android WebView/Media, YouTube-reserv och offline-lokal playback; fallback när EQ/mix ej stöds.

## P4 – Personliga rekommendationer

- [ ] **MUS-401 Förbättra befintlig Auto-Radio.** Rankning med artist/genre/tempo/energi, undvik snoozade/exkluderade/recently played; behåll köstruktur.
- [ ] **MUS-402 Vibe Lock.** Lås stämning från aktuellt spår och justera likhet kontra variation med ett reglage.
- [ ] **MUS-403 ”Spela 10 liknande”.** Förklarbar sortering, 10 närmaste relevanta låtar från tillgängliga katalogen; inga upprepningar.
- [ ] **MUS-404 Prompt-spellistor.** Regelbaserad första version med genre, tempo, energi, tid på dygnet och textfilter. Sparbar och redigerbar spellista; ingen obligatorisk molnmodell.
- [ ] **MUS-405 Embeddings valfritt.** Benchmarka CLAP/Essentia-feature-vektorer mot metadata-only ranking. Kör batchvis lokalt på Windows; förhindra tung inferens på telefonen.
- [ ] **MUS-406 Återupptäck.** Personligt ”glömda favoriter”, smakhistorik och slumpkontroller; välj bort spår utan tillräcklig historik.

## P5 – Poddar och talat innehåll som egen modul

- [ ] **MUS-501 RSS-feeds.** Säker feedhämtning med ETag/Last-Modified, GUID-dedup och feedhantering. Blockera SSRF och privata destinationsadresser i backend.
- [ ] **MUS-502 Avsnitt, cache och kvoter.** Lokalt nedladdade avsnitt med lagringsgräns, rensning och upphovsrättsmässigt korrekt användning.
- [ ] **MUS-503 Resume/chapters.** Position i millisekunder, progress över enheter, kapitel, paus/seek, uppspelningshastighet 1–2×.
- [ ] **MUS-504 Sömntimer.** 5–120 minuter, slutet av kapitel/avsnitt och mjuk fade-out. Avbrytbar.
- [ ] **MUS-505 Recaps.** Sammanfatta endast tillgängliga transkriptioner (lokal transkribering vid behov); källkopplade recap och tidsstämplar, utan påhittad sammanfattning.

## Datamodell – förslag, ej skapade tabeller

- `audio_analysis(track_id, file_hash, analyzer_version, bpm, key, mode, camelot, confidence, energy, lufs, true_peak, updated_at)`
- `waveforms(track_id, file_hash, peak_count, peaks_blob, duration, analyzed_at)`
- `analysis_jobs(id, track_id, job_type, status, progress, error, attempts, created_at, updated_at)`
- `play_events(id, track_id, played_at, seconds_played, completed, skipped, source, device_id)`
- `taste_rules(id, track_id, rule, weight, expires_at, device_id, updated_at)`
- `playlist_preferences(playlist_id, exclude_from_radio, mood_tags_json)`
- `track_embeddings(track_id, model_version, dimension, vector_blob)`
- `mix_transitions(from_id, to_id, score, cue_out, cue_in, fade_seconds, analyzer_version)`
- `podcast_feeds(id, rss_url, title, etag, last_checked_at)`
- `podcast_episodes(id, feed_id, guid, enclosure_url, duration_ms, position_ms, chapters_json, recap, updated_at)`

**Notera:** befintlig Musike-bibliotekshistorik och synk är redan implementerad på andra sätt; migration till `play_events` kräver uttryckligt dubbelräkningstest och synkstrategi.

## Definition of Done – gäller alla kryssrutor

1. Implementerad i nuvarande repo, inte bara i en plan.
2. Enhetstester + integration mot verklig katalog, inklusive fel/offline.
3. Windows och Android testas där funktionen berör båda, eller uttrycklig dokumenterad begränsning.
4. RAM/CPU/batteri jämförs där relevant.
5. Befintliga Lovely/Spotify-gillade + Favoriter är oförändrade och rollback testad.
6. Commit pushad till `main`, installerbar artefakt verifierad om relevant.
7. Funktionen dokumenterad och användarens synliga upplevelse verifierad innan [x] sätts.

## Första arbetspaketet

**Sprint A:** MUS-001, MUS-004, MUS-101, MUS-102, MUS-103, MUS-104 och MUS-105.
**Sprint B:** MUS-201–206 (ljud-DNA och metadatalager).
**Sprint C:** MUS-301–307 (DJ-motor).
**Sprint D:** MUS-401–406 (rekommendationer).
**Sprint E:** MUS-501–505 (poddar).

Börja inte nästa stora subsystem förrän föregående har testad end-to-end-kedja. Små oberoende förbättringar kan parallelliseras utan att störa MusicGrabber.
