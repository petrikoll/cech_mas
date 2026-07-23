import test from 'node:test';
import assert from 'node:assert/strict';
import { KA1_ACTIVITIES, KA1_PHASES } from '../src/config/ka1Catalog.js';
import { PROJECT_LIST, getProject, normalizeProjectId } from '../src/config/projects.js';

test('konfigurace obsahuje právě projekty CECH a MAS', () => {
  assert.deepEqual(PROJECT_LIST.map((project) => project.id), ['CECH', 'MAS']);
  assert.equal(normalizeProjectId(' cech '), 'CECH');
  assert.equal(normalizeProjectId('PRAC'), '');
  assert.equal(getProject('MAS').registrationNumber, 'CZ.03.02.01/00/25_084/0006297');
});

test('katalog KA1 obsahuje tři fáze a čtrnáct činností', () => {
  assert.equal(KA1_PHASES.length, 3);
  assert.equal(KA1_ACTIVITIES.length, 14);
  assert.equal(new Set(KA1_ACTIVITIES.map((activity) => activity.code)).size, 14);
});
