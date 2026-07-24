import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KA1_NOTE_AI_MODEL,
  KA1_NOTE_SYSTEM_PROMPT,
  buildKa1NoteUserPrompt,
  buildKa1TimelineContext,
  validateKa1NoteAiResult
} from '../src/lib/ka1NoteAi.js';

test('KA1 AI používá požadovaný model a metodická pravidla E.L.A.I.', () => {
  assert.equal(KA1_NOTE_AI_MODEL, 'gemini-2.5-flash');
  assert.match(KA1_NOTE_SYSTEM_PROMPT, /třetí osobě/i);
  assert.match(KA1_NOTE_SYSTEM_PROMPT, /tvrzení klienta/i);
  assert.match(KA1_NOTE_SYSTEM_PROMPT, /oddlužení/i);
  assert.match(KA1_NOTE_SYSTEM_PROMPT, /předchozí klientské osy/i);
});

test('kontext klientské osy je chronologický a omezený na zvoleného klienta', () => {
  const records = [
    { id: 'x', clientId: 'other', activityDate: '2026-01-01', documentText: 'Cizí klient' },
    { id: '2', clientId: 'client-11', activityDate: '2026-03-09', ka: 'KA1', entityType: 'consultations', documentText: 'Druhý zápis' },
    { id: '1', clientId: 'client-11', activityDate: '2026-03-03', ka: 'KA1', entityType: 'consultations', documentText: 'První zápis' }
  ];

  const context = buildKa1TimelineContext(records, 'client-11');
  assert.ok(context.indexOf('První zápis') < context.indexOf('Druhý zápis'));
  assert.doesNotMatch(context, /Cizí klient/);
  assert.doesNotMatch(context, /client-11/);
});

test('uživatelský prompt obsahuje aktuální výkon i předchozí osu', () => {
  const prompt = buildKa1NoteUserPrompt({
    clientId: 'client-11',
    draft: {
      date: '2026-03-10',
      phaseCode: 'C',
      activityCodes: ['C1', 'C3'],
      meetingForm: 'Ambulantní',
      place: 'Hlinka',
      startTime: '07:00',
      endTime: '12:00',
      caseNote: 'Pracovní poznámka.'
    },
    phase: {
      code: 'C',
      title: 'Hledání, příprava a realizace řešení',
      activities: [
        { code: 'C1', title: 'Vyhodnocení nejvhodnějšího řešení' },
        { code: 'C3', title: 'Příprava a podání oddlužení' }
      ]
    },
    records: [
      { clientId: 'client-11', activityDate: '2026-03-09', ka: 'KA1', entityType: 'consultations', documentText: 'Předchozí mapování.' }
    ]
  });

  assert.match(prompt, /C1 – Vyhodnocení nejvhodnějšího řešení/);
  assert.match(prompt, /Pracovní poznámka/);
  assert.match(prompt, /Předchozí mapování/);
  assert.match(prompt, /chronologicky/i);
});

test('validace AI výsledku zachová návrh a nejvýše tři kontrolní položky', () => {
  const result = validateKa1NoteAiResult({
    formatted_output: 'Pracovník s klientem projednal doloženou situaci a domluvili další postup.',
    quality_check: ['1', '2', '3', '4'],
    recommendations: ['A'],
    missing_information: [],
    language_suggestions: []
  });

  assert.equal(result.qualityCheck.length, 3);
  assert.equal(result.recommendations[0], 'A');
  assert.match(result.formattedOutput, /Pracovník/);
});
