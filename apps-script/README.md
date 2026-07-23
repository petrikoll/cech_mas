# Apps Script backend CECH / MAS

Backend je navržen jako samostatný Google Apps Script Web App. Zdrojové kódy
neobsahují ID Google souborů, složek, šablon ani API token. Tyto hodnoty patří do
Apps Script `Script Properties`.

## Datové zdroje

- `CLIENT_REGISTRY_SPREADSHEET_ID` – autoritativní klientský registr, list
  `Vstupní data`
- `DATA_SPREADSHEET_ID` – nový aplikační datový sešit; pokud není nastaven,
  funkce `initializeBackend()` ho vytvoří
- `LEGACY_STATS_SPREADSHEET_ID` – stará statistická sestava s listem
  `Klientská Data`

## První nastavení

1. Vytvořit samostatný Apps Script projekt.
2. Nahrát soubory `.gs` a manifest `appsscript.json`.
3. V Project Settings nastavit Script Properties podle
   `script-properties.example.json`.
4. Spustit ručně `initializeBackend()`.
5. Spustit `addOrUpdateUser()` alespoň pro jednoho administrátora, například:

   ```javascript
   addOrUpdateUser(
     'Odborný garant',
     'Odborný garant',
     'ADMIN',
     'CECH,MAS',
     true
   );
   ```

6. Spustit `authorizeBackendResources()`.
7. Nasadit jako Web App a URL uložit na Renderu jako
   `GOOGLE_APPS_SCRIPT_URL`.
8. Stejný `API_TOKEN` uložit na Renderu jako `GOOGLE_APPS_SCRIPT_TOKEN`.

API token patří pouze do Apps Script Properties a serverových proměnných
Renderu. Nesmí být ve `VITE_*` proměnné ani ve frontendu.

## Bezpečné výchozí chování

- Platné projekty jsou pouze `CECH` a `MAS`.
- Každý citlivý požadavek vyžaduje API token, `actor_id` a oprávnění uživatele.
- Uživatel musí mít aktivní oprávnění právě k požadovanému projektu.
- Projekt klienta ani výkonu nelze změnit.
- Nové číslo klienta vzniká pod `ScriptLock`.
- Výkon se ukládá s idempotency klíčem a duplicitní odeslání se neuloží podruhé.
- Mazání výkonu je měkké (`CANCELLED`) a zůstává v auditu.
- Audit neukládá jméno klienta ani text klientského zápisu.

## Paralelní provoz

`rebuildLegacyBridge` vytváří v novém datovém sešitu list
`Bridge_Klientská_Data`. Ten:

- zachová prvních 25 sloupců starého listu,
- přičte nové výkony z aplikace,
- přidá zdrojový systém, interní `Client ID` a stav mapování,
- nikdy nepáruje klienta jen podle čísla nebo názvu XLSM,
- používá explicitní mapování nebo jednoznačnou shodu
  projekt + jméno + příjmení + datum narození.

Starý list `Klientská Data` se nepřepisuje. Přepnutí dashboardu na bridge se
provede až po kontrolním porovnání součtů.

## Zatím nezapojené kroky

Vytváření Drive složek a doplňování smluv/souhlasů bude přidáno po potvrzení
cílových složek, šablon a požadovaného výstupního formátu monitorovacího listu.
