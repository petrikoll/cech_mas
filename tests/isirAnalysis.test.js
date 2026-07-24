import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIsirPdfUrl,
  parseGeminiJson,
  parseGeminiText
} from '../isirAnalysis.js';
import {
  CASE_STUDY_ANALYSIS_PROMPT,
  CASE_STUDY_FINAL_PROMPT
} from '../isirPrompts.js';

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

test('ISIR AI používá původní dvoukrokovou logiku kazuistiky a Gemini 2.5 Flash', () => {
  assert.match(CASE_STUDY_ANALYSIS_PROMPT, /1\. krok zpracování kazuistiky/);
  assert.match(CASE_STUDY_ANALYSIS_PROMPT, /STRUKTUROVANÁ DATA Z FORMULÁŘOVÝCH PDF/);
  assert.match(CASE_STUDY_FINAL_PROMPT, /2\. krok zpracování/);
  assert.match(CASE_STUDY_FINAL_PROMPT, /\[\[SECTION:current:Aktuální stav a co řešit\]\]/);
  assert.match(CASE_STUDY_FINAL_PROMPT, /\[\[SECTION:history:Vývoj řízení\]\]/);
  assert.match(CASE_STUDY_FINAL_PROMPT, /6 000 znaků/);
  assert.equal(parseGeminiText({
    candidates: [{ content: { parts: [{ text: '[[SECTION:current:Aktuální stav a co řešit]]\\nStav nyní:\\nProbíhá.' }] } }]
  }), '[[SECTION:current:Aktuální stav a co řešit]]\\nStav nyní:\\nProbíhá.');
});
