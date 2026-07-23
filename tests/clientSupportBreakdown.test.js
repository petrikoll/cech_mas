import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeneratorRecord, getClientSupportBreakdown } from '../src/lib/projectUtils.js';

test('souhrn podpory respektuje zadanou délku individuálního plánu', () => {
  const plan = buildGeneratorRecord({
    client: { id: 'client-1', fullName: 'Testovací klient' },
    generatorDraft: {
      selectedKey: 'plan',
      date: '2026-07-22',
      worker: 'Sociální pracovník',
      planDurationMinutes: '150'
    },
    generatedText: 'Text individuálního plánu.'
  });

  assert.equal(plan.payload.durationMinutes, 150);
  assert.equal(getClientSupportBreakdown('client-1', [plan]).totalMinutes, 150);
});

test('celkový čas se sčítá v minutách bez zaokrouhlování po kategoriích', () => {
  const summary = getClientSupportBreakdown('client-1', [
    { id: 'plan', clientId: 'client-1', entityType: 'plans', payload: { durationMinutes: 60 } },
    { id: 'support', clientId: 'client-1', entityType: 'consultations', payload: { durationMinutes: 20 } }
  ]);

  assert.equal(summary.totalMinutes, 80);
  assert.equal(summary.totalHours, 80 / 60);
});

test('technické záznamy se nepočítají jako podpora klienta', () => {
  const summary = getClientSupportBreakdown('client-1', [
    { id: 'support', clientId: 'client-1', entityType: 'consultations', payload: { durationMinutes: 60 } },
    { id: 'folder', clientId: 'client-1', entityType: 'client_folder_bundle', payload: {} }
  ]);

  assert.equal(summary.totalCount, 1);
  assert.equal(summary.byType.reduce((sum, item) => sum + item.count, 0), 1);
});

test('starší plán bez uložené délky má zpětně kompatibilní výchozí hodinu', () => {
  const summary = getClientSupportBreakdown('client-1', [
    { id: 'old-plan', clientId: 'client-1', entityType: 'plans', payload: {} }
  ]);

  assert.equal(summary.totalMinutes, 60);
});
