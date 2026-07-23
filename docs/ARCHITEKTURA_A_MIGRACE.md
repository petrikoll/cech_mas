# Architektura a migrace výkaznictví CECH / MAS

## 1. Cíl aplikace

Aplikace nahradí přímé zapisování zaměstnanců do Google Sheetu a klientských
souborů XLSM. Jedno uživatelské rozhraní bude obsluhovat dva samostatné projekty:

- `CECH` – Řešení předluženosti na severním Osoblažsku
- `MAS` – Řešení oblasti dluhové problematiky na území MAS

Oba projekty používají stejnou strukturu klientské práce, indikátorů a KA1.
Klienti, výkony, dosažené hodnoty a dokumenty však musejí zůstat vždy přiřazené
právě jednomu projektu.

Základem uživatelského rozhraní bude aplikace MBVYKAZNICTVI: evidence klientů,
detail klienta, přidávání výkonů, přehledy a administrace. Samostatně nasazené
pomůcky mohou být dostupné v hlavní navigaci jako odkazy.

## 2. Autoritativní zdroj klientů

Autoritativním zdrojem je Google Sheet `Noví klienti`, list `Vstupní data`.
Soubor `HLAVNÍ TABULKA.xlsm` je pouze historický podklad a nesmí přepisovat
přesnější údaje ze Sheetu.

### Pravidlo příslušnosti k projektu

Rozhodující je výhradně hodnota ve sloupci A `PROJEKT`:

- `CECH` patří do projektu CECH,
- `MAS` patří do projektu MAS,
- `PRAC` nepatří ani do CECH, ani do MAS a nesmí se do nové aplikace migrovat,
- prázdná nebo jiná hodnota není platný klient CECH/MAS.

Sloupec W `PRAC PROJEKT` je doplňková informace. Hodnota `Ano` v tomto sloupci
sama o sobě klienta z CECH nebo MAS nevylučuje.

### Ověřený stav při analýze

- 35 klientů CECH
- 22 klientů MAS
- 6 klientů PRAC, kteří se nemigrují
- obsazená historická klientská čísla 7–69
- první volné klientské číslo bylo 70

Číslo 70 je zjištěný stav zdroje v době analýzy, nikoli trvale zakódovaná
konstanta. Při vytvoření klienta se další číslo určí atomicky na serveru.

## 3. Identita klienta a číslování

Kvůli návaznosti na statistiky, složky a existující dokumentaci se zachová jedno
společné historické číslování klientů napříč CECH a MAS.

Každý klient bude mít:

- `client_id` – interní stabilní UUID, které se nikdy nemění,
- `client_number` – veřejné číselné označení navazující na stávající řadu,
- `project_id` – povinně `CECH` nebo `MAS`,
- osobní a monitorovací údaje,
- stav klienta a datum vstupu/výstupu.

Složka klienta bude nadále pojmenována:

`{client_number}_{Jméno} {Příjmení}`

Číslo se nesmí odvozovat z nejvyšší hodnoty ve sloupci V, protože v původním
Sheetu jsou čísla předvyplněna i v prázdných řádcích. Backend použije samostatný
číselník a `LockService`, aby dva současné zápisy nemohly získat stejné číslo.

## 4. Oddělení projektů v uživatelském rozhraní

V hlavičce aplikace bude trvale viditelný přepínač aktivního projektu `CECH /
MAS`. Aktivní projekt ovlivní:

- seznam a vyhledávání klientů,
- vytvoření klienta,
- detail klienta,
- zápis výkonu,
- klientské dokumenty,
- statistiky, indikátory a cíle,
- exporty.

Projekt nebude automaticky určován podle spádového města. Některá území se v
původních seznamech překrývají, proto se projekt při založení klienta zvolí
výslovně a potom se uloží jako povinná součást klienta.

Při rozpracovaném formuláři aplikace nedovolí změnit projekt bez upozornění.
Běžný zaměstnanec neuvidí smíšený seznam klientů. Souhrn obou projektů bude
dostupný pouze v reportingu pro oprávněné role.

## 5. Navržené datové tabulky

### `Clients`

- `client_id`
- `client_number`
- `project_id`
- `first_name`
- `last_name`
- `birth_date`
- `street`
- `house_number`
- `city`
- `postal_code`
- `catchment_city`
- `email_or_databox`
- `phone`
- `gender`
- `employment_status`
- `education`
- `disadvantage`
- `entry_date`
- `exit_date`
- `exit_situation`
- `insolvency`
- `payment_schedule`
- `status`
- `folder_id`
- `created_at`, `created_by`
- `updated_at`, `updated_by`

### `Performances`

Jeden řádek představuje jedno jednání nebo jednu vykázanou klientskou práci.

- `performance_id`
- `project_id`
- `client_id`
- `phase_code`
- `activity_codes` – jedna nebo více označených činností
- `meeting_form`
- `date`
- `place`
- `start_time`
- `end_time`
- `duration_minutes`
- `case_note`
- `worker_id`
- `worker_confirmation`
- `client_confirmation`
- `status` – koncept / uzavřeno / stornováno
- `created_at`, `created_by`
- `updated_at`, `updated_by`

Délka se počítá z času začátku a konce. Server znovu ověří, že výkon, klient a
aktivní projekt mají shodné `project_id`.

### Další tabulky

- `Users` – role a oprávnění k projektům
- `ProjectConfig` – názvy, registrační čísla, příjemci a období projektů
- `ActivityCatalog` – společný katalog fází a činností KA1
- `Documents` – vygenerované dokumenty, verze, odkaz na Drive
- `AuditLog` – kdo a kdy vytvořil nebo změnil citlivý záznam
- `Counters` – bezpečný číselník klientů

Tabulky mohou být fyzicky v jednom Google Spreadsheetu, ale každý projektový
záznam musí obsahovat `project_id`. Všechny backendové dotazy budou projektově
omezené.

## 6. Struktura výkonů KA1

Katalog je společný pro oba projekty a vychází ze stávajících klientských XLSM.

### KA1.1 Jednání se zájemcem o službu

1. Seznámení s nabídkou služby
2. Základní anamnéza a ověření příslušnosti k cílové skupině
3. Uzavření smlouvy a souhlasu s monitoringem
4. První stabilizační kroky

### KA1.2 Mapování závazků a příčin předlužení

1. Systematické mapování závazků
2. Zpracování přehledu dluhů
3. Analýza příčin předlužení

### KA1.3 Hledání, příprava a realizace řešení

1. Vyhodnocení nejvhodnějšího řešení
2. Vyjednání splátkových kalendářů
3. Příprava a podání oddlužení
4. Jiná řešení dluhové situace
5. Řešení zaměstnání, srážek ze mzdy a zvýšení příjmu
6. Bezpečná digitální komunikace a právní gramotnost
7. Právní poradenství

Formulář výkonu nemá kopírovat omezený počet bloků z XLSM. Počet záznamů bude
neomezený a každý výkon bude samostatný řádek.

## 7. Založení klienta, složka a dokumentace

Po potvrzení nového klienta backend v jedné řízené operaci:

1. ověří povinné údaje a oprávnění uživatele k projektu,
2. přidělí další klientské číslo,
3. zapíše klienta do autoritativní tabulky,
4. vytvoří klientskou složku ve správné projektové nadřazené složce,
5. vytvoří dokumenty z šablon odpovídajících projektu,
6. uloží odkazy na složku a dokumenty ke klientovi,
7. zapíše událost do auditu.

Při dílčím selhání se uživateli zobrazí konkrétní stav a možnost bezpečného
dokončení. Opakované spuštění nesmí vytvořit druhé klientské číslo ani duplicitní
složku.

### Dokumentové šablony

Pro každý projekt existuje vlastní:

- smlouva o účasti,
- souhlas se zpracováním osobních údajů.

Šablony nemají Word formulářová pole ani content controls. Generátor proto musí
vždy vytvořit kopii správné šablony a cíleně doplnit určené části textu. Nesmí
měnit právní znění, záhlaví ani projektové údaje.

Doplňovaná klientská pole:

- jméno a příjmení,
- datum narození,
- adresa,
- u souhlasu volba telefonu/e-mailu, pokud ji formulář vyžaduje,
- datum a místo podpisu, pokud je uživatel zadá.

Projektové údaje budou uloženy v `ProjectConfig`, nikoli roztroušené v kódu.
Monitorovací údaje se budou generovat z evidence klienta; klientský XLSM se pro
zapisování výkonů již nevytváří.

## 8. Backend a bezpečnost

Google Apps Script API bude jediná vrstva, která zapisuje do Sheetu a na Drive.
Zaměstnanci nepotřebují přímý přístup k datovým tabulkám.

Backend musí:

- ověřit identitu a roli uživatele,
- na každém požadavku ověřit oprávnění k `project_id`,
- nepřijmout projekt pouze na základě hodnoty poslané prohlížečem,
- ověřit vztah klient–projekt před uložením výkonu,
- používat `LockService` pro číselník a souběžné zápisy,
- zabránit duplicitnímu odeslání stejného formuláře,
- validovat datum, čas, délku a povinná pole,
- zapisovat auditní stopu,
- vracet pouze data aktivního projektu,
- pracovat v časové zóně `Europe/Prague`,
- ukládat datumy v jednoznačném ISO formátu.

V rozhraní se citlivé osobní a dluhové údaje zobrazují jen rolím, které je
potřebují. Logy nesmějí obsahovat celé osobní údaje ani text klientských zápisů.

## 9. Migrační postup

### 9.1 Souběžný provoz starého a nového systému

Starý a nový systém budou po přechodnou dobu fungovat současně. Souběh však
nesmí znamenat, že zaměstnanec zapíše stejný výkon do obou systémů.

Přechodné uspořádání:

- starý systém bude nadále načítat existující klientské XLSM,
- nová aplikace bude ukládat nové záznamy do tabulky `Performances`,
- společná transformační vrstva spojí staré i nové výkony pro dashboard,
- každý výkon ponese `source_system` s hodnotou `LEGACY_XLSM` nebo `NEW_APP`,
- importované staré záznamy budou navíc identifikovány zdrojovým souborem a
  jednoznačným otiskem záznamu,
- dashboard a indikátory odstraní duplicity podle stabilního identifikátoru nebo
  kontrolního otisku.

Klientský registr zůstane pro oba systémy společný. Nová aplikace bude nové
klienty zapisovat do stejné autoritativní evidence a zachová číslování i
pojmenování složek, takže je starý systém dokáže rozpoznat.

Pro každého klienta nebo pracovníka bude v pilotním období určeno, ve kterém
systému pořizuje nové výkony. Jeden konkrétní výkon se nikdy nezapisuje zároveň
do XLSM i do nové aplikace. Staré záznamy mohou být v nové aplikaci zobrazeny
jen pro čtení.

Po dobu souběhu se bude pravidelně kontrolovat:

- počet klientů podle projektu a zdrojového systému,
- počet a délka výkonů,
- četnosti všech 14 aktivit,
- projektové součty CECH a MAS,
- duplicity a záznamy bez jednoznačného klienta.

Teprve až součty za dohodnuté kontrolní období souhlasí, přestane se ve starých
XLSM pořizovat nová práce. Historické soubory zůstanou archivované a dostupné
pro kontrolu.

### 9.2 Vlastní migrace

1. Zálohovat zdrojové Sheety a ověřit hlavičky.
2. Načíst pouze řádky s A=`CECH` nebo A=`MAS`.
3. Řádky A=`PRAC` explicitně vyřadit a uvést v migračním protokolu.
4. Zachovat historické `client_number`; nově vytvořit interní `client_id`.
5. Ověřit duplicity podle klientského čísla a kombinace identity.
6. Převést klientské výkony z existujících XLSM do tabulky `Performances`.
7. Namapovat 14 původních příznaků aktivit na katalog KA1.
8. Porovnat součty hodin a četnosti aktivit s dosavadním dashboardem.
9. Spustit testovací provoz zvlášť pro CECH a MAS.
10. Teprve po odsouhlasení výsledků znepřístupnit zaměstnancům přímé editace
    zdrojových tabulek.

Migrace nesmí opravovat osobní údaje podle starého `HLAVNÍ TABULKA.xlsm`.
Případné rozpory se reportují; výchozí hodnotou zůstává autoritativní Sheet.

## 10. Kontrolní scénáře před nasazením

- Klient CECH se nikdy neobjeví v seznamu MAS a opačně.
- Klient PRAC se neobjeví ani v jednom projektu.
- Současné založení dvou klientů vytvoří dvě různá čísla.
- Výkon nelze uložit klientovi jiného projektu.
- Přepnutí projektu neztratí bez upozornění rozpracovaný formulář.
- Opakované odeslání nevytvoří duplikát výkonu nebo složky.
- Smlouva a souhlas vždy použijí správnou projektovou šablonu.
- Hodiny a 14 aktivit souhlasí s kontrolním vzorkem původního XLSM.
- Statistiky CECH a MAS jsou oddělené; společný souhrn je pouze administrativní.
- Běžný zaměstnanec může pracovat bez přístupu k Google Sheetu.

## 11. Rozhodnutí potřebná před ostrým nasazením

Pro samotnou implementaci lze začít bez nich, před produkčním spuštěním je však
nutné potvrdit:

- cílové nadřazené Drive složky pro CECH a MAS,
- seznam uživatelů a jejich oprávnění k projektům,
- zda se monitorovací list generuje jako Google dokument, XLSX nebo PDF,
- které stávající Render aplikace budou v hlavní navigaci,
- zda se původní klientské výkony migrují všechny, nebo jen aktivní klienti.
