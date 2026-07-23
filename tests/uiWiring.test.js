import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(
  new URL('../src/app/ProjectReportingApp.jsx', import.meta.url),
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
});
