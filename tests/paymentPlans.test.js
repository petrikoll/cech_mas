import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_MONTH_STATUSES,
  addPaymentMonths,
  buildPaymentSchedule,
  calculateAveragePayment,
  calculatePlannedEndMonth,
  mapPaymentPlanRowToRecord,
  nextPaymentMonthStatus,
  normalizePaymentMonth
} from '../src/lib/paymentPlans.js';

test('měsíc splátky přijímá hodnoty ze starého sheetu i HTML formuláře', () => {
  assert.equal(normalizePaymentMonth('04/26'), '2026-04');
  assert.equal(normalizePaymentMonth('4/2026'), '2026-04');
  assert.equal(normalizePaymentMonth('2026-4'), '2026-04');
  assert.equal(normalizePaymentMonth('13/26'), '');
});

test('harmonogram správně přechází mezi roky a počítá konec', () => {
  assert.equal(addPaymentMonths('2026-12', 1), '2027-01');
  assert.deepEqual(buildPaymentSchedule('04/26', 3), ['2026-04', '2026-05', '2026-06']);
  assert.equal(calculatePlannedEndMonth('04/26', 6), '2026-09');
  assert.equal(calculateAveragePayment(1866, 6), 311);
});

test('stav měsíce se cyklicky přepíná mezi splněno, nesplněno a bez záznamu', () => {
  assert.equal(nextPaymentMonthStatus(), PAYMENT_MONTH_STATUSES.PAID);
  assert.equal(nextPaymentMonthStatus(PAYMENT_MONTH_STATUSES.PAID), PAYMENT_MONTH_STATUSES.MISSED);
  assert.equal(nextPaymentMonthStatus(PAYMENT_MONTH_STATUSES.MISSED), PAYMENT_MONTH_STATUSES.PENDING);
});

test('jeden klient může mít více samostatných splátkových kalendářů', () => {
  const clientIndex = { 'client-1': { fullName: 'Jan Novák', projectId: 'CECH' } };
  const first = mapPaymentPlanRowToRecord({
    plan_id: 'plan-1',
    project_id: 'CECH',
    client_id: 'client-1',
    creditor_type: 'ČSSZ',
    debt_amount: 14500,
    first_payment_month: '04/26',
    planned_installments: 29,
    planned_end_month: '08/28',
    average_payment: 500,
    installment_statuses_json: '{"2026-04":"PAID"}'
  }, clientIndex);
  const second = mapPaymentPlanRowToRecord({
    plan_id: 'plan-2',
    project_id: 'CECH',
    client_id: 'client-1',
    creditor_type: 'ZP',
    debt_amount: 6300,
    first_payment_month: '04/26',
    planned_installments: 21,
    planned_end_month: '12/27',
    average_payment: 300
  }, clientIndex);

  assert.notEqual(first.id, second.id);
  assert.equal(first.clientId, second.clientId);
  assert.equal(first.payload.creditorType, 'ČSSZ');
  assert.deepEqual(first.payload.installmentStatuses, { '2026-04': 'PAID' });
});
