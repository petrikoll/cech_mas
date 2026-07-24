import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadWhitelist,
  validateGeminiLegalResult,
  validateLegalPayload
} from '../elaiHelperService.js';

test('E.L.A.I. právní poradce vyžaduje původní povinné whitelist zdroje', () => {
  const whitelist = loadWhitelist();
  const requiredSources = [...whitelist.alwaysOn];
  assert.ok(requiredSources.length > 0);
  assert.ok(whitelist.sourceMap.size >= requiredSources.length);

  const basePayload = {
    question: 'Jak postupovat při oddlužení?',
    context: '',
    outputType: 'structured_answer',
    depth: 'balanced',
    promptBlueprint: { modelInstruction: ['Použij jen povolené zdroje.'] }
  };

  assert.equal(
    validateLegalPayload({ ...basePayload, sources: requiredSources }, whitelist).ok,
    true
  );
  assert.equal(
    validateLegalPayload({ ...basePayload, sources: requiredSources.slice(1) }, whitelist).ok,
    false
  );
});

test('E.L.A.I. právní poradce odmítne citaci mimo zvolený whitelist', () => {
  const whitelist = loadWhitelist();
  const selectedSources = [...whitelist.alwaysOn]
    .map((id) => whitelist.sourceMap.get(id))
    .filter(Boolean);
  const result = {
    odpoved: 'Odpověď.',
    pravniOpora: [{
      zakon: selectedSources[0].nazev,
      paragraf: '§ 1',
      citace: 'Relevantní právní opora.'
    }],
    miraJistoty: 0.8,
    chybejiciVstupy: []
  };

  assert.equal(validateGeminiLegalResult(result, selectedSources).ok, true);
  assert.equal(validateGeminiLegalResult({
    ...result,
    pravniOpora: [{ zakon: 'Neznámý zdroj', paragraf: '§ 1', citace: 'Text.' }]
  }, selectedSources).ok, false);
});
