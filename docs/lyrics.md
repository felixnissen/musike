# Synkade låttexter i Musike

Låttextvyn läser redan befintliga, tidsstämplade **LRC-filer** från MusicGrabbers bibliotek. Den visar aktiv rad, följer uppspelningens position och låter användaren klicka på en rad för att söka i ljudet.

## Arkitektur

- `server/src/localAudio.ts` återanvänder samma verifierade spårmatchning som lokal ljuduppspelning, och läser endast en `.lrc`-sidecar **bredvid** ljudfilen. Inga godtyckliga filvägar tas emot från klienten, och symlänkar/filer utanför biblioteket avvisas.
- Desktop: `GET /api/lyrics/:youtubeId` returnerar `{format:"lrc",text,source}` för matchande inspelning och 404 annars.
- Android: `GET /v1/lyrics/:youtubeId?token=...` på den separata musikservern, över användarens privata HTTPS-förbindelse. Samma parkopplingsnyckel som används för lokal ljudstreaming krävs.
- `web/src/lib/lyrics.ts` tolkar LRC-tidsstämplar, även flera per textrad, tidsförskjutning och tomma/instrumentala rader.
- `web/src/components/LyricsView.tsx` använder spelarens faktiska `position` och `seek`. Finns inga texter visas ett neutralt tomläge. Ingen extern moln- eller betaltjänst krävs.

## Begränsningar

Det här är **radsynkade LRC-texter**, inte ord-för-ord-timing. För låtar utan lokal ljudfil eller matchande `.lrc` visas ingen synkad text. Låtuppspelningen och YouTube-reserven fungerar oberoende av texter. Android-enheten behöver fortsatt nå datorns privata musikserver för att få just dess LRC-filer.

## Verifiering

- `server/tests/lyrics.test.ts`: tidsstämplar, offset, aktiv rad, ogiltiga/överstora data.
- Isolerad server med kopia av biblioteket verifierade att en verklig MusicGrabber-LRC för låten Kryptonite gick att läsa, att saknad låt gav 404 och att bibliotekets 440 Favoriter/822 Lovely/440 Spotify gillade var oförändrade.
- Privat musikserver: 401 utan nyckel, 200 med rätt nyckel och samma text som desktop-API.
