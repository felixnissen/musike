# Musike – prioriterad arbetslista
Uppdaterad: 2026-11-22. Status ska alltid baseras på verifiering, inte avsikt.

## P0 – färdigställ befintligt innan ny funktionalitet
- [ ] **REL-01 Nya släpp: korrekta resultat.** Status: kodad delvis, inte releasad. Fixa MusicBrainz-matchning, paginering (inte bara första 100 släpp), flera release-datum och ofullständiga poster. Sök alla 658 artister i begränsade batchar utan att kräva manuella tryck. Visa sökta/matchade/felaktiga och faktiska träffar. Verifiera mot kända aktuella släpp.
- [ ] **REL-02 Bakgrundsuppdatering.** Status: ej byggd. Daglig körning på PC, återuppta efter offline, inkrementell cache och senaste lyckade körning. Mobilen läser synkat resultat utan 658 direktanrop.
- [ ] **REL-03 Artister och bevakningar synkas.** Status: endast lokal Android-lagring. Gemensam bevakningslista PC/mobil, dubblettskydd, möjlighet att välja artister.
- [ ] **PLAY-01 Lokala ljudkällor först.** Status: server lokalt verifierad, mobilanslutning inte verifierad. Spela lokal fil på mobilen > PC-strömning > YouTube fallback. Visa faktisk källa och begriplig orsak till fallback. Verifiera med nedladdade låtar på PC och Android.
- [ ] **QA-01 Versionskedjan.** Status: Android APK 10506 byggd, men release-fixen ovan ännu inte byggd. Typecheck, web build, Android build, install/update, källa och UI-smoketest; sedan Windows EXE. Spara commit och release med testbevis.

## P1 – personlig Musike
- [ ] **STAT-01 Riktig lyssningslogg.** Spela upp/pause/seek/avslut, undvik dubbelräkning och för korta lyssningar; lokal först, synka med PC. Verifiera på kända lyssningssessioner.
- [ ] **STAT-02 Statistikvy.** Toppartister/låtar/genrer, lyssningstid och trend per dag/vecka/månad. Ingen påhittad historik; markera när mätningen började.
- [ ] **UPD-01 Uppdateringsinkorg.** Nya släpp, bevakade artister, läst/oläst, spara/spela, inga dubletter; länk från profil och en liten startsidessektion.
- [ ] **DISC-01 Personliga upptäckter.** 5–10 förslag med tydlig anledning, exkludera redan sparade låtar, feedback 'gillar/inte nu'. Metadata från kataloger först, dyr analys endast när nödvändigt.
- [ ] **HOME-01 Kompakt startsida.** Fortsätt lyssna, Nytt för dig, Upptäck. Max 4–6 objekt/sektion, 'Visa alla'. Inga Spotify-liknande ändlösa rader.

## P2 – polish
- [ ] **HOME-02 Anpassningsbar ordning.** Dölj/visa och flytta sektioner, spara per användare; sortering i bibliotek (senast tillagda/mest spelade m.m.).
- [ ] **PROFILE-01 Liten profilmeny.** Statistik, Uppdateringar, Historik, Inställningar. Inga sociala konton, meddelanden eller premiumflöden.
- [ ] **WRAP-01 Musike Wrapped året runt.** Bygger på verifierad STAT-01-data, utan påhittad retroaktiv statistik.
- [ ] **DJ-01 DJ/MC förbättring.** Helt frivillig; bättre svenska/engelska röster, hörbarhet/ducking, träffsäkra genre- och stämningsval. Inte blockera kärnspelaren.

## Definition av färdigt
Varje punkt kräver: kod i rätt repo/branch, automatisk kontroll, relevant test på Windows/Android, verifierat faktiskt beteende, commit/release och notering om kvarstående begränsningar. Märk annars som planerad, kodad, testad eller blockerad.
