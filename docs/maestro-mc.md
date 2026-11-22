# Maestro MC v0 — svensk radiopratare

**Avgränsning:** Endast MC med inställbar frekvens. Inga BPM-mixar, musikdatabasförändringar, generativa påhitt, nya tjänster eller molnnycklar.

## Aktivera

1. Öppna **Hem → Maestro DJ → Svensk MC**.
2. Välj **Tyst** (standard), **Var 3:e låt**, **Var 5:e låt** eller **Var 8:e låt**.
3. Klicka **Prova rösten** om en lokal svenskspråkig systemröst hittas.
4. Starta något av Maestro DJ:s lägen. Endast låtar som *verkligen börjar spelas* räknas. Vid varje N:e spelad låt får du en kort presentation över musiken.

Inställningen sparas lokalt under `musike:maestro-mc:v1`. Övrig uppspelning och vanliga spellistor lämnas orörda.

## Ljud och integritet

- Använder **enhetens lokala svenska systemröst** genom Web Speech API `speechSynthesis` med `localService === true`. Saknas en svensk lokal röst blir MC tyst. Musiken fortsätter som vanligt.
- Inga röster laddas ner automatiskt, ingen TTS-text skickas till egen eller extern server och inga extra bakgrundsprocesser hålls igång.
- Pratar deterministiskt endast utifrån katalogens riktiga titel och artist: *Nu spelar vi [titel], med [artist].* Inga okända genre-/artistfakta hittas på.
- Vid röststart sänks aktivt musikmedium till 28 % av spelarens inställda volym. Efter röstslut, röstfel, låtbyte, paus eller sökning återställs aktuell inställd volym och mute-state.
- Endast aktiva **Maestro DJ-sessioner** får MC-presentationer. `Tyst` är förvald inställning.
- Röstrutinen är skyddad av generationstoken för att förhindra sena röstcallbacks från att påverka nästa låt. Ett fel i röstfunktionen stoppar inte musiken.

## Tekniska ändringar

- `web/src/lib/maestroMC.ts`: inställning, ren frekvenspolicy, lokal svensk röstidentifiering, avbrytning, ducking, provlyssning.
- `web/src/player/player.ts`: MC kopplad till verkliga `playing`-händelser, återställning på byte/paus/sökning, spelarmute/volym integrerade i ducking.
- `web/src/components/MaestroDJ.tsx`: kontrollpanel med frekvensknappar, röstprov och statusmeddelanden på svenska/engelska/portugisiska.
- `server/tests/maestroMC.test.ts`: tester av policy, tyst standard, persistens och faktabaserat manus.

## Begränsningar

- Telefonens/Windows-installationens WebView måste exponera svenska **lokala** systemröster via Web Speech API. På Windows finns enligt systemets röstregister minst `MSTTS_V110_svSE_Bengt`, men enskild Electron-runtime behöver separat UI-lyssningstest. På Android är röster och bakgrundsbeteende enhetsspecifika.
- Detta är en enkel lokal MC med en färdig fras, inte en AI som skapar faktagranskade radiomanus eller variationsrika presentationer. Det är nästa separata funktion, inte del av denna fokuserade leverans.
- Volym-sänkningen sker via befintligt media-element, inte en full Web Audio mixer. Inga två musikdeck eller beatmatching har byggts.
- Tester bekräftar TypeScript och algoritmer; de bevisar **inte** fysiskt hörbart svenskt tal på användarens telefon utan ett faktiskt ljudprov.
