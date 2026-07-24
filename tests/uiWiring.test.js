import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(
  new URL('../src/app/ProjectReportingApp.jsx', import.meta.url),
  'utf8'
);
const ka1PerformanceSource = readFileSync(
  new URL('../src/app/Ka02View.jsx', import.meta.url),
  'utf8'
);
const paymentCalendarsSource = readFileSync(
  new URL('../src/app/PaymentCalendarsPanel.jsx', import.meta.url),
  'utf8'
);
const projectSwitcherSource = readFileSync(
  new URL('../src/components/ProjectSwitcher.jsx', import.meta.url),
  'utf8'
);
const projectsSource = readFileSync(
  new URL('../src/config/projects.js', import.meta.url),
  'utf8'
);
const configSource = readFileSync(
  new URL('../src/config/projectConfig.js', import.meta.url),
  'utf8'
);
const reportingSource = readFileSync(
  new URL('../src/app/ReportingView.jsx', import.meta.url),
  'utf8'
);

test('formulář výkonů KA1 používá existující stav ukládání', () => {
  assert.doesNotMatch(appSource, /isSaving=\{saving\}/);
  assert.match(appSource, /<Ka02View[\s\S]*?isSaving=\{isSaving\}/);
});

test('uložení výkonu KA1 předává backendu vybrané činnosti a přesnou délku', () => {
  assert.match(appSource, /activity_codes_json: JSON\.stringify\(payload\.activityCodes \|\| \[\]\)/);
  assert.match(appSource, /duration_minutes: payload\.durationMinutes \|\| ''/);
});

test('pomalé exportní knihovny se načítají až při skutečném exportu', () => {
  assert.doesNotMatch(appSource, /^import jsPDF/m);
  assert.doesNotMatch(appSource, /^import html2canvas/m);
  assert.match(appSource, /import\('html2canvas'\)/);
  assert.match(appSource, /import\('jspdf'\)/);
});

test('klientský registr používá rychlou relační mezipaměť', () => {
  assert.match(appSource, /window\.sessionStorage\.getItem\(clientCacheKey\)/);
  assert.match(appSource, /window\.sessionStorage\.setItem\(clientCacheKey/);
  assert.match(appSource, /setIsLoadingClients\(cachedClients\.length === 0\)/);
});

test('kontrola ISIR bezpečně opakuje dočasné chyby brány', () => {
  assert.match(appSource, /verifyProjectInsolvencies/);
  assert.match(appSource, /\[502, 503, 504\]\.includes\(response\.status\)/);
  assert.match(appSource, /const maxAttempts = isRetrySafeAction \? 3 : 1/);
});

test('exporty klientské podpory zahrnují pouze KA1', () => {
  assert.match(appSource, /\['KA1', 'KA01'\]\.includes\(normalizedKa\)/);
  assert.match(appSource, /record\.payload\?\.caseManagementMode/);
  assert.doesNotMatch(appSource, /'Podpora KA2'/);
  assert.match(reportingSource, /Klienti a podpora KA1 do IS ESF/);
  assert.match(reportingSource, /Stáhnout zápisy podpory KA1/);
  assert.doesNotMatch(reportingSource, /label: 'KA2'/);
  assert.match(reportingSource, /\.xlsx/);
  assert.match(reportingSource, /\.docx/);
  assert.match(appSource, /\/api\/export-table-xlsx/);
  assert.match(appSource, /sections/);
});

test('KA1 performance form is bundled with the main React runtime', () => {
  assert.match(appSource, /import Ka02View from '\.\/Ka02View\.jsx';/);
  assert.doesNotMatch(appSource, /const Ka02View = React\.lazy/);
});

test('historical XLSM performances are read-only in the client timeline', () => {
  assert.match(appSource, /sourceSystem === 'LEGACY_XLSM'/);
  assert.match(appSource, /Historický XLSM · pouze čtení/);
  assert.match(appSource, /!record\.isSynthetic && !isLegacyReadOnly/);
  assert.match(appSource, /buildLegacyPerformanceSummary\(record\)/);
  assert.match(appSource, /buildLegacyPerformanceDetail\(record\)/);
  assert.match(appSource, /normalizePerformanceTime\(row\.cas_od \|\| row\.start_time\)/);
});

test('registr klientů neobsahuje zrušené ovládací prvky', () => {
  assert.doesNotMatch(appSource, /Zobraz všechny klienty/);
  assert.doesNotMatch(appSource, /label="Klíčový pracovník"/);
  assert.doesNotMatch(appSource, /label="Potřeba case managementu"/);
  assert.doesNotMatch(appSource, /label="Rodina"/);
  assert.match(appSource, /label=\{`ID \$\{formatClientShortId\(client\)\}`\}/);
});

test('výkon KA1 nabízí AI návrh s kontrolou klientské osy', () => {
  assert.match(appSource, /onGenerateAiNote=\{generateKa1PerformanceNote\}/);
  assert.match(ka1PerformanceSource, /Vygenerovat návrh/);
  assert.match(ka1PerformanceSource, /Kontrola návrhu proti klientské ose/);
  assert.match(ka1PerformanceSource, /Gemini 2\.5 Flash/);
});

test('přehled klienta v KA1 přepíná výkony a splátkové kalendáře', () => {
  assert.match(ka1PerformanceSource, /Poslední výkony/);
  assert.match(ka1PerformanceSource, /Splátkové kalendáře/);
  assert.match(ka1PerformanceSource, /<PaymentCalendarsPanel/);
  assert.match(paymentCalendarsSource, /Přidat kalendář/);
  assert.match(paymentCalendarsSource, /record\.entityType === 'payment_plan'/);
  assert.match(appSource, /fetchAction\('listPaymentPlans'\)/);
  assert.match(appSource, /action: 'savePaymentPlan'/);
  assert.match(ka1PerformanceSource, /useState\('payment-plans'\)/);
  assert.match(paymentCalendarsSource, /Smazat kalendář/);
  assert.match(appSource, /Ano, smazat/);
  assert.match(appSource, /pendingDeleteRecord/);
  assert.match(paymentCalendarsSource, /setTimeout\(\s*\(\) => persistQueuedStatuses\(record\),\s*650/);
  assert.match(appSource, /action = 'deletePaymentPlan'/);
  assert.match(appSource, /<Ka02View[\s\S]*?onDeleteRecord=\{deleteRecord\}/);
});

test('lokální osiřelý splátkový kalendář lze odstranit i po chybě backendu nenalezeno', () => {
  assert.match(appSource, /isStaleLocalPaymentPlan/);
  assert.match(appSource, /nebyl nalezen\|not found/);
  assert.match(appSource, /if \(!isStaleLocalPaymentPlan\) throw error/);
});

test('poslední výkony zobrazují význam, ne pouze kódy činností', () => {
  assert.match(ka1PerformanceSource, /KA1_ACTIVITY_TITLE_BY_CODE/);
  assert.match(ka1PerformanceSource, /preview\.activityTitles\.join/);
  assert.match(ka1PerformanceSource, /payload\.caseNote/);
  assert.match(ka1PerformanceSource, /record\.documentText/);
  assert.match(ka1PerformanceSource, /formatDuration\(record\.payload\.durationMinutes\)/);
  assert.match(ka1PerformanceSource, /formatActivityDate\(record\.activityDate\)/);
});

test('úprava klienta se otevírá z minikarty v modálním okně', () => {
  assert.match(appSource, /aria-label=\{`Upravit klienta \$\{client\.fullName\}`\}/);
  assert.match(appSource, /role="dialog"/);
  assert.match(appSource, /aria-labelledby="client-edit-dialog-title"/);
  assert.match(appSource, /Upravit klienta · \{selectedClient\.fullName\}/);
  assert.match(appSource, /Uložit úpravy/);
  assert.match(appSource, /\{false && \(\s*<Panel\s+title=\{selectedClient\.fullName\}/);
});

test('pravý sloupec začíná podporami a v hlavičce nechává jen jméno klienta', () => {
  assert.match(appSource, /title=\{selectedClient\.fullName\}[\s\S]*?titleClassName="!text-2xl !font-black !text-indigo-950"/);
  assert.doesNotMatch(appSource, /title="Podpory podle typu"/);
  assert.doesNotMatch(appSource, /Vybraný klient/);
  assert.doesNotMatch(appSource, /label="Položky na ose"/);
  assert.doesNotMatch(appSource, /label="Čas podpory"/);
  assert.doesNotMatch(appSource, /label="Dokumenty"/);
});

test('projekty CECH a MAS mají velký přepínač a odlišné barevné pozadí', () => {
  assert.match(projectSwitcherSource, /h-14 min-w-40/);
  assert.match(projectSwitcherSource, /text-lg font-black/);
  assert.match(appSource, /activeProject\.theme\.page \|\| viewTheme\.page/);
  assert.match(appSource, /activeProject\.theme\.header \|\| viewTheme\.header/);
  assert.match(projectsSource, /page: 'bg-\[radial-gradient\(circle_at_top_left,#eef2ff/);
  assert.match(projectsSource, /page: 'bg-\[radial-gradient\(circle_at_top_left,#ecfdf5/);
});

test('dashboard sleduje jen smluvené indikátory a projektové cíle', () => {
  assert.match(reportingSource, /Plnění indikátorů/);
  assert.match(reportingSource, /Plnění cílů/);
  assert.match(reportingSource, /Plnění indikátorů výstupů celkem v %/);
  assert.match(reportingSource, /Plnění indikátorů výsledků celkem v %/);
  assert.doesNotMatch(reportingSource, /Vzdělávání a supervize podle pozic/);
  assert.doesNotMatch(reportingSource, /Dlouhodobá podpora/);
  assert.doesNotMatch(reportingSource, /Individuální plán/);
});

test('dashboard spouští hromadnou kontrolu klientů v ISIR', () => {
  assert.match(reportingSource, /Hromadně ověřit klienty v ISIR/);
  assert.match(reportingSource, /role="status"/);
  assert.match(reportingSource, /aria-live="polite"/);
  assert.match(reportingSource, /Kontrola zatím nebyla spuštěna/);
  assert.match(appSource, /verifyProjectInsolvencies/);
  assert.match(appSource, /isVerifyingProjectInsolvencies/);
  assert.match(appSource, /zpracovávám dávku/);
  assert.match(appSource, /opakuji dávku/);
});

test('hlavní navigace obsahuje přehled AI pomůcek s pěti externími odkazy', () => {
  assert.match(configSource, /AI Pom\\u016fcky/);
  assert.match(appSource, /mainView === 'ai-tools'/);
  assert.match(appSource, /https:\/\/chranenebydleni\.onrender\.com\//);
  assert.match(appSource, /https:\/\/dokument-creator\.onrender\.com\//);
  assert.match(appSource, /https:\/\/portal-040d\.onrender\.com\/elai-payslips\.html/);
  assert.match(appSource, /https:\/\/kalkulacka1-3\.onrender\.com\//);
  assert.match(appSource, /https:\/\/mapovani\.onrender\.com\//);
  assert.match(appSource, /target="_blank"/);
});
