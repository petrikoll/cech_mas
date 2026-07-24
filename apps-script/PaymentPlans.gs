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

function normalizeLegacyPaymentIdentity_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function parseLegacyPaymentAmount_(value) {
  const normalized = String(value || '')
    .replace(/\u00a0/g, '')
    .replace(/\s+/g, '')
    .replace(/kč/gi, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function normalizeLegacyPaymentBirthDate_(value) {
  const text = String(value || '').trim();
  const usMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    return usMatch[3] + '-' + String(Number(usMatch[1])).padStart(2, '0') + '-' +
      String(Number(usMatch[2])).padStart(2, '0');
  }
  return safeNormalizeDate_(value);
}

function buildLegacyPaymentPlanKey_(value) {
  return [
    Number(value.client_number),
    normalizeLegacyPaymentIdentity_(value.creditor_type),
    Number(value.debt_amount),
    normalizePaymentMonth_(value.first_payment_month),
    Number(value.planned_installments)
  ].join('|');
}

function importLegacyPaymentPlans_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sourceSheetName = 'Přehled splátkových kalendářů';
    const sourceSheet = getRegistrySpreadsheet_().getSheetByName(sourceSheetName);
    if (!sourceSheet) throw new Error('Zdrojový list splátkových kalendářů nebyl nalezen.');

    const sourceValues = sourceSheet.getDataRange().getDisplayValues();
    if (sourceValues.length < 2) {
      return { imported: 0, skipped: 0, errors: [], totalSourceRows: 0 };
    }

    const registryClients = getRegistryRows_()
      .map((row) => ({
        projectId: normalizeProjectId_(row[REGISTRY_COLUMN.projectId]),
        firstName: normalizeText_(row[REGISTRY_COLUMN.firstName]),
        lastName: normalizeText_(row[REGISTRY_COLUMN.lastName]),
        birthDate: safeNormalizeDate_(row[REGISTRY_COLUMN.birthDate]),
        clientNumber: Number(row[REGISTRY_COLUMN.clientNumber])
      }))
      .filter((client) =>
        client.projectId &&
        Number.isInteger(client.clientNumber) &&
        client.firstName &&
        client.lastName &&
        client.birthDate
      );

    const monthHeaders = sourceValues[0].slice(11, 39);
    const existingKeys = new Set(
      readDataObjects_(DATA_SHEETS.paymentPlans)
        .filter((row) => String(row.status || '').toUpperCase() !== 'DELETED')
        .map((row) => buildLegacyPaymentPlanKey_(row))
    );
    const timestamp = nowIso_();
    const result = {
      imported: 0,
      skipped: 0,
      errors: [],
      totalSourceRows: 0,
      projects: { CECH: 0, MAS: 0 }
    };

    sourceValues.slice(1).forEach((row, rowIndex) => {
      const firstName = normalizeText_(row[1]);
      const lastName = normalizeText_(row[2]);
      const birthDate = normalizeLegacyPaymentBirthDate_(row[3]);
      const rawDebtAmount = row[4];
      const rawFirstPaymentMonth = row[5];
      const rawPlannedInstallments = row[6];
      const creditorType = normalizeText_(row[7]);
      if (!firstName && !lastName && !birthDate && !rawDebtAmount) return;
      result.totalSourceRows += 1;

      try {
        const debtAmount = parseLegacyPaymentAmount_(rawDebtAmount);
        const firstPaymentMonth = normalizePaymentMonth_(rawFirstPaymentMonth);
        const plannedInstallments = Number(String(rawPlannedInstallments || '').trim());
        if (!birthDate || !debtAmount || !firstPaymentMonth ||
            !Number.isInteger(plannedInstallments) || plannedInstallments < 1 ||
            !creditorType) {
          throw new Error('Neúplné nebo neplatné údaje kalendáře.');
        }

        const birthMatches = registryClients.filter((client) => client.birthDate === birthDate);
        const exactMatches = birthMatches.filter((client) =>
          normalizeLegacyPaymentIdentity_(client.firstName) === normalizeLegacyPaymentIdentity_(firstName) &&
          normalizeLegacyPaymentIdentity_(client.lastName) === normalizeLegacyPaymentIdentity_(lastName)
        );
        const client = exactMatches.length === 1
          ? exactMatches[0]
          : birthMatches.length === 1
            ? birthMatches[0]
            : null;
        if (!client) throw new Error('Klienta se nepodařilo jednoznačně spárovat.');

        const clientIndex = getClientIndexByNumber_(client.clientNumber);
        if (!clientIndex) throw new Error('Klient chybí v aplikačním indexu.');
        if (requireProjectId_(clientIndex.project_id) !== client.projectId) {
          throw new Error('Projekt klienta nesouhlasí s aplikačním indexem.');
        }

        const schedule = buildPaymentSchedule_(firstPaymentMonth, plannedInstallments);
        const scheduleSet = new Set(schedule);
        const installmentStatuses = {};
        let status = 'ACTIVE';
        monthHeaders.forEach((header, monthIndex) => {
          const month = normalizePaymentMonth_(header);
          if (!month || !scheduleSet.has(month)) return;
          const marker = String(row[11 + monthIndex] || '').trim().toUpperCase();
          if (marker.includes('END✓')) status = 'COMPLETED';
          else if (marker.includes('END✗')) status = 'FAILED';
          else if (marker.includes('✓')) installmentStatuses[month] = 'PAID';
          else if (marker.includes('✗') || marker === 'X') installmentStatuses[month] = 'MISSED';
        });

        const value = {
          plan_id: uuid_(),
          project_id: client.projectId,
          client_id: String(clientIndex.client_id || ''),
          client_number: client.clientNumber,
          creditor_type: creditorType,
          debt_amount: debtAmount,
          first_payment_month: firstPaymentMonth,
          planned_installments: plannedInstallments,
          planned_end_month: schedule[schedule.length - 1],
          average_payment: Math.round((debtAmount / plannedInstallments) * 100) / 100,
          status: status,
          installment_statuses_json: JSON.stringify(installmentStatuses),
          notes: 'Importováno z původního listu „' + sourceSheetName + '“, řádek ' + (rowIndex + 2) + '.',
          source_system: 'LEGACY_PAYMENT_SHEET',
          created_at: timestamp,
          created_by: 'SYSTEM_LEGACY_IMPORT',
          updated_at: timestamp,
          updated_by: 'SYSTEM_LEGACY_IMPORT'
        };
        const key = buildLegacyPaymentPlanKey_(value);
        if (existingKeys.has(key)) {
          result.skipped += 1;
          return;
        }

        appendDataObject_(DATA_SHEETS.paymentPlans, value);
        existingKeys.add(key);
        result.imported += 1;
        result.projects[client.projectId] += 1;
      } catch (error) {
        result.errors.push({
          row: rowIndex + 2,
          client: [firstName, lastName].filter(Boolean).join(' '),
          error: error.message
        });
      }
    });

    return result;
  } finally {
    lock.releaseLock();
  }
}

function importLegacyPaymentPlans() {
  return importLegacyPaymentPlans_();
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
