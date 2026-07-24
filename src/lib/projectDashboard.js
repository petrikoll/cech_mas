const PROJECT_DASHBOARD_CONFIG = Object.freeze({
  MAS: Object.freeze({
    indicators: Object.freeze([
      Object.freeze({ key: '600000', code: '600 000', target: 2, baseline: 0, group: 'output' }),
      Object.freeze({ key: '670102', code: '670 102', target: 148, baseline: 1, group: 'result' }),
      Object.freeze({ key: '670031', code: '670 031', target: 2.5, baseline: 2.5, group: 'output' })
    ]),
    goals: Object.freeze([
      Object.freeze({ key: 'submitted-insolvencies', label: 'Insolvence – podáno', target: 25, baseline: 0, supplemental: true }),
      Object.freeze({ key: 'approved-insolvencies', label: 'Insolvence – schváleno', target: 25, baseline: 0 }),
      Object.freeze({ key: 'stabilized-debt', label: 'Stabilizace dluhové situace', target: 50, baseline: 0 }),
      Object.freeze({ key: 'repaying-agreements', label: 'Splácení uzavřených dohod', target: 15, baseline: 0 }),
      Object.freeze({ key: 'financial-literacy', label: 'Zvýšení gramotnosti', target: 80, baseline: 0 })
    ])
  }),
  CECH: Object.freeze({
    indicators: Object.freeze([
      Object.freeze({ key: '600000', code: '600 000', target: 2, baseline: 0, group: 'output' }),
      Object.freeze({ key: '670102', code: '670 102', target: 148, baseline: 7, group: 'result' }),
      Object.freeze({ key: '670031', code: '670 031', target: 2, baseline: 2, group: 'output' })
    ]),
    goals: Object.freeze([
      Object.freeze({ key: 'submitted-insolvencies', label: 'Insolvence – podáno', target: 25, baseline: 0, supplemental: true }),
      Object.freeze({ key: 'approved-insolvencies', label: 'Insolvence – schváleno', target: 25, baseline: 0 }),
      Object.freeze({ key: 'stabilized-debt', label: 'Stabilizace dluhové situace', target: 50, baseline: 4 }),
      Object.freeze({ key: 'repaying-agreements', label: 'Splácení uzavřených dohod', target: 15, baseline: 0 }),
      Object.freeze({ key: 'financial-literacy', label: 'Zvýšení gramotnosti', target: 80, baseline: 0 })
    ])
  })
});

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const cappedPercent = (current, target) =>
  Number(target) > 0 ? Math.min(100, (Number(current || 0) / Number(target)) * 100) : 0;

const average = (values) =>
  values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0;

const recordClientIds = (record) =>
  Array.isArray(record?.clientIds)
    ? record.clientIds.filter(Boolean)
    : record?.clientId
      ? [record.clientId]
      : [];

const recordDurationMinutes = (record) => {
  const duration = Number(record?.payload?.durationMinutes || 0);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
};

const activityCodes = (record) => {
  const values = record?.payload?.activityCodes || record?.activityCodes || [];
  return Array.isArray(values) ? values.map((value) => String(value).toUpperCase()) : [];
};

const recordNarrative = (record) =>
  normalize([
    record?.documentText,
    record?.payload?.outcome,
    record?.payload?.topics,
    record?.payload?.caseNote,
    record?.payload?.description
  ].filter(Boolean).join(' '));

const documentsStoppedEnforcement = (record) => {
  const text = recordNarrative(record);
  return text.includes('exekuc') && (
    text.includes('zastaven') ||
    text.includes('zrusen')
  );
};

const paymentMonthIndex = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? Number(match[1]) * 12 + month - 1 : null;
};

function isQualifyingPaymentPlan(record) {
  const payload = record?.payload || {};
  if (payload.status === 'COMPLETED') return true;

  const paidMonthIndexes = Object.entries(payload.installmentStatuses || {})
    .filter(([, status]) => status === 'PAID')
    .map(([month]) => paymentMonthIndex(month))
    .filter(Number.isInteger)
    .sort((left, right) => left - right);
  if (paidMonthIndexes.length < 5) return false;

  for (let index = 1; index < paidMonthIndexes.length; index += 1) {
    const interruptedMonths = paidMonthIndexes[index] - paidMonthIndexes[index - 1] - 1;
    if (interruptedMonths > 2) return false;
  }
  return true;
}

function buildProjectDashboard({ projectId, clients = [], records = [] }) {
  const config = PROJECT_DASHBOARD_CONFIG[projectId] || PROJECT_DASHBOARD_CONFIG.CECH;
  const projectClients = clients.filter((client) => !client.projectId || client.projectId === projectId);
  const projectClientIds = new Set(projectClients.map((client) => client.id).filter(Boolean));
  const projectRecords = records.filter((record) => {
    if (record.projectId && record.projectId !== projectId) return false;
    const clientIds = recordClientIds(record);
    return !clientIds.length || clientIds.some((clientId) => projectClientIds.has(clientId));
  });

  const supportMinutesByClient = new Map();
  const supportRecords = projectRecords
    .filter((record) => ['consultations', 'case_management'].includes(record.entityType));
  supportRecords.forEach((record) => {
      const minutes = recordDurationMinutes(record);
      recordClientIds(record).forEach((clientId) => {
        supportMinutesByClient.set(clientId, (supportMinutesByClient.get(clientId) || 0) + minutes);
      });
    });

  const supportedClientIds = new Set(
    supportRecords.flatMap(recordClientIds)
  );
  const participants40Hours = Array.from(supportMinutesByClient.values())
    .filter((minutes) => minutes >= 40 * 60).length;

  const submittedInsolvencyIds = new Set(
    projectRecords
      .filter((record) => activityCodes(record).includes('C3'))
      .flatMap(recordClientIds)
  );
  const approvedInsolvencyIds = new Set(
    projectRecords
      .filter((record) =>
        record.entityType === 'insolvency_verification' &&
        record.payload?.matched === true &&
        String(record.payload?.insolvencyDate || '') >= '2026-03-01'
      )
      .flatMap(recordClientIds)
  );
  const paymentPlans = projectRecords.filter((record) => record.entityType === 'payment_plan');
  const clientsRepayingAgreements = new Set(
    paymentPlans
      .filter(isQualifyingPaymentPlan)
      .flatMap(recordClientIds)
  );
  const stabilizedDebtIds = new Set([
    ...approvedInsolvencyIds,
    ...paymentPlans
      .filter(isQualifyingPaymentPlan)
      .flatMap(recordClientIds),
    ...projectRecords
      .filter(documentsStoppedEnforcement)
      .flatMap(recordClientIds)
  ]);
  const financialLiteracyIds = new Set(
    projectRecords
      .filter((record) =>
        activityCodes(record).some((code) => ['C6', 'C7'].includes(code)) ||
        normalize(record.payload?.supportArea).includes('gramot')
      )
      .flatMap(recordClientIds)
  );

  const calculatedIndicators = {
    '600000': participants40Hours,
    '670102': supportedClientIds.size,
    '670031': config.indicators.find((item) => item.key === '670031')?.baseline || 0
  };
  const calculatedGoals = {
    'submitted-insolvencies': submittedInsolvencyIds.size,
    'approved-insolvencies': approvedInsolvencyIds.size,
    'stabilized-debt': stabilizedDebtIds.size,
    'repaying-agreements': clientsRepayingAgreements.size,
    'financial-literacy': financialLiteracyIds.size
  };

  const indicators = config.indicators.map((item) => {
    const current = Math.max(item.baseline, calculatedIndicators[item.key] || 0);
    return { ...item, current, percent: cappedPercent(current, item.target) };
  });
  const goals = config.goals.map((item) => {
    const current = Math.max(item.baseline, calculatedGoals[item.key] || 0);
    return { ...item, current, percent: cappedPercent(current, item.target) };
  });

  return {
    projectId,
    indicators,
    goals,
    outputPercent: average(indicators.filter((item) => item.group === 'output').map((item) => item.percent)),
    resultPercent: average(indicators.filter((item) => item.group === 'result').map((item) => item.percent)),
    goalsPercent: average(goals.filter((item) => !item.supplemental).map((item) => item.percent))
  };
}

export {
  PROJECT_DASHBOARD_CONFIG,
  buildProjectDashboard,
  cappedPercent,
  isQualifyingPaymentPlan
};
