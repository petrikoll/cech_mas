import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProjectDashboard, isQualifyingPaymentPlan } from '../src/lib/projectDashboard.js';

test('výchozí plnění MAS odpovídá schválené projektové sestavě', () => {
  const dashboard = buildProjectDashboard({ projectId: 'MAS', clients: [], records: [] });
  assert.deepEqual(dashboard.indicators.map(({ code, target, current }) => ({ code, target, current })), [
    { code: '600 000', target: 2, current: 0 },
    { code: '670 102', target: 148, current: 1 },
    { code: '670 031', target: 2.5, current: 2.5 }
  ]);
  assert.equal(dashboard.outputPercent, 50);
  assert.equal(Math.round(dashboard.resultPercent * 100) / 100, 0.68);
  assert.equal(dashboard.goalsPercent, 0);
});

test('výchozí plnění CECH odpovídá schválené projektové sestavě', () => {
  const dashboard = buildProjectDashboard({ projectId: 'CECH', clients: [], records: [] });
  assert.deepEqual(dashboard.goals.map(({ label, target, current }) => ({ label, target, current })), [
    { label: 'Insolvence – podáno', target: 25, current: 0 },
    { label: 'Insolvence – schváleno', target: 25, current: 0 },
    { label: 'Stabilizace dluhové situace', target: 50, current: 4 },
    { label: 'Splácení uzavřených dohod', target: 15, current: 0 },
    { label: 'Zvýšení gramotnosti', target: 80, current: 0 }
  ]);
  assert.equal(dashboard.outputPercent, 50);
  assert.equal(Math.round(dashboard.resultPercent * 100) / 100, 4.73);
  assert.equal(dashboard.goalsPercent, 2);
});

test('dashboard nepočítá individuální plány jako projektové cíle', () => {
  const dashboard = buildProjectDashboard({
    projectId: 'MAS',
    clients: [{ id: 'client-1', projectId: 'MAS' }],
    records: [{
      entityType: 'plans',
      clientId: 'client-1',
      clientIds: ['client-1'],
      payload: { durationMinutes: 3000, goals: [{ isCompleted: true }] }
    }]
  });
  assert.equal(dashboard.indicators.find((item) => item.key === '600000').current, 0);
  assert.equal(dashboard.goals.some((item) => item.key === 'employee-ipv'), false);
});

test('C3 sleduje podání, ale schválení vznikne jen z ověření ISIR po 1. 3. 2026', () => {
  const dashboard = buildProjectDashboard({
    projectId: 'MAS',
    clients: [{ id: 'client-1', projectId: 'MAS' }, { id: 'client-2', projectId: 'MAS' }],
    records: [
      {
        entityType: 'consultations',
        clientId: 'client-1',
        clientIds: ['client-1'],
        payload: { durationMinutes: 60, activityCodes: ['C3'] }
      },
      {
        entityType: 'insolvency_verification',
        clientId: 'client-2',
        clientIds: ['client-2'],
        payload: { matched: true, insolvencyDate: '2026-03-01' }
      }
    ]
  });
  assert.equal(dashboard.goals.find((item) => item.key === 'submitted-insolvencies').current, 1);
  assert.equal(dashboard.goals.find((item) => item.key === 'approved-insolvencies').current, 1);
});

test('670 102 počítá unikátní osobu už při jedné podpoře i bez uvedené délky', () => {
  const dashboard = buildProjectDashboard({
    projectId: 'MAS',
    clients: [{ id: 'client-1', projectId: 'MAS' }, { id: 'client-2', projectId: 'MAS' }],
    records: [
      { entityType: 'consultations', clientId: 'client-1', clientIds: ['client-1'], payload: {} },
      { entityType: 'consultations', clientId: 'client-1', clientIds: ['client-1'], payload: { durationMinutes: 60 } },
      { entityType: 'case_management', clientId: 'client-2', clientIds: ['client-2'], payload: {} }
    ]
  });
  assert.equal(dashboard.indicators.find((item) => item.key === '670102').current, 2);
  assert.equal(dashboard.indicators.find((item) => item.key === '670031').percent, 100);
});

test('600 000 počítá unikátní osoby od přesně 40 hodin podpory', () => {
  const dashboard = buildProjectDashboard({
    projectId: 'CECH',
    clients: [
      { id: 'client-40', projectId: 'CECH' },
      { id: 'client-39', projectId: 'CECH' }
    ],
    records: [
      { entityType: 'consultations', clientId: 'client-40', clientIds: ['client-40'], payload: { durationMinutes: 1200 } },
      { entityType: 'case_management', clientId: 'client-40', clientIds: ['client-40'], payload: { durationMinutes: 1200 } },
      { entityType: 'consultations', clientId: 'client-39', clientIds: ['client-39'], payload: { durationMinutes: 2399 } },
      { entityType: 'plans', clientId: 'client-39', clientIds: ['client-39'], payload: { durationMinutes: 120 } }
    ]
  });
  assert.equal(dashboard.indicators.find((item) => item.key === '600000').current, 1);
});

test('splněný kalendář a C6 nebo C7 aktualizují klientské cíle bez dvojího započtení', () => {
  const dashboard = buildProjectDashboard({
    projectId: 'MAS',
    clients: [{ id: 'client-1', projectId: 'MAS' }],
    records: [
      {
        entityType: 'payment_plan',
        clientId: 'client-1',
        clientIds: ['client-1'],
        payload: { status: 'COMPLETED', installmentStatuses: {} }
      },
      {
        entityType: 'consultations',
        clientId: 'client-1',
        clientIds: ['client-1'],
        payload: { durationMinutes: 60, activityCodes: ['C6', 'C7'] }
      }
    ]
  });
  assert.equal(dashboard.goals.find((item) => item.key === 'repaying-agreements').current, 1);
  assert.equal(dashboard.goals.find((item) => item.key === 'financial-literacy').current, 1);
});

test('kalendář se započte po pěti splněných měsících s přerušením nejvýše dva měsíce', () => {
  assert.equal(isQualifyingPaymentPlan({
    payload: {
      status: 'ACTIVE',
      installmentStatuses: {
        '2026-01': 'PAID',
        '2026-02': 'PAID',
        '2026-05': 'PAID',
        '2026-06': 'PAID',
        '2026-07': 'PAID'
      }
    }
  }), true);

  assert.equal(isQualifyingPaymentPlan({
    payload: {
      status: 'ACTIVE',
      installmentStatuses: {
        '2026-01': 'PAID',
        '2026-02': 'PAID',
        '2026-06': 'PAID',
        '2026-07': 'PAID',
        '2026-08': 'PAID'
      }
    }
  }), false);
});

test('stabilizace zahrne úspěšný kalendář, schválené oddlužení a zastavení exekuce', () => {
  const clients = ['calendar', 'insolvency', 'enforcement', 'single-payment', 'submitted']
    .map((id) => ({ id, projectId: 'MAS' }));
  const dashboard = buildProjectDashboard({
    projectId: 'MAS',
    clients,
    records: [
      {
        entityType: 'payment_plan',
        clientId: 'calendar',
        clientIds: ['calendar'],
        payload: { status: 'COMPLETED', installmentStatuses: {} }
      },
      {
        entityType: 'insolvency_verification',
        clientId: 'insolvency',
        clientIds: ['insolvency'],
        payload: { matched: true, insolvencyDate: '2026-03-02' }
      },
      {
        entityType: 'consultations',
        clientId: 'enforcement',
        clientIds: ['enforcement'],
        payload: { outcome: 'Exekuce byla pravomocně zastavena.' }
      },
      {
        entityType: 'payment_plan',
        clientId: 'single-payment',
        clientIds: ['single-payment'],
        payload: { status: 'ACTIVE', installmentStatuses: { '2026-04': 'PAID' } }
      },
      {
        entityType: 'consultations',
        clientId: 'submitted',
        clientIds: ['submitted'],
        payload: { activityCodes: ['C3'], outcome: 'Návrh byl podán.' }
      }
    ]
  });
  assert.equal(dashboard.goals.find((item) => item.key === 'stabilized-debt').current, 3);
});
