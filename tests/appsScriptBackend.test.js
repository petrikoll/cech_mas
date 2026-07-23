import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sourceFiles = [
  'Config.gs',
  'Security.gs',
  'Repository.gs',
  'Clients.gs',
  'Performances.gs',
  'LegacyPerformanceImport.gs',
  'LegacyBridge.gs',
  'Main.gs',
  'Setup.gs'
];

const source = sourceFiles
  .map((file) => readFileSync(new URL(`../apps-script/${file}`, import.meta.url), 'utf8'))
  .join('\n\n');

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
  findNextClientNumberFromRows_,
  aggregateNewPerformances_,
  durationToMinutes_,
  minutesToDurationText_,
  normalizeLegacyTime_,
  legacyPhaseForSheetName_,
  parseLegacyActivityCode_,
  buildLegacyPerformanceStableId_
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

test('Apps Script zdroje neobsahují pevně vložené Google ID ani token', () => {
  assert.doesNotMatch(source, /['"]1[A-Za-z0-9_-]{20,}['"]/);
  assert.doesNotMatch(source, /API_TOKEN\s*:\s*['"][^'"]+['"]/);
});
