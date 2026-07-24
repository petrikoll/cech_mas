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

Další povinné Script Properties pro klientskou dokumentaci:

- `CECH_CLIENT_ROOT_FOLDER_ID` a `MAS_CLIENT_ROOT_FOLDER_ID` – cílové kořenové
  složky klientů jednotlivých projektů,
- `MONITORING_LIST_TEMPLATE_ID` – šablona `Sablona ML.xlsm`,
- `CECH_CONTRACT_TEMPLATE_ID`, `MAS_CONTRACT_TEMPLATE_ID` – projektové
  šablony smlouvy,
- `CECH_CONSENT_TEMPLATE_ID`, `MAS_CONSENT_TEMPLATE_ID` – projektové
  šablony souhlasu se zpracováním osobních údajů.

## První nastavení

1. Vytvořit samostatný Apps Script projekt.
2. Nahrát soubory `.gs` a manifest `appsscript.json`.
3. V Project Settings nastavit Script Properties podle
   `script-properties.example.json`.
4. Spustit ručně `initializeBackend()`.
5. Spustit `bootstrapInitialUsers()`, který založí aktivní přístupy do obou
   projektů pro pracovníky aplikace:

   ```javascript
   bootstrapInitialUsers();
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

## Historické klientské výkony

`syncLegacyPerformances` načítá jednotlivé výkony přímo z klientských XLSM ve
složce určené Script Property `LEGACY_CLIENT_ROOT_FOLDER_ID`. Import:

- páruje soubor s klientem podle globálního `client_number` v `ClientIndex`,
- vynechá klienty mimo projekty CECH/MAS,
- načte datum, čas od–do, místo, formu, vybrané činnosti a zápis,
- uloží stabilní ID zdrojového souboru, listu a slotu,
- je idempotentní a při opakování nevytvoří duplikáty,
- označí záznam `source_system=LEGACY_XLSM`,
- ponechá historické výkony v aplikaci pouze pro čtení.

Neúplné sloty bez data, platného času nebo činnosti se nezapíší a zůstanou
uvedené v listu `LegacyImportCache` jako stav `PARTIAL`.

## Klientské složky a dokumentace

Akce `ensureClientFolder` založí nebo doplní klientskou složku pod kořenem
správného projektu. Vytvoří tři pracovní podsložky a z projektových šablon
zkopíruje `Monitorovaci_list.xlsm`, `SMLOUVA.docx` a `SOUHLAS.docx`.
Akce je idempotentní: při opakování použije existující složku a soubory.
Starý klientský XLSM se již nevytváří, protože výkony se zapisují přímo
aplikací.

## Splátkové kalendáře

Akce `listPaymentPlans` a `savePaymentPlan` ukládají kalendáře do samostatného
listu `PaymentPlans` v aplikačním datovém sešitu. Každý záznam je navázán na
`project_id` a `client_id`, takže jeden klient může mít více dluhů a data
projektů CECH a MAS se nemíchají. Průběh jednotlivých měsíců se ukládá jako
`PAID` nebo `MISSED`; neoznačený měsíc zůstává bez výsledku. Kalendáře jsou
technická evidence a nezvyšují počet ani čas klientských výkonů.
