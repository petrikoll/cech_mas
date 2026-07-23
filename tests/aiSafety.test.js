import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAiJson, redactClientIdentifiers, sanitizeAiInput, validatePlanOutput, validateRecordOutput } from '../src/lib/aiSafety.js';

test('sanitizace odstraní identifikátory', () => assert.deepEqual(sanitizeAiInput({ fullName: 'Jan Novák', datumNarozeni: '1980-01-01', supportArea: 'bydlení' }), { supportArea: 'bydlení' }));
test('redakce odstraní jméno v poznámce', () => assert.equal(redactClientIdentifiers('Jednal Jan Novák.', { fullName: 'Jan Novák' }), 'Jednal [identifikační údaj odstraněn].'));
test('parser přijme JSON v kódovém bloku', () => assert.equal(parseAiJson('```json\n{"recordText":"text"}\n```').recordText, 'text'));
test('zápis ponechá uzamčený typ podpory z formuláře i při odlišné AI hodnotě', () => {
  const output = validateRecordOutput({ consultationType: 'Depistáž', recordText: 'Dostatečně dlouhý text zápisu.' }, { consultationType: 'Doprovod klienta' });
  assert.match(output.warnings.join(' '), /ponech/);
});
test('zápis nesmí obsahovat jméno', () => assert.throws(() => validateRecordOutput({ consultationType: 'Depistáž', recordText: 'Podpora klienta Jan Novák byla provedena.' }, { consultationType: 'Depistáž', client: { fullName: 'Jan Novák' } }), /osobní údaj/));
test('IP zachová počet cílů', () => assert.throws(() => validatePlanOutput({ goals: [] }, { goals: [{ goalId: 'g1', deadline: '' }] }), /počet/));
test('IP zachová goalId', () => assert.throws(() => validatePlanOutput({ goals: [{ goalId: 'g2', deadline: '' }] }, { goals: [{ goalId: 'g1', deadline: '' }] }), /identifikátor/));
test('IP zachová termín', () => assert.throws(() => validatePlanOutput({ goals: [{ goalId: 'g1', deadline: '2027-01-01' }] }, { goals: [{ goalId: 'g1', deadline: '2026-01-01' }] }), /termín/));
test('validní rozpracovaný IP projde', () => { const source = { goals: [{ goalId: 'g1', goalDescription: 'Práce', actionSteps: 'CV', deadline: '2026-01-01' }], finalEvaluation: '' }; const output = { goals: [{ goalId: 'g1', goalDescription: 'Získat vhodné zaměstnání odpovídající možnostem klienta.', actionSteps: 'Aktualizovat životopis a aktivně vyhledávat vhodné pracovní nabídky.', deadline: '2026-01-01' }], finalEvaluation: '' }; assert.equal(validatePlanOutput(output, source), output); });
test('prázdný zápis je odmítnut', () => assert.throws(() => validateRecordOutput({ consultationType: 'Depistáž', recordText: '' }, { consultationType: 'Depistáž' }), /krátký/));
