import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClientCaseAiPrompt, filterClientCaseAiRecords } from '../src/lib/clientCaseSummary.js';

test('AI souhrn zakázky používá jen současný individuální plán a podporu KA1/KA2', () => {
  const records = [
    { id: 'plan', entityType: 'plans' },
    { id: 'support', entityType: 'consultations' },
    { id: 'entry', entityType: 'project_entry', isSynthetic: true },
    { id: 'debt', entityType: 'debt_cases' },
    { id: 'therapy', entityType: 'therapy_sessions' },
    { id: 'cv', entityType: 'cv_outputs' },
    { id: 'simulator', entityType: 'job_simulators' },
    { id: 'mentoring', entityType: 'mentoring_records' },
    { id: 'employment', entityType: 'employment_records' }
  ];

  assert.deepEqual(filterClientCaseAiRecords(records).map((record) => record.id), ['plan', 'support']);
});

test('prompt je ukotven v projektech CECH/MAS a nezmiňuje starší projektovou verzi', () => {
  const prompt = buildClientCaseAiPrompt('Aktuální podklady klienta.');

  assert.match(prompt, /CECH nebo MAS/);
  assert.doesNotMatch(prompt, /Moravském Berouně/);
  assert.doesNotMatch(prompt, /starší|jiné verze projektu/i);
  assert.match(prompt, /Aktuální podklady klienta/);
});
