import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLegacyPerformanceDetail,
  buildLegacyPerformanceSummary,
  normalizePerformanceTime
} from '../src/lib/legacyPerformancePresentation.js';

const historicalRecord = {
  sourceSystem: 'LEGACY_XLSM',
  isLegacyReadOnly: true,
  documentText: '',
  payload: {
    startTime: '1899-12-30T07:00:00.000Z',
    endTime: '1899-12-30T12:00:00.000Z',
    durationMinutes: 300,
    supportArea: 'C',
    activityCodes: ['C1', 'C3'],
    meetingForm: 'Ambulantní',
    supportSpecific: {},
    place: 'Hlinka',
    legacySource: { fileName: 'technický-zdroj.xlsm' },
    caseManagementMode: false
  }
};

test('čas z Google serial date se zobrazí jako běžný místní čas', () => {
  assert.equal(normalizePerformanceTime('1899-12-30T07:00:00.000Z'), '08:00');
  assert.equal(normalizePerformanceTime('9:05:00'), '09:05');
});

test('historický výkon má čitelný souhrn bez JSON a technických objektů', () => {
  const summary = buildLegacyPerformanceSummary(historicalRecord);
  assert.match(summary, /Ambulantní · Hlinka · 08:00–13:00 · 5 h · C1, C3/);
  assert.doesNotMatch(summary, /1899|startTime|supportSpecific|\[object Object\]|\{/);
});

test('detail historického výkonu obsahuje jen srozumitelná pole', () => {
  const detail = buildLegacyPerformanceDetail(historicalRecord);
  assert.match(detail, /Forma jednání: Ambulantní/);
  assert.match(detail, /Čas: 08:00–13:00/);
  assert.match(detail, /C1 –/);
  assert.match(detail, /C3 –/);
  assert.doesNotMatch(detail, /1899|legacySource|supportSpecific|\[object Object\]|\{/);
});
