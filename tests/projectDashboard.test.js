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
  assert.equal(dashboard.goalsPercent, 20);
});

test('výchozí plnění CECH odpovídá schválené projektové sestavě', () => {
  const dashboard = buildProjectDashboard({ projectId: 'CECH', clients: [], records: [] });
  assert.deepEqual(dashboard.goals.map(({ label, target, current }) => ({ label, target, current })), [
    { label: 'Schválené insolvence', target: 25, current: 0 },
    { label: 'Stabilizace dluhové situace', target: 50, current: 4 },
    { label: 'Splácení uzavřených dohod', target: 15, current: 0 },
    { label: 'Zvýšení gramotnosti', target: 80, current: 0 },
    { label: 'Naplnění IPV zaměstnanců', target: 6, current: 6 }
  ]);
  assert.equal(dashboard.outputPercent, 50);
  assert.equal(Math.round(dashboard.resultPercent * 100) / 100, 4.73);
  assert.equal(dashboard.goalsPercent, 21.6);
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
  assert.equal(dashboard.goals.find((item) => item.key === 'employee-ipv').current, 5);
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
