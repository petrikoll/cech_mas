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

test('formulář výkonů KA1 používá existující stav ukládání', () => {
  assert.doesNotMatch(appSource, /isSaving=\{saving\}/);
  assert.match(appSource, /<Ka02View[\s\S]*?isSaving=\{isSaving\}/);
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

test('úprava klienta se otevírá z minikarty v modálním okně', () => {
  assert.match(appSource, /aria-label=\{`Upravit klienta \$\{client\.fullName\}`\}/);
  assert.match(appSource, /role="dialog"/);
  assert.match(appSource, /aria-labelledby="client-edit-dialog-title"/);
  assert.match(appSource, /Upravit klienta · \{selectedClient\.fullName\}/);
  assert.match(appSource, /Uložit úpravy/);
  assert.match(appSource, /\{false && \(\s*<Panel\s+title=\{selectedClient\.fullName\}/);
});

test('pravý sloupec začíná podporami a zřetelně ukazuje vybraného klienta', () => {
  assert.match(appSource, /title="Podpory podle typu"[\s\S]*?Vybraný klient[\s\S]*?\{selectedClient\.fullName\}/);
});
