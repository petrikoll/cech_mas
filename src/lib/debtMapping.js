function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function selectedClientRecords(records, clientId, entityType) {
  return records.filter((record) => {
    if (entityType && record.entityType !== entityType) return false;
    const clientIds = Array.isArray(record.clientIds)
      ? record.clientIds
      : record.clientId
        ? [record.clientId]
        : [];
    return clientIds.includes(clientId);
  });
}

function contextRecordText(record) {
  return String(
    record.documentText
    || record.payload?.topics
    || record.payload?.description
    || record.payload?.outcome
    || ''
  ).trim();
}

export function buildDebtMappingContext({
  client,
  records = [],
  insolvencyCases = [],
  insolvencyDocuments = [],
  insolvencyAnalyses = [],
  insolvencyVerifications = []
}) {
  if (!client?.id) throw new Error('Pro mapování musí být vybrán klient.');

  const performances = selectedClientRecords(records, client.id)
    .filter((record) => record.entityType === 'consultations')
    .sort((left, right) => String(right.activityDate || '').localeCompare(String(left.activityDate || '')))
    .slice(0, 80)
    .map((record) => ({
      date: record.activityDate || '',
      activities: Array.isArray(record.payload?.activityCodes) ? record.payload.activityCodes : [],
      title: record.title || '',
      note: contextRecordText(record),
      worker: record.worker || '',
      durationMinutes: Number(record.payload?.durationMinutes || 0)
    }))
    .filter((item) => item.note || item.activities.length);

  const paymentPlans = selectedClientRecords(records, client.id, 'payment_plan')
    .slice(0, 40)
    .map((record) => ({
      creditorType: record.payload?.creditorType || '',
      debtAmount: Number(record.payload?.debtAmount || 0),
      firstPaymentMonth: record.payload?.firstPaymentMonth || '',
      plannedInstallments: Number(record.payload?.plannedInstallments || 0),
      plannedEndMonth: record.payload?.plannedEndMonth || '',
      averagePayment: Number(record.payload?.averagePayment || 0),
      status: record.payload?.status || '',
      notes: record.payload?.notes || ''
    }));

  const cases = insolvencyCases
    .filter((item) => String(item.client_id || '') === String(client.id))
    .slice(0, 12);
  const caseIds = new Set(cases.map((item) => String(item.case_id || '')).filter(Boolean));
  const documents = insolvencyDocuments
    .filter((item) =>
      String(item.client_id || '') === String(client.id)
      || caseIds.has(String(item.case_id || ''))
    )
    .slice(0, 80);
  const analyses = insolvencyAnalyses
    .filter((item) =>
      String(item.client_id || '') === String(client.id)
      || caseIds.has(String(item.case_id || ''))
    )
    .slice()
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
    .slice(0, 8);
  const verification = insolvencyVerifications.find(
    (item) => String(item.client_id || '') === String(client.id)
  ) || null;

  return {
    client: {
      id: client.id,
      number: client.clientNumber || '',
      fullName: client.fullName || [client.jmeno, client.prijmeni].filter(Boolean).join(' '),
      birthDate: client.datumNarozeni || '',
      projectId: client.projectId || '',
      address: [client.ulice, client.cisloPopisne, client.mesto, client.psc].filter(Boolean).join(', '),
      employmentStatus: client.postaveniNaTrhu || '',
      disadvantage: client.znevyhodneni || '',
      projectEntryDate: client.datumVstupu || '',
      note: client.poznamka || ''
    },
    monitoring: {
      sourceAvailable: Boolean(client.monitoringListUrl),
      sourceUrl: client.monitoringListUrl || '',
      performances
    },
    paymentPlans,
    isir: {
      verification: verification ? {
        matched: /^(ano|true|1)$/i.test(String(verification.matched || '')),
        caseNumber: verification.case_number || '',
        caseStatus: verification.case_status || '',
        insolvencyDate: verification.insolvency_date || '',
        verifiedAt: verification.verified_at || ''
      } : null,
      cases: cases.map((item) => ({
        caseId: item.case_id || '',
        caseNumber: item.case_number || '',
        caseStatus: item.case_status || '',
        proceedingStartedAt: item.proceeding_started_at || '',
        proceedingEndedAt: item.proceeding_ended_at || '',
        claimsDeadline: item.claims_deadline || '',
        claimsCount: item.claims_count ?? null,
        claimsTotalAmount: item.claims_total_amount ?? null,
        lastEventAt: item.last_event_at || '',
        lastEventTitle: item.last_event_title || '',
        caseStudy: item.ai_case_study || ''
      })),
      analyses: analyses.map((item) => ({
        kind: item.kind || '',
        createdAt: item.created_at || '',
        result: item.result || parseJsonObject(item.result_json)
      })),
      documents: documents.map((item) => ({
        title: item.title || '',
        type: item.document_type || '',
        date: item.event_date || '',
        isMain: /^(ano|true|1)$/i.test(String(item.is_main || ''))
      }))
    }
  };
}
