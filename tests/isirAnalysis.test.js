import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIsirPdfUrl,
  parseGeminiJson
} from '../isirAnalysis.js';

test('ISIR AI přijme pouze oficiální PDF adresu', () => {
  assert.match(
    normalizeIsirPdfUrl('https://isir.justice.cz/isir/doc/dokument.PDF?id=123'),
    /^https:\/\/isir\.justice\.cz/
  );
  assert.throws(
    () => normalizeIsirPdfUrl('https://example.com/dokument.PDF?id=123'),
    /oficiálního ISIR/
  );
});

test('ISIR AI načte strukturovaný JSON z odpovědi Gemini', () => {
  const value = parseGeminiJson({
    candidates: [{
      content: {
        parts: [{ text: '```json\n{"status_now":"Řízení probíhá","confidence":"vysoká"}\n```' }]
      }
    }]
  });
  assert.equal(value.status_now, 'Řízení probíhá');
  assert.equal(value.confidence, 'vysoká');
});
