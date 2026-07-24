import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GEMINI_MODEL,
  buildDebtMappingPrompt,
  normalizeDebtMappingContext,
  validateDebtMappingDocument
} from '../debtMappingService.js';
import { buildDebtMappingContext } from '../src/lib/debtMapping.js';

test('mapování používá Gemini 2.5 Flash a zakazuje vymýšlení závazků', () => {
  assert.equal(GEMINI_MODEL, 'gemini-2.5-flash');
  const context = normalizeDebtMappingContext({
    client: { id: 'client-7', fullName: 'Test Klient' }
  });
  const prompt = buildDebtMappingPrompt(context);
  assert.match(prompt, /Mapování závazků a příčin předlužení/);
  assert.match(prompt, /nevymýšlej věřitele, částky, příčiny/);
  assert.match(prompt, /monitorovací data klienta a systémová data ISIR/);
});

test('kontext skládá monitorovací výkony, kalendáře a ISIR pouze vybraného klienta', () => {
  const context = buildDebtMappingContext({
    client: {
      id: 'client-7',
      clientNumber: '7',
      fullName: 'Test Klient',
      projectId: 'CECH',
      monitoringListUrl: 'https://drive.google.com/monitor'
    },
    records: [
      {
        id: 'p-1',
        entityType: 'consultations',
        clientId: 'client-7',
        activityDate: '2026-03-02',
        documentText: 'Zjištěn závazek vůči dodavateli energie.',
        payload: { activityCodes: ['B1'], durationMinutes: 60 }
      },
      {
        id: 'other',
        entityType: 'consultations',
        clientId: 'client-8',
        documentText: 'Cizí záznam.'
      },
      {
        id: 'plan-1',
        entityType: 'payment_plan',
        clientId: 'client-7',
        payload: { creditorType: 'Dodavatel energie', debtAmount: 5000, status: 'ACTIVE' }
      }
    ],
    insolvencyCases: [{
      case_id: 'case-1',
      client_id: 'client-7',
      case_number: 'KSOS 1 INS 1/2026',
      claims_total_amount: 10000
    }],
    insolvencyDocuments: [],
    insolvencyAnalyses: [],
    insolvencyVerifications: []
  });

  assert.equal(context.monitoring.sourceAvailable, true);
  assert.equal(context.monitoring.performances.length, 1);
  assert.equal(context.paymentPlans.length, 1);
  assert.equal(context.isir.cases.length, 1);
});

test('výstup zahodí závazky bez konkrétní opory nebo z nepovoleného zdroje', () => {
  const document = validateDebtMappingDocument({
    overallSummary: 'Souhrn.',
    clientSituation: 'Situace.',
    obligations: [
      {
        creditor: 'Doložený věřitel',
        amount: 1000,
        status: 'Aktivní',
        source: 'splátkový kalendář',
        evidence: 'Kalendář eviduje částku 1 000 Kč.'
      },
      {
        creditor: 'Domyšlený věřitel',
        amount: 2000,
        status: 'Neznámý',
        source: 'odhad AI',
        evidence: 'Bez opory.'
      }
    ],
    causes: [],
    risks: [],
    recommendedSteps: [],
    missingInformation: [],
    sourcesUsed: []
  });

  assert.equal(document.obligations.length, 1);
  assert.equal(document.obligations[0].creditor, 'Doložený věřitel');
});
