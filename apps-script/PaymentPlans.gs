function normalizePaymentMonth_(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    const month = Number(match[2]);
    if (month < 1 || month > 12) throw new Error('Neplatný měsíc splátky.');
    return match[1] + '-' + String(month).padStart(2, '0');
  }
  match = text.match(/^(\d{1,2})[/.](\d{2}|\d{4})$/);
  if (!match) throw new Error('Měsíc splátky musí být ve formátu RRRR-MM.');
  const month = Number(match[1]);
  const rawYear = Number(match[2]);
  if (month < 1 || month > 12) throw new Error('Neplatný měsíc splátky.');
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return year + '-' + String(month).padStart(2, '0');
}

function addPaymentMonths_(monthValue, offset) {
  const normalized = normalizePaymentMonth_(monthValue);
  const parts = normalized.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1 + Number(offset || 0), 1));
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
}

function buildPaymentSchedule_(firstPaymentMonth, plannedInstallments) {
  const count = Number(plannedInstallments);
  if (!Number.isInteger(count) || count < 1 || count > 240) {
    throw new Error('Počet splátek musí být celé číslo od 1 do 240.');
  }
  return Array.from({ length: count }, (_, index) => addPaymentMonths_(firstPaymentMonth, index));
}

function normalizeInstallmentStatuses_(value, schedule) {
  let parsed = value || {};
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed || '{}');
    } catch (error) {
      throw new Error('Průběh splátek nemá platný formát.');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
  const scheduleSet = new Set(schedule);
  return Object.keys(parsed).reduce((result, month) => {
    const normalizedMonth = normalizePaymentMonth_(month);
    const status = String(parsed[month] || '').trim().toUpperCase();
    if (scheduleSet.has(normalizedMonth) && ['PAID', 'MISSED'].includes(status)) {
      result[normalizedMonth] = status;
    }
    return result;
  }, {});
}

function listPaymentPlans_(projectId) {
  const normalizedProjectId = requireProjectId_(projectId);
  return readDataObjects_(DATA_SHEETS.paymentPlans)
    .filter((row) =>
      requireProjectId_(row.project_id) === normalizedProjectId &&
      String(row.status || '').toUpperCase() !== 'DELETED'
    )
    .map((row) => {
      const value = Object.assign({}, row);
      delete value.__rowNumber;
      return value;
    });
}

function savePaymentPlan_(input, context) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const paymentPlan = Object.assign({}, input || {});
    const clientId = String(paymentPlan.client_id || paymentPlan.klient_id || '').trim();
    const clientIndex = getClientIndexById_(clientId);
    if (!clientIndex) throw new Error('Klient splátkového kalendáře nebyl nalezen.');
    if (requireProjectId_(clientIndex.project_id) !== context.projectId) {
      throw new Error('Klient nepatří do zvoleného projektu.');
    }

    const existing = paymentPlan.plan_id
      ? readDataObjects_(DATA_SHEETS.paymentPlans).find((row) =>
          String(row.plan_id || '') === String(paymentPlan.plan_id)
        )
      : null;
    if (existing) {
      if (requireProjectId_(existing.project_id) !== context.projectId ||
          String(existing.client_id || '') !== clientId) {
        throw new Error('Projekt ani klient splátkového kalendáře nelze změnit.');
      }
    }

    const creditorType = normalizeText_(paymentPlan.creditor_type);
    if (!creditorType) throw new Error('Typ věřitele je povinný.');
    const debtAmount = Number(paymentPlan.debt_amount);
    if (!Number.isFinite(debtAmount) || debtAmount <= 0) {
      throw new Error('Výše dluhu musí být kladné číslo.');
    }
    const firstPaymentMonth = normalizePaymentMonth_(paymentPlan.first_payment_month);
    const plannedInstallments = Number(paymentPlan.planned_installments);
    const schedule = buildPaymentSchedule_(firstPaymentMonth, plannedInstallments);
    const statuses = normalizeInstallmentStatuses_(
      paymentPlan.installment_statuses_json || paymentPlan.installment_statuses,
      schedule
    );
    const status = String(paymentPlan.status || 'ACTIVE').trim().toUpperCase();
    if (!['ACTIVE', 'COMPLETED', 'FAILED', 'PAUSED'].includes(status)) {
      throw new Error('Neplatný stav splátkového kalendáře.');
    }

    const timestamp = nowIso_();
    const value = {
      plan_id: existing ? existing.plan_id : uuid_(),
      project_id: context.projectId,
      client_id: clientId,
      client_number: Number(clientIndex.client_number),
      creditor_type: creditorType,
      debt_amount: Math.round(debtAmount * 100) / 100,
      first_payment_month: firstPaymentMonth,
      planned_installments: plannedInstallments,
      planned_end_month: schedule[schedule.length - 1],
      average_payment: Math.round((debtAmount / plannedInstallments) * 100) / 100,
      status: status,
      installment_statuses_json: JSON.stringify(statuses),
      notes: normalizeText_(paymentPlan.notes),
      source_system: normalizeText_(paymentPlan.source_system || 'NEW_APP'),
      created_at: existing ? existing.created_at : timestamp,
      created_by: existing ? existing.created_by : context.actorId,
      updated_at: timestamp,
      updated_by: context.actorId
    };
    upsertDataObject_(DATA_SHEETS.paymentPlans, 'plan_id', value.plan_id, value);
    writeAudit_(
      context,
      existing ? 'UPDATE' : 'CREATE',
      'PAYMENT_PLAN',
      value.plan_id,
      'OK',
      'client_id=' + clientId + ';installments=' + plannedInstallments + ';status=' + status
    );
    return value;
  } catch (error) {
    writeAudit_(context, 'SAVE', 'PAYMENT_PLAN', input && input.plan_id, 'ERROR', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function deletePaymentPlan_(planId, context) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existing = readDataObjects_(DATA_SHEETS.paymentPlans).find((row) =>
      String(row.plan_id || '') === String(planId || '')
    );
    if (!existing) throw new Error('Splátkový kalendář nebyl nalezen.');
    if (requireProjectId_(existing.project_id) !== context.projectId) {
      throw new Error('Splátkový kalendář patří do jiného projektu.');
    }

    const updated = Object.assign({}, existing, {
      status: 'DELETED',
      updated_at: nowIso_(),
      updated_by: context.actorId
    });
    delete updated.__rowNumber;
    updateDataObjectAtRow_(DATA_SHEETS.paymentPlans, existing.__rowNumber, updated);
    writeAudit_(context, 'DELETE', 'PAYMENT_PLAN', existing.plan_id, 'OK', '');
    return { plan_id: existing.plan_id, status: 'DELETED' };
  } catch (error) {
    writeAudit_(context, 'DELETE', 'PAYMENT_PLAN', planId, 'ERROR', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}
