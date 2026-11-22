# Svenska i Musike

Musike har nu tre fullständiga språkpaket: engelska (`en`), brasiliansk portugisiska (`pt-BR`) och svenska (`sv`).

- **Inställningar → Språk → Svenska** byter språk omedelbart, utan att ändra eller importera biblioteket.
- Vid **första start utan sparat språkval** används svenska om enhetens språk börjar med `sv`. Ett tidigare manuellt språkval bevaras.
- `web/src/i18n/sv.ts` följer samma typade meddelandestruktur som originalet och hanterar pluralformer och tidsangivelser.
- `server/src/i18n.ts` översätter serverfel/progress till svenska på förfrågan; ingen hårdkodad engelska krävs för vanliga fel.
- Windows-skalets välkomst-/startskärm stöder också svenska och behåller språkvalet.
- Nya hybridmusikinställningar har svenska rubriker och instruktioner när svenska är valt.
- `server/tests/swedish.test.ts` verifierar att alla nycklar finns, grundläggande svensk plural/språkväljare och servermeddelandenas variabelersättning.

**Begränsning:** Vissa nyare administrations- och nätverksfel från tredjepartsverktyg, liksom ospecificerade felsökningsmeddelanden, kan fortfarande visas på engelska. Det är inte ett fel i språkväljaren.

**Inga datamigreringar, kontoförändringar eller nya bakgrundstjänster.**
