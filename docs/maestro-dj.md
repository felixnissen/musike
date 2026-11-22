# Maestro DJ – situationsbaserade lägen (första fungerande versionen)

Status 2026-11-22: **Kodad och automatisk testad**. Windows och Android-paketering samt fysisk Android-provlyssning redovisas separat. Inga externa AI-, BPM- eller genretjänster krävs.

## Vad som faktiskt byggts

- En **Maestro DJ**-sektion högst upp på Musikes startsida på både Windows och Android.
- Fem valbara lägen: **Party**, **Chill**, **Skriksjunga**, **Nattkörning** och **Mitt läge**.
- Varje läge kan kopplas till **en eller flera av användarens befintliga spellistor**. Det är den tydliga, säkra signalen om vilken musik användaren vill ha i läget. Låtlistorna redigeras **inte**.
- Om ett läge ännu saknar matchande spellistor använder DJ:n befintliga favoriter, historik och spellistor. Detta är ett *generellt biblioteksläge*, inte en påhittad genre- eller energianalys. Appen informerar om detta.
- Reglaget **favoriter och igenkänning ↔ mer upptäckter** styr viktningen i urvalet.
- I det valda läget viktas **riktigt uppmätt lyssningsfrekvens och tidiga manuella skips**. Mode-specifika händelser börjar byggas upp först när DJ:n används. Historiska spelningar som saknar tidsstämplar eller läge fabriceras inte.
- De närmaste ~50 låtarna väljs från lägets låtpool, sedan återanvänds **Smart Shuffle** för artistavstånd och recency.
- När kön tar slut kompletterar Maestro i samma läge med **nya låtar från poolen**, inte generisk YouTube-radio. När läget är uttömt stannar spelaren utan att loopa samma få låtar.
- En vanlig uppspelning via spellista lämnar Maestro-sessionen och återgår till tidigare standardbeteende.
- Inställningarna sparas lokalt per enhet med små JSON-objekt i localStorage. Ingen databasändring eller överföring av biblioteket.

## Vad denna version inte påstår

- Ingen automatisk analys av **genre, BPM, tonart, refräng, energi eller emotionella egenskaper**. Låtobjekten har i dagsläget artist/titel/album, men saknar robust genretagg. Det krävs senare ljudanalys och/eller verifierbar metadata.
- Ingen talande MC, text-till-tal, AI-genererade övergångar, beatmatching, crossfade eller extra musiknedladdning.
- Mode-specifik statistik är än så länge **enhetslokal**, inte kontosynkad. Detta förbättras senare utan att bryta befintlig data.
- En verifierad slutstatus kräver manuell provlyssning i **fysisk Android-app**.

## Filer

- `web/src/lib/maestroDJ.ts` – lägen, användarval, events och viktat urval.
- `web/src/components/MaestroDJ.tsx` – startsidans reglage och startknapp.
- `web/src/views/Home.tsx` – monterad komponent.
- `web/src/player/player.ts` – återanvänder befintliga spelar-API, loggar spelningar/skips och fortsätter i rätt läge.
- `server/tests/maestroDJ.test.ts` – urval, dubbletter, determinism, separata lägen, tomt bibliotek och lägesspecifik smak.

## Nästa förbättringar inom Maestro, **inte** del av denna leverans

1. Genretaggar i indexet och automatisk genreassociation baserad på verifierad metadata.
2. Ljudprofil (tempo, energi, tonart och lämpliga cue-punkter).
3. Synkroniserade smakpreferenser och valfri MC med lokalt svenskt tal.
