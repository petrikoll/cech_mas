import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const sourceDatabase = process.argv[2]
  || 'C:\\Users\\petrl\\AppData\\Local\\ISIR-Kontrola\\data\\app.db';
const outputDirectory = process.argv[3] || 'migration-local';

// Ručně ověřené shody podle jména i data narození. Číslo klienta pochází
// z autoritativního registru CECH/MAS, nikoli ze staré lokální aplikace.
const TARGETS = new Map([
  [28, { projectId: 'MAS', clientNumber: 11 }],
  [60, { projectId: 'CECH', clientNumber: 44 }],
  [66, { projectId: 'CECH', clientNumber: 50 }],
  [35, { projectId: 'MAS', clientNumber: 18 }],
  [42, { projectId: 'CECH', clientNumber: 25 }],
  [45, { projectId: 'MAS', clientNumber: 28 }],
  [39, { projectId: 'CECH', clientNumber: 22 }],
  [47, { projectId: 'MAS', clientNumber: 30 }],
  [37, { projectId: 'CECH', clientNumber: 20 }],
  [32, { projectId: 'CECH', clientNumber: 15 }],
  [61, { projectId: 'CECH', clientNumber: 45 }],
  [62, { projectId: 'CECH', clientNumber: 46 }],
  [34, { projectId: 'MAS', clientNumber: 17 }],
  [44, { projectId: 'MAS', clientNumber: 27 }],
  [64, { projectId: 'CECH', clientNumber: 48 }]
]);

const database = new DatabaseSync(sourceDatabase, { readOnly: true });
database.exec('PRAGMA query_only = ON');

const all = (sql, ...params) => database.prepare(sql).all(...params);
const one = (sql, ...params) => database.prepare(sql).get(...params) || null;
const iso = (value) => String(value || '').slice(0, 10);
const text = (value) => String(value || '').trim();
const json = (value, fallback = null) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
};
const list = (value) => {
  const parsed = json(value, null);
  if (Array.isArray(parsed)) return parsed;
  const normalized = text(value);
  return normalized ? [normalized] : [];
};
const stableId = (value) => createHash('sha256')
  .update(String(value || ''))
  .digest('hex')
  .slice(0, 24);
const caseId = (row) => {
  const match = text(row.spisova_znacka).match(/(\d+)\s*INS\s*(\d+)\s*\/\s*(\d{4})/i);
  return match ? `${match[1]}-INS-${match[2]}-${match[3]}` : `legacy-local-${row.id}`;
};
const warnings = (...values) => values.flatMap((value) => {
  const parsed = json(value, []);
  if (Array.isArray(parsed)) {
    return parsed.map((item) => typeof item === 'string' ? item : item?.message || item?.label || '')
      .filter(Boolean);
  }
  return [];
}).slice(0, 20);

function latestStructured(table, localCaseId) {
  return one(
    `SELECT * FROM ${table} WHERE case_id = ? ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 1`,
    localCaseId
  );
}

function buildAnalysis(localCase, migratedCaseId, documentIdByLocalId) {
  const claims = latestStructured('case_claims_review', localCase.id);
  const performance = latestStructured('case_performance_report', localCase.id);
  const completion = latestStructured('case_completion_report', localCase.id);
  const accounting = latestStructured('case_trustee_accounting', localCase.id);
  const extractions = all(
    `SELECT * FROM document_extraction
     WHERE case_id = ? AND status = 'OK'
     ORDER BY COALESCE(extracted_at, updated_at, created_at) DESC`,
    localCase.id
  );
  const changes = all(
    `SELECT created_at, description FROM insolvency_changes
     WHERE client_id = ? ORDER BY created_at ASC LIMIT 80`,
    localCase.client_id
  );
  const documentSummaries = extractions
    .map((item) => ({
      document_id: documentIdByLocalId.get(Number(item.source_document_id)) || '',
      category: text(item.document_type || item.document_family),
      summary: text(item.summary_text).slice(0, 1600)
    }))
    .filter((item) => item.document_id && item.summary)
    .slice(0, 25);

  const hasSavedAi = [
    localCase.ai_raw_result,
    localCase.ai_summary,
    localCase.ai_case_study,
    documentSummaries.length
  ].some(Boolean);
  if (!hasSavedAi) return null;

  const raw = json(localCase.ai_raw_result, {});
  const working = raw?.step_1_working_case_analysis || {};
  const finalStudy = raw?.step_2_final_case_study || {};
  const caseStudy = text(localCase.ai_case_study)
    || text(finalStudy.case_study || finalStudy.text || finalStudy.summary);
  const result = {
    status_now: text(localCase.ai_summary)
      || text(working.current_status || working.summary)
      || text(localCase.last_event_description),
    nearest_deadlines: list(localCase.ai_deadlines).map((item) =>
      typeof item === 'string' ? { date: '', label: item } : item
    ).slice(0, 20),
    advisor_actions: list(localCase.ai_recommended_action).slice(0, 20),
    client_actions: Array.isArray(working.client_actions) ? working.client_actions.slice(0, 20) : [],
    finances: {
      reviewed_claims_count: claims?.reviewed_claims_count ?? localCase.claims_review_count ?? null,
      claims_total_amount: claims?.unsecured_claims_total ?? localCase.claims_total_amount ?? null,
      current_satisfaction_percent: performance?.current_satisfaction_percent
        ?? localCase.current_satisfaction_percent ?? null,
      expected_satisfaction_3y_percent: performance?.expected_satisfaction_3y_percent
        ?? localCase.current_expected_satisfaction_3y_percent ?? null,
      expected_satisfaction_5y_percent: performance?.expected_satisfaction_5y_percent
        ?? localCase.current_expected_satisfaction_5y_percent ?? null,
      trustee_fee_total: accounting?.trustee_total_fee_with_vat ?? null,
      monthly_payment: null,
      summary: [
        text(performance?.payment_source_summary),
        text(accounting?.comment)
      ].filter(Boolean)
    },
    proceeding_evolution: changes.map((item) => ({
      date: iso(item.created_at),
      event: text(item.description)
    })).filter((item) => item.event),
    insolvency_evaluation: text(completion?.course_of_proceeding_summary)
      || text(localCase.latest_trustee_recommendation)
      || text(localCase.ai_category),
    uncertainties: warnings(
      completion?.warnings_json,
      performance?.warnings_json,
      working.uncertainties
    ),
    confidence: text(localCase.evaluation_status)
      || text(claims?.confidence)
      || text(performance?.confidence)
      || text(completion?.confidence)
      || 'přeneseno z lokální aplikace',
    document_summaries: documentSummaries,
    case_study: caseStudy
  };
  return {
    analysis_id: `legacy-local-${migratedCaseId}`,
    case_id: migratedCaseId,
    kind: 'LEGACY_LOCAL_IMPORT',
    document_ids: documentSummaries.map((item) => item.document_id),
    model: text(localCase.ai_model) || 'legacy-local-cache',
    created_at: text(localCase.ai_case_study_at || localCase.ai_checked_at || localCase.updated_at)
      || new Date().toISOString(),
    result
  };
}

const bundles = {
  CECH: { version: 1, source: 'ISIR-Kontrola local SQLite', project_id: 'CECH', entries: [] },
  MAS: { version: 1, source: 'ISIR-Kontrola local SQLite', project_id: 'MAS', entries: [] }
};
const report = {
  generated_at: new Date().toISOString(),
  source_database: sourceDatabase,
  matched: [],
  excluded_or_unmatched: []
};

const localClients = all('SELECT * FROM clients ORDER BY id');
for (const client of localClients) {
  const target = TARGETS.get(Number(client.id));
  const localCases = all('SELECT * FROM insolvency_cases WHERE client_id = ? ORDER BY id', client.id);
  if (!target) {
    if (localCases.length) {
      report.excluded_or_unmatched.push({
        local_client_id: client.id,
        name: `${text(client.first_name)} ${text(client.last_name)}`,
        birth_date: iso(client.birth_date),
        old_project: text(client.project),
        cases: localCases.length
      });
    }
    continue;
  }

  const documents = localCases.flatMap((localCase) =>
    all(
      `SELECT * FROM insolvency_documents
       WHERE case_id = ? AND deleted_at IS NULL
       ORDER BY COALESCE(event_at, created_at), id`,
      localCase.id
    )
  );
  const documentIdByLocalId = new Map(
    documents.map((item) => [Number(item.id), stableId(item.source_url)])
  );
  const migratedCases = localCases.map((item) => {
    const migratedCaseId = caseId(item);
    const caseDocuments = documents.filter((document) => document.case_id === item.id);
    const extractedIds = new Set(all(
      `SELECT source_document_id FROM document_extraction WHERE case_id = ? AND status = 'OK'`,
      item.id
    ).map((row) => Number(row.source_document_id)));
    return {
      case_id: migratedCaseId,
      case_number: text(item.spisova_znacka),
      proceeding_started_at: iso(item.proceeding_started_at || item.started_at),
      proceeding_ended_at: iso(item.ended_at),
      case_status: text(item.state),
      detail_url: text(item.detail_url),
      city: text(item.address),
      document_count: caseDocuments.length,
      main_document_count: caseDocuments.filter((document) => extractedIds.has(Number(document.id))).length,
      secondary_document_count: caseDocuments.filter((document) => !extractedIds.has(Number(document.id))).length,
      last_event_at: iso(item.last_event_at),
      last_event_title: text(item.last_event_description || item.last_event_type),
      claims_deadline: iso(item.claims_deadline),
      claims_count: Number(item.claims_count || item.claims_review_count || 0),
      checked_at: text(item.updated_at || item.ai_checked_at)
    };
  });
  const migratedDocuments = documents.map((item) => ({
    document_id: stableId(item.source_url),
    case_id: caseId(localCases.find((localCase) => localCase.id === item.case_id)),
    title: text(item.title) || 'Dokument ISIR',
    document_type: text(item.document_type) || 'PDF',
    event_date: iso(item.event_at),
    source_url: text(item.source_url),
    is_main: all(
      `SELECT id FROM document_extraction WHERE source_document_id = ? AND status = 'OK' LIMIT 1`,
      item.id
    ).length ? 'Ano' : 'Ne',
    checked_at: text(item.created_at)
  }));
  const analyses = localCases
    .map((item) => buildAnalysis(item, caseId(item), documentIdByLocalId))
    .filter(Boolean);

  bundles[target.projectId].entries.push({
    target_client_number: target.clientNumber,
    source_label: `${text(client.first_name)} ${text(client.last_name)}`,
    source_birth_date: iso(client.birth_date),
    verification: {
      matched: migratedCases.length ? 'Ano' : 'Ne',
      insolvency_date: migratedCases[0]?.proceeding_started_at || '',
      case_number: migratedCases[0]?.case_number || '',
      detail_url: migratedCases[0]?.detail_url || '',
      case_status: migratedCases[0]?.case_status || '',
      verified_at: text(client.last_checked_at) || new Date().toISOString(),
      source: 'LEGACY_LOCAL_IMPORT',
      source_status: migratedCases.length ? 'IMPORTED' : 'NOT_FOUND'
    },
    cases: migratedCases,
    documents: migratedDocuments,
    analyses
  });
  report.matched.push({
    local_client_id: client.id,
    target_project: target.projectId,
    target_client_number: target.clientNumber,
    name: `${text(client.first_name)} ${text(client.last_name)}`,
    birth_date: iso(client.birth_date),
    cases: migratedCases.length,
    documents: migratedDocuments.length,
    analyses: analyses.length
  });
}

mkdirSync(outputDirectory, { recursive: true });
for (const [projectId, bundle] of Object.entries(bundles)) {
  bundle.generated_at = report.generated_at;
  writeFileSync(
    join(outputDirectory, `${projectId.toLowerCase()}-isir-migration.json`),
    JSON.stringify(bundle, null, 2),
    'utf8'
  );
}
writeFileSync(
  join(outputDirectory, 'migration-report.json'),
  JSON.stringify(report, null, 2),
  'utf8'
);
database.close();

console.log(JSON.stringify({
  matched: report.matched.length,
  excluded_or_unmatched: report.excluded_or_unmatched.length,
  CECH: bundles.CECH.entries.length,
  MAS: bundles.MAS.entries.length,
  outputDirectory
}, null, 2));
