# Smart Shuffle (MUS-104)

Smart Shuffle är ett **tillägg till befintlig shuffle**, inte en ny spelare eller ny server. Standardläget när man aktiverar shuffle är `Smart Shuffle`. I Inställningar → **Slumpvis uppspelning** kan man växla mellan **Smart Shuffle** och **Klassisk**.

## Beteende

- Aktuellt spår fortsätter spela när shuffle slås på. En pågående låt avbryts inte när shuffle-strategi ändras.
- Smart Shuffle prioriterar låtar som inte hörts nyligen, sprider ut artister med ett rullande artistfönster och viktar ned nyligen överhoppade spår.
- En tidig **manuell** Nästa-tryckning efter 3 sekunder men innan 45 % av låten / 45 sekunder registrerar en svag negativ signal. Automatisk uppspelning av nästa låt räknas **inte** som skip.
- Algoritmen använder en injicerbar seed för reproducerbara tester. Den är fortfarande slumpmässig i normal uppspelning.
- **Inget spår eller spellisteobjekt tas bort.** Constraints är mjuka: en spellista med bara en artist går fortfarande att spela.
- Klassisk återanvänder befintlig Fisher–Yates-shuffle. Att växla mellan lägena ändrar bara kommande låtar i kön, inte aktuell låt.
- Händelser hålls i `localStorage` under `musike:smart-shuffle-history:v1`, max 600 stycken och högst 180 dagar. Ingen ny databas, extra kontokoppling, internetförfrågan eller serverprocess.
- Befintlig senaste-60-historik används som extra signal. Den äldre historiken saknar tidsstämplar; tidsstämplarna i loggen byggs upp i och med denna uppgradering.

## Teknik

- `web/src/lib/smartShuffle.ts` — algoritm och liten play-/skip-logg.
- `web/src/player/player.ts` — befintliga `playList`, `toggleShuffle` och `next`, `setShuffleMode`, persistens.
- `web/src/components/SettingsDialog.tsx` — Smart/Klassisk-reglage.
- `server/tests/smartShuffle.test.ts` — seeded output, inget tappat spår, artistavstånd, färsk historik, skippade spår, dubbletter, liten/ensidig spellista.

## Begränsningar / kvarstående verifiering

- Spelhistoriken i den nya viktningen är **lokal per enhet**, inte ännu en del av kontosynk.
- Den här versionen är köordningsbaserad och gör inte BPM-, tonarts- eller ljudanalys; det ligger i separata roadmap-punkter.
- Manuell Android- och Windows-interaktion, köåterställning samt regressionskontroll i fysisk Android krävs före fullständig DoD enligt ROADMAP.
