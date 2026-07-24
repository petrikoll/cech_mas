import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeIsirDocuments,
  currentDateInPrague,
  enforceClaimsDeadlineInCaseStudy,
  geminiRetryDelayMs,
  minimizeSummary,
  normalizeIsirPdfUrl,
  normalizedCorrections,
  parseLocalizedNumber,
  parseGeminiJson,
  parseGeminiText
} from '../isirAnalysis.js';

const mockPdfAndGeminiFetch = (geminiPayload) => async (url) => {
  if (String(url).includes('generativelanguage.googleapis.com')) {
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(geminiPayload) }] } }]
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  return new Response(Buffer.from('%PDF-1.4\nmock\n%%EOF'), {
    status: 200,
    headers: { 'content-type': 'application/pdf' }
  });
};

test('ISIR AI bezpečně převádí české formáty částek', () => {
  assert.equal(parseLocalizedNumber('1 234,50 Kč'), 1234.5);
  assert.equal(parseLocalizedNumber('1.234,50'), 1234.5);
  assert.equal(Number.isNaN(parseLocalizedNumber('neuvedeno')), true);
});
import {
  buildCaseStudyAnalysisPrompt,
  CASE_STUDY_ANALYSIS_PROMPT,
  CASE_STUDY_FINAL_PROMPT,
  getClaimsDeadlineStatus
} from '../isirPrompts.js';
import {
  CLAIM_AMOUNT_EXTRACTION_PROMPT,
  DATA_VERIFICATION_PROMPT,
  STRUCTURED_REPORT_EXTRACTION_PROMPT,
  isClaimApplicationDocument,
  isStructuredIsirDocument
} from '../isirDocumentPrompts.js';

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
  assert.match(CASE_STUDY_FINAL_PROMPT, /2\. krok zpracování/);
  assert.match(CASE_STUDY_FINAL_PROMPT, /\[\[SECTION:current:Aktuální stav a co řešit\]\]/);
  assert.match(CASE_STUDY_FINAL_PROMPT, /\[\[SECTION:history:Vývoj řízení\]\]/);
  assert.match(CASE_STUDY_FINAL_PROMPT, /6 000 znaků/);
  assert.equal(parseGeminiText({
    candidates: [{ content: { parts: [{ text: '[[SECTION:current:Aktuální stav a co řešit]]\\nStav nyní:\\nProbíhá.' }] } }]
  }), '[[SECTION:current:Aktuální stav a co řešit]]\\nStav nyní:\\nProbíhá.');
});

test('ISIR AI rozlišuje formulářová PDF a přihlášky pohledávek', () => {
  assert.equal(isStructuredIsirDocument({ title: 'Zpráva o plnění oddlužení' }), true);
  assert.equal(isStructuredIsirDocument({
    title: 'Zpráva pro oddlužení Soupis majetkové podstaty Seznam přihlášených pohledávek'
  }), true);
  assert.equal(isStructuredIsirDocument({ title: 'Běžné usnesení soudu' }), false);
  assert.equal(isClaimApplicationDocument({ title: 'Přihláška pohledávky' }), true);
  assert.match(STRUCTURED_REPORT_EXTRACTION_PROMPT, /reviewed_unsecured_claims_total/);
  assert.match(CLAIM_AMOUNT_EXTRACTION_PROMPT, /V\. Pohledávky celkem/);
});

test('Gemini fronta respektuje doporučené čekání při vyčerpání minutové kvóty', () => {
  assert.equal(geminiRetryDelayMs({
    error: {
      message: 'Quota exceeded. Please retry in 58.018447702s.',
      details: []
    }
  }), 58519);
  assert.equal(geminiRetryDelayMs({
    error: {
      details: [{ retryDelay: '12.5s' }]
    }
  }), 13000);
});

test('strukturované čtení formuláře vrátí uložitelnou extrakci', async () => {
  const analysis = await analyzeIsirDocuments({
    mode: 'structured-extraction',
    client: { id: 'client-1', projectId: 'MAS' },
    case: { case_id: 'case-1' },
    documents: [{
      document_id: 'document-1',
      title: 'Zpráva o plnění oddlužení',
      source_url: 'https://isir.justice.cz/isir/doc/dokument.PDF?id=123',
      is_main: 'Ano'
    }]
  }, {
    apiKey: 'test-key',
    fetchImpl: mockPdfAndGeminiFetch({
      proceeding_state: { stage: 'permitted' },
      confidence: 'high'
    })
  });

  assert.equal(analysis.kind, 'STRUCTURED_DOCUMENT_EXTRACTION');
  assert.equal(analysis.result.structured_extractions[0].document_id, 'document-1');
  assert.equal(
    analysis.result.structured_extractions[0].structured_extraction.proceeding_state.stage,
    'permitted'
  );
});

test('čtení přihlášky bezpečně převede částku z odpovědi Gemini', async () => {
  const analysis = await analyzeIsirDocuments({
    mode: 'claim-extraction',
    client: { id: 'client-1', projectId: 'MAS' },
    case: { case_id: 'case-1', claims_total_amount: 100 },
    documents: [{
      document_id: 'claim-1',
      title: 'Přihláška pohledávky',
      source_url: 'https://isir.justice.cz/isir/doc/dokument.PDF?id=124',
      is_main: 'Ano'
    }]
  }, {
    apiKey: 'test-key',
    fetchImpl: mockPdfAndGeminiFetch({
      amount: '1 234,50 Kč',
      currency: 'CZK',
      confidence: 'high'
    })
  });

  assert.equal(analysis.kind, 'CLAIM_AMOUNT_EXTRACTION');
  assert.equal(analysis.result.claim_amount_extractions[0].amount, 1234.5);
  assert.equal(analysis.result.claims_total_amount, 1334.5);
});

test('minimalizované shrnutí zachová jen stručnou sekci', () => {
  const value = minimizeSummary(
    '[[SECTION:summary:Shrnutí]]\nKrátké věcné shrnutí.\n[[SECTION:deadlines:Lhůty a povinnosti]]\nBez lhůt.'
  );
  assert.equal(value, 'Krátké věcné shrnutí.');
});

test('kontrolní návrhy nepustí nepovolená pole', () => {
  const corrections = normalizedCorrections([
    { field: 'claims_total_amount', proposed_value: 1200 },
    { field: 'client_name', proposed_value: 'Jiný klient' }
  ]);
  assert.deepEqual(corrections.map((item) => item.field), ['claims_total_amount']);
  assert.match(DATA_VERIFICATION_PROMPT, /Nic neopravuj automaticky/);
});

test('kazuistika nejprve systémově ověří, zda běží lhůta přihlášek', () => {
  assert.equal(currentDateInPrague(new Date('2026-12-31T23:30:00.000Z')), '2027-01-01');
  assert.equal(getClaimsDeadlineStatus('2026-08-03', '2026-07-24').status, 'active');
  assert.equal(getClaimsDeadlineStatus('2026-07-20', '2026-07-24').status, 'expired');
  assert.equal(getClaimsDeadlineStatus('', '2026-07-24').status, 'not_verified');

  const prompt = buildCaseStudyAnalysisPrompt({
    currentDate: '2026-07-24',
    client: { fullName: 'Klient', projectId: 'MAS' },
    caseItem: {
      claims_deadline: '2026-08-03',
      ai_case_study: 'Předchozí úplná kazuistika.'
    },
    documents: [{
      document_id: 'new-1',
      title: 'Zpráva pro oddlužení',
      event_date: '2026-07-24',
      analysis_json: JSON.stringify({
        specialized_reader: 'debt_relief_structured_report',
        structured_extraction: { proceeding_state: { stage: 'permitted' } }
      })
    }],
    contextDocuments: [{
      document_id: 'old-1',
      title: 'Usnesení',
      event_date: '2026-06-03'
    }]
  });

  assert.match(prompt, /PRVNÍ POVINNÝ KROK/);
  assert.match(prompt, /"status": "active"/);
  assert.match(prompt, /debt_relief_structured_report/);
  assert.match(prompt, /Kompletní seznam dokumentů podle ISIR/);
  assert.match(prompt, /OBSAHOVĚ PŘILOŽENÉ PDF DOKUMENTY/);
});

test('finální kazuistika nesmí popřít systémově ověřenou lhůtu', () => {
  const caseStudy = [
    '[[SECTION:current:Aktuální stav a co řešit]]',
    'Stav nyní:',
    'Lhůta pro podávání přihlášek pohledávek není bezpečně ověřena.',
    'Řízení pokračuje.',
    '',
    'Nejistoty pro aktuální práci:',
    '- Lhůta pro podávání přihlášek pohledávek není bezpečně ověřena.',
    '',
    '[[SECTION:history:Vývoj řízení]]',
    'Historie případu.'
  ].join('\n');

  const result = enforceClaimsDeadlineInCaseStudy(
    caseStudy,
    { claims_deadline: '2026-06-08' },
    '2026-07-24'
  );

  assert.match(result, /Lhůta pro podávání přihlášek pohledávek skončila 2026-06-08\./);
  assert.doesNotMatch(result, /není bezpečně ověřena/i);
  assert.equal(
    (result.match(/Lhůta pro podávání přihlášek pohledávek/gi) || []).length,
    1
  );
});
