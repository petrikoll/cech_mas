export const PAYMENT_MONTH_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  PAID: 'PAID',
  MISSED: 'MISSED'
});

export const PAYMENT_PLAN_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  PAUSED: 'PAUSED'
});

function paymentMonthFromDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  return year && month ? `${year}-${month}` : '';
}

export function normalizePaymentMonth(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return paymentMonthFromDate(value);
  }
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return paymentMonthFromDate(text);
  }
  let match = text.match(/^(\d{4})-(\d{1,2})(?:$|-\d{1,2}|T)/);
  if (match) {
    const month = Number(match[2]);
    return month >= 1 && month <= 12
      ? `${match[1]}-${String(month).padStart(2, '0')}`
      : '';
  }
  match = text.match(/^(\d{1,2})[/.](\d{2}|\d{4})$/);
  if (!match) return '';
  const month = Number(match[1]);
  if (month < 1 || month > 12) return '';
  const rawYear = Number(match[2]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function addPaymentMonths(monthValue, offset) {
  const normalized = normalizePaymentMonth(monthValue);
  if (!normalized) return '';
  const [year, month] = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + Number(offset || 0), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildPaymentSchedule(firstPaymentMonth, plannedInstallments) {
  const count = Math.max(0, Math.min(240, Number(plannedInstallments) || 0));
  return Array.from({ length: count }, (_, index) => addPaymentMonths(firstPaymentMonth, index))
    .filter(Boolean);
}

export function calculatePlannedEndMonth(firstPaymentMonth, plannedInstallments) {
  const count = Number(plannedInstallments) || 0;
  return count > 0 ? addPaymentMonths(firstPaymentMonth, count - 1) : '';
}

export function calculateAveragePayment(debtAmount, plannedInstallments) {
  const debt = Number(debtAmount);
  const count = Number(plannedInstallments);
  return Number.isFinite(debt) && debt >= 0 && Number.isInteger(count) && count > 0
    ? Math.round((debt / count) * 100) / 100
    : 0;
}

export function nextPaymentMonthStatus(status) {
  if (status === PAYMENT_MONTH_STATUSES.PAID) return PAYMENT_MONTH_STATUSES.MISSED;
  if (status === PAYMENT_MONTH_STATUSES.MISSED) return PAYMENT_MONTH_STATUSES.PENDING;
  return PAYMENT_MONTH_STATUSES.PAID;
}

export function mapPaymentPlanRowToRecord(row, clientIndex = {}) {
  const planId = String(row.plan_id || row.id || '').trim();
  const clientId = String(row.client_id || row.klient_id || '').trim();
  if (!planId || !clientId) return null;
  const client = clientIndex[clientId] || null;
  let installmentStatuses =
    row.installment_statuses_json ||
    row.installment_statuses ||
    row.installmentStatuses ||
    {};
  if (typeof installmentStatuses === 'string') {
    try {
      installmentStatuses = JSON.parse(installmentStatuses);
    } catch {
      installmentStatuses = {};
    }
  }
  return {
    id: planId,
    entityType: 'payment_plan',
    ka: 'KA1',
    title: `Splátkový kalendář · ${row.creditor_type || 'věřitel'}`,
    activityDate: `${normalizePaymentMonth(row.first_payment_month) || '2000-01'}-01`,
    clientId,
    clientIds: [clientId],
    clientName: client?.fullName || '',
    projectId: row.project_id || client?.projectId || '',
    sourceSystem: row.source_system || 'NEW_APP',
    remoteSource: true,
    payload: {
      creditorType: row.creditor_type || '',
      debtAmount: Number(row.debt_amount || 0),
      firstPaymentMonth: normalizePaymentMonth(row.first_payment_month),
      plannedInstallments: Number(row.planned_installments || 0),
      plannedEndMonth: normalizePaymentMonth(row.planned_end_month),
      averagePayment: Number(row.average_payment || 0),
      status: row.status || PAYMENT_PLAN_STATUSES.ACTIVE,
      installmentStatuses: installmentStatuses && typeof installmentStatuses === 'object'
        ? installmentStatuses
        : {},
      notes: row.notes || ''
    }
  };
}
