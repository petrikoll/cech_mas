# Projektové výkaznictví CECH / MAS

Webová aplikace pro klientskou evidenci a výkaznictví dvou projektů dluhového
poradenství:

- **CECH** – Řešení předluženosti na severním Osoblažsku
- **MAS** – Řešení oblasti dluhové problematiky na území MAS

Aplikace vychází z osvědčeného uživatelského rozhraní MBVYKAZNICTVI, ale používá
samostatnou projektovou konfiguraci, společný katalog KA1 a povinné oddělení dat
CECH/MAS.

## Stav

Aplikace je produkčně nasazená pro projekty CECH a MAS. Google Apps Script
vynucuje `project_id`, uživatelská oprávnění, audit a ochranu proti duplicitám.

## Lokální spuštění

Požadavky: Node.js 20 nebo novější.

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

Produkční kontrola:

```powershell
npm test
npm run build
```

## Konfigurace

Citlivé hodnoty patří pouze do `.env`, který Git ignoruje. Veřejná projektová
metadata jsou v `src/config/projects.js`. Společný katalog 14 výkonů KA1 je v
`src/config/ka1Catalog.js`.

## Bezpečnost dat

- Klient se načte pouze při explicitním `project_id` `CECH` nebo `MAS`.
- Řádky `PRAC` se nepřijímají.
- Každý zápis do API obsahuje aktivní projekt a zdrojový systém.
- Zaměstnanci nemají mít přímý editační přístup k datovému Google Sheetu.
- `.gitignore` vylučuje analytické podklady, XLSM, DOCX, PDF, `.env` a lokální
  kopie klientských dat.
- Do GitHub issues, commitů a logů nepatří osobní údaje ani text klientských
  záznamů.

## Souběžný provoz

Staré XLSM mohou během pilotu zůstat v provozu. Nové výkony se však pořizují
právě v jednom systému. Agregační vrstva rozlišuje `LEGACY_XLSM` a `NEW_APP`,
spojuje je pro dashboard a kontroluje duplicity.

Podrobný návrh je v
[`docs/ARCHITEKTURA_A_MIGRACE.md`](docs/ARCHITEKTURA_A_MIGRACE.md).

## Apps Script backend

Přípravný dvouprojektový backend je v adresáři
[`apps-script`](apps-script/README.md). Obsahuje:

- projektově omezené čtení a zápis klientů,
- atomické číslování klientů,
- normalizované výkony KA1 s kódy `A1–C7`,
- uživatelská oprávnění, audit a ochranu proti dvojímu odeslání,
- bridge pro souběžný provoz starých XLSM a nové aplikace.

Backend je nasazený do samostatného Google Apps Script projektu.

## ISIR

Horní list `ISIR` provádí kontrolu po jednom klientovi přímo ze serveru
aplikace. Ukládá výsledek ověření, nalezená řízení a metadata PDF dokumentů do
datových listů `InsolvencyVerifications`, `InsolvencyCases` a
`InsolvencyDocuments`. Vybrané PDF lze archivovat do podsložky `ISIR` v
klientské složce na Google Disku. Zdrojový odkaz zůstává vždy zachovaný.
