import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sourceFiles = [
  'Config.gs',
  'Security.gs',
  'Repository.gs',
  'Clients.gs',
  'ClientDocuments.gs',
  'InsolvencyVerification.gs',
  'PaymentPlans.gs',
  'Performances.gs',
  'LegacyClientMapping.gs',
  'LegacyPerformanceImport.gs',
  'LegacyBridge.gs',
  'Main.gs',
  'Setup.gs'
];

const source = sourceFiles
  .map((file) => readFileSync(new URL(`../apps-script/${file}`, import.meta.url), 'utf8'))
  .join('\n\n');
const insolvencyVerificationSource = readFileSync(
  new URL('../apps-script/InsolvencyVerification.gs', import.meta.url),
  'utf8'
);

const context = vm.createContext({
  console,
  Utilities: {
    formatDate: (date) => new Date(date).toISOString().slice(0, 10),
    getUuid: () => 'test-uuid',
    computeDigest: () => Array.from({ length: 32 }, (_, index) => index + 1),
    DigestAlgorithm: { SHA_256: 'SHA_256' }
  }
});

vm.runInContext(`${source}
this.__backendTest = {
  normalizeProjectId_,
  requireProjectId_,
  normalizeActivityCodes_,
  calculateDurationMinutes_,
  buildLegacyMatchKey_,
  buildGlobalClientIdentityKey_,
  buildGlobalPerformanceDuplicateKey_,
  findNextClientNumberFromRows_,
  aggregateNewPerformances_,
  durationToMinutes_,
  minutesToDurationText_,
  normalizeLegacyTime_,
  normalizeLegacyDateValue_,
  legacyPhaseForSheetName_,
  parseLegacyActivityCode_,
  scanLegacyActivityAndNote_,
  buildLegacyPerformanceStableId_,
  buildLegacyIdentityKey_,
  resolveLegacyIdentityCandidate_,
  buildClientFolderName_,
  addClientDocumentLinks_,
  normalizePaymentMonth_,
  addPaymentMonths_,
  buildPaymentSchedule_,
  normalizeLegacyPaymentBirthDate_,
  isIsirEntryOnOrAfter_
};`, context);

const backend = context.__backendTest;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('backend přijme pouze projekty CECH a MAS', () => {
  assert.equal(backend.normalizeProjectId_(' cech '), 'CECH');
  assert.equal(backend.normalizeProjectId_('MAS'), 'MAS');
  assert.equal(backend.normalizeProjectId_('PRAC'), '');
  assert.throws(() => backend.requireProjectId_('PRAC'), /Neplatný projekt/);
});

test('ISIR započte pouze vstup do insolvence od 1. 3. 2026', () => {
  assert.equal(backend.isIsirEntryOnOrAfter_('2026-03-01T00:00:00', '2026-03-01'), true);
  assert.equal(backend.isIsirEntryOnOrAfter_('2026-02-28', '2026-03-01'), false);
  assert.equal(backend.isIsirEntryOnOrAfter_('', '2026-03-01'), false);
});

test('automatické ověření ISIR dodržuje denní stáří a bezpečnou velikost dávky', () => {
  assert.match(insolvencyVerificationSource, /ISIR_DAILY_BATCH_SIZE = 40/);
  assert.match(insolvencyVerificationSource, /ISIR_REVERIFY_AFTER_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(insolvencyVerificationSource, /ISIR_REQUEST_DELAY_MS = 1300/);
  assert.match(insolvencyVerificationSource, /everyHours\(1\)/);
  assert.match(insolvencyVerificationSource, /scheduledDailyInsolvencyVerification/);
  assert.match(insolvencyVerificationSource, /verifyProjectInsolvenciesBatch_/);
  assert.match(insolvencyVerificationSource, /nextOffset/);
});

test('číslování vychází pouze z obsazených klientských řádků', () => {
  const rows = [
    ['CECH', 'Jan', 'Novák', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 68, ''],
    ['PRAC', 'Eva', 'Nová', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 69, 'Ano'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 70, '']
  ];
  assert.equal(backend.findNextClientNumberFromRows_(rows), 70);
});

test('výkon přijme více činností jen v rámci jedné fáze', () => {
  assert.deepEqual(plain(backend.normalizeActivityCodes_(['A2', 'A1', 'A2'])), ['A1', 'A2']);
  assert.throws(() => backend.normalizeActivityCodes_(['A1', 'B1']), /jedné fáze/);
  assert.throws(() => backend.normalizeActivityCodes_(['D1']), /Neplatný kód/);
});

test('délka výkonu se počítá na serveru a odmítá převrácený čas', () => {
  assert.equal(backend.calculateDurationMinutes_('09:15', '10:45', ''), 90);
  assert.equal(backend.calculateDurationMinutes_('', '', 75), 75);
  assert.throws(() => backend.calculateDurationMinutes_('11:00', '10:00', ''), /později/);
});

test('legacy mapovací klíč je projektový a odolný vůči mezerám a diakritice', () => {
  const first = backend.buildLegacyMatchKey_('CECH', ' Jiří ', 'Šmíd', '1988-01-20');
  const second = backend.buildLegacyMatchKey_('cech', 'Jiri', 'Smid ', '20.1.1988');
  const otherProject = backend.buildLegacyMatchKey_('MAS', 'Jiri', 'Smid', '1988-01-20');
  assert.equal(first, second);
  assert.notEqual(first, otherProject);
});

test('ochrana klientů porovnává identitu i mezi projekty', () => {
  const cech = backend.buildGlobalClientIdentityKey_(' Jiří ', 'Šmíd', '20.1.1988');
  const mas = backend.buildGlobalClientIdentityKey_('Jiri', 'Smid ', '1988-01-20');
  assert.equal(cech, mas);
});

test('ochrana výkonů rozpozná totožný zápis i v jiném projektu', () => {
  const shared = {
    date: '2026-03-20',
    start_time: '09:00',
    end_time: '10:00',
    duration_minutes: 60,
    activity_codes_json: '["C1","C3"]',
    meeting_form: 'Ambulantní',
    place: 'Hlinka',
    case_note: 'Klient doložil podklady.'
  };
  const first = backend.buildGlobalPerformanceDuplicateKey_(
    { ...shared, project_id: 'CECH', client_id: 'cech-1', worker_id: 'Sulková' },
    'jiri|smid|1988-01-20'
  );
  const second = backend.buildGlobalPerformanceDuplicateKey_(
    { ...shared, project_id: 'MAS', client_id: 'mas-9', worker_id: 'Nováková' },
    'jiri|smid|1988-01-20'
  );
  assert.equal(first, second);
});

test('bridge agreguje jen aktivní výkony z nové aplikace', () => {
  const aggregate = backend.aggregateNewPerformances_([
    {
      project_id: 'CECH',
      client_id: 'c1',
      phase_code: 'A',
      activity_codes_json: '["A1","A2"]',
      duration_minutes: 90,
      source_system: 'NEW_APP',
      status: 'ACTIVE'
    },
    {
      project_id: 'CECH',
      client_id: 'c1',
      phase_code: 'A',
      activity_codes_json: '["A1"]',
      duration_minutes: 30,
      source_system: 'LEGACY_XLSM',
      status: 'ACTIVE'
    },
    {
      project_id: 'CECH',
      client_id: 'c1',
      phase_code: 'B',
      activity_codes_json: '["B1"]',
      duration_minutes: 45,
      source_system: 'NEW_APP',
      status: 'CANCELLED'
    }
  ], 'CECH');

  assert.equal(aggregate.c1.phaseMinutes.A, 90);
  assert.equal(aggregate.c1.phaseMinutes.B, 0);
  assert.equal(aggregate.c1.activityCounts.A1, 1);
  assert.equal(aggregate.c1.activityCounts.A2, 1);
});

test('bridge převádí staré časové hodnoty beze ztráty minut', () => {
  assert.equal(backend.durationToMinutes_('3:30'), 210);
  assert.equal(backend.minutesToDurationText_(210), '3:30');
});

test('historický import rozpozná tři listy výkonů a kódy činností', () => {
  assert.equal(backend.legacyPhaseForSheetName_('Jednání se zájemcem'), 'A');
  assert.equal(backend.legacyPhaseForSheetName_('Map. závazků a příčin předluž.'), 'B');
  assert.equal(backend.legacyPhaseForSheetName_('Hledání a realizace řešení'), 'C');
  assert.equal(backend.parseLegacyActivityCode_('A', '3. Uzavření smlouvy'), 'A3');
  assert.equal(backend.parseLegacyActivityCode_('C', '7. Právní poradenství.'), 'C7');
  assert.equal(backend.parseLegacyActivityCode_('B', '7. Neplatná činnost'), '');
});

test('historický import normalizuje čas a vytváří stabilní ID slotu', () => {
  assert.equal(backend.normalizeLegacyTime_('9:05'), '09:05');
  assert.equal(backend.normalizeLegacyTime_('09:05:00'), '09:05');
  assert.equal(backend.normalizeLegacyTime_('25:00'), '');
  const first = backend.buildLegacyPerformanceStableId_('file-1', 'Jednání se zájemcem', 'B4');
  const second = backend.buildLegacyPerformanceStableId_('file-1', 'Jednání se zájemcem', 'b4');
  assert.equal(first, second);
  assert.match(first, /^LEGACY-[a-f0-9]{40}$/);
});

test('historický import rozpozná slovní zápis i bez původního popisku', () => {
  const rows = Array.from({ length: 18 }, () => Array(5).fill(''));
  rows[8][1] = '1. Vyhodnocení nejvhodnějšího řešení';
  rows[9][1] = '3. Příprava a podání oddlužení';
  rows[12][1] = 'Na základě vyhodnocení finanční situace klienta jsme přistoupili k sepsání návrhu.';
  const scanned = plain(backend.scanLegacyActivityAndNote_(rows, 3, 1, 'C'));

  assert.deepEqual(scanned.activityCodes, ['C1', 'C3']);
  assert.equal(scanned.noteRowIndex, 12);
});

test('historicky import cte datum z typovane hodnoty a ne z lokalizovaneho zobrazeni', () => {
  const rawDate = new Date(Date.UTC(2026, 2, 1));
  assert.equal(
    backend.normalizeLegacyDateValue_(rawDate, '2.2.2026', 'Etc/UTC'),
    '2026-03-02'
  );
  assert.equal(
    backend.normalizeLegacyDateValue_(46082, '2.2.2026'),
    '2026-03-02'
  );
});

test('historický import páruje klienta podle identity bez ohledu na starý projekt', () => {
  const candidate = {
    projectId: 'MAS',
    identityKey: backend.buildLegacyIdentityKey_('Renáta', 'Durčáková', '1977-04-01'),
    birthDateKey: '1977-04-01',
    clientIndex: { client_id: 'mas-18', client_number: 18, project_id: 'MAS' }
  };
  const result = backend.resolveLegacyIdentityCandidate_({
    firstName: 'Renáta',
    lastName: 'Durčáková',
    birthDate: '1977-04-01',
    sourceProjectId: 'CECH'
  }, [candidate]);
  assert.equal(result.status, 'AUTO_IDENTITY');
  assert.equal(result.clientIndex.client_id, 'mas-18');
});

test('historický import použije unikátní datum narození jako kontrolovaný fallback', () => {
  const candidate = {
    projectId: 'CECH',
    firstName: 'Zdeněk',
    identityKey: backend.buildLegacyIdentityKey_('Zdeněk', 'Bílý', '1996-03-18'),
    birthDateKey: '1996-03-18',
    clientIndex: { client_id: 'cech-23', client_number: 23, project_id: 'CECH' }
  };
  const result = backend.resolveLegacyIdentityCandidate_({
    firstName: 'Zdeněk',
    lastName: 'Bíý',
    birthDate: '1996-03-18'
  }, [candidate]);
  assert.equal(result.status, 'AUTO_BIRTH_DATE');
  assert.equal(result.clientIndex.client_id, 'cech-23');
});

test('historický import vyloučí identitu patřící do projektu PRAC', () => {
  const candidate = {
    projectId: 'PRAC',
    identityKey: backend.buildLegacyIdentityKey_('Nikol', 'Ligocká', '2002-08-31'),
    birthDateKey: '2002-08-31',
    clientIndex: null
  };
  const result = backend.resolveLegacyIdentityCandidate_({
    firstName: 'Nikol',
    lastName: 'Ligocká',
    birthDate: '2002-08-31'
  }, [candidate]);
  assert.equal(result.status, 'EXCLUDED_PRAC');
  assert.equal(result.clientIndex, undefined);
});

test('historický import nepřiřadí klienta při nejednoznačném datu narození', () => {
  const sourceIdentity = {
    firstName: 'Nejasné',
    lastName: 'Jméno',
    birthDate: '1969-01-01'
  };
  const candidates = ['c1', 'c2'].map((clientId) => ({
    projectId: 'CECH',
    identityKey: backend.buildLegacyIdentityKey_('Jiný', clientId, '1969-01-01'),
    birthDateKey: '1969-01-01',
    clientIndex: { client_id: clientId, project_id: 'CECH' }
  }));
  const result = backend.resolveLegacyIdentityCandidate_(sourceIdentity, candidates);
  assert.equal(result.status, 'AMBIGUOUS_BIRTH_DATE');
  assert.equal(result.candidate, null);
});

test('Apps Script zdroje neobsahují pevně vložené Google ID ani token', () => {
  assert.doesNotMatch(source, /['"]1[A-Za-z0-9_-]{20,}['"]/);
  assert.doesNotMatch(source, /API_TOKEN\s*:\s*['"][^'"]+['"]/);
});

test('klientská složka zachová globální číslo klienta a bezpečný název', () => {
  assert.equal(
    backend.buildClientFolderName_({
      client_number: 72,
      jmeno: 'Jan',
      prijmeni: 'Novák/Nový'
    }),
    '72_Jan Novák-Nový'
  );
});

test('klient dostane odkazy na celou projektovou dokumentaci', () => {
  const client = backend.addClientDocumentLinks_(
    { klient_id: 'client-72' },
    {
      folder_url: 'folder',
      monitoring_list_url: 'monitoring',
      contract_url: 'contract',
      consent_url: 'consent'
    }
  );
  assert.deepEqual(plain(client), {
    klient_id: 'client-72',
    drive_folder_url: 'folder',
    monitoring_list_url: 'monitoring',
    contract_url: 'contract',
    consent_url: 'consent'
  });
});

test('backend splátkových kalendářů normalizuje měsíce a sestaví harmonogram', () => {
  assert.equal(backend.normalizePaymentMonth_('04/26'), '2026-04');
  assert.equal(backend.normalizePaymentMonth_('4/2026'), '2026-04');
  assert.equal(backend.addPaymentMonths_('2026-12', 1), '2027-01');
  assert.deepEqual(
    plain(backend.buildPaymentSchedule_('04/26', 3)),
    ['2026-04', '2026-05', '2026-06']
  );
  assert.throws(() => backend.buildPaymentSchedule_('04/26', 0), /od 1 do 240/);
});

test('splátkový kalendář lze bezpečně skrýt s auditní stopou', () => {
  assert.match(source, /action === 'deletePaymentPlan'/);
  assert.match(source, /function deletePaymentPlan_/);
  assert.match(source, /status: 'DELETED'/);
  assert.match(source, /String\(row\.status \|\| ''\)\.toUpperCase\(\) !== 'DELETED'/);
  assert.match(source, /writeAudit_\(context, 'DELETE', 'PAYMENT_PLAN'/);
});

test('staré splátkové kalendáře lze idempotentně převést podle identity klienta', () => {
  assert.equal(backend.normalizeLegacyPaymentBirthDate_('6/3/1996'), '1996-06-03');
  assert.equal(backend.normalizeLegacyPaymentBirthDate_('15.10.1987'), '1987-10-15');
  assert.match(source, /function importLegacyPaymentPlans_/);
  assert.match(source, /Přehled splátkových kalendářů/);
  assert.match(source, /existingKeys\.has\(key\)/);
  assert.match(source, /LEGACY_PAYMENT_SHEET/);
  assert.match(source, /installmentStatuses\[month\] = 'PAID'/);
});

test('zakládání složky kopíruje kompletní sadu a používá projektové šablony', () => {
  assert.match(source, /'Monitorovaci_list\.xlsm'/);
  assert.match(source, /'SMLOUVA\.docx'/);
  assert.match(source, /'SOUHLAS\.docx'/);
  assert.match(source, /cechContractTemplateProperty/);
  assert.match(source, /masContractTemplateProperty/);
  assert.match(source, /cechConsentTemplateProperty/);
  assert.match(source, /masConsentTemplateProperty/);
  assert.match(source, /action === 'ensureClientFolder'/);
});
