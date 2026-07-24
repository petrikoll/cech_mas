const BACKEND_CONFIG = Object.freeze({
  timeZone: 'Europe/Prague',
  registrySheetName: 'Vstupní data',
  legacyClientDataSheetName: 'Klientská Data',
  bridgeSheetName: 'Bridge_Klientská_Data',
  apiTokenProperty: 'API_TOKEN',
  registrySpreadsheetProperty: 'CLIENT_REGISTRY_SPREADSHEET_ID',
  dataSpreadsheetProperty: 'DATA_SPREADSHEET_ID',
  legacySpreadsheetProperty: 'LEGACY_STATS_SPREADSHEET_ID',
  legacyClientRootFolderProperty: 'LEGACY_CLIENT_ROOT_FOLDER_ID',
  cechRootFolderProperty: 'CECH_CLIENT_ROOT_FOLDER_ID',
  masRootFolderProperty: 'MAS_CLIENT_ROOT_FOLDER_ID',
  cechContractTemplateProperty: 'CECH_CONTRACT_TEMPLATE_ID',
  masContractTemplateProperty: 'MAS_CONTRACT_TEMPLATE_ID',
  cechConsentTemplateProperty: 'CECH_CONSENT_TEMPLATE_ID',
  masConsentTemplateProperty: 'MAS_CONSENT_TEMPLATE_ID',
  monitoringListTemplateProperty: 'MONITORING_LIST_TEMPLATE_ID'
});

const PROJECT_CONFIG = Object.freeze({
  CECH: Object.freeze({
    id: 'CECH',
    title: 'Řešení předluženosti na severním Osoblažsku',
    registrationNumber: 'CZ.03.02.01/00/25_106/0006138',
    recipient: 'Osoblažský cech, z.ú.',
    startDate: '2026-03-01',
    endDate: '2028-06-30'
  }),
  MAS: Object.freeze({
    id: 'MAS',
    title: 'Řešení oblasti dluhové problematiky na území MAS',
    registrationNumber: 'CZ.03.02.01/00/25_084/0006297',
    recipient: 'Rozvoj Krnovska o.p.s.',
    partner: 'Osoblažský cech, z.ú.',
    startDate: '2026-03-01',
    endDate: '2028-02-29'
  })
});

const ACTIVITY_CATALOG = Object.freeze({
  A1: Object.freeze({ phaseCode: 'A', title: 'Seznámení klienta s nabídkou služby' }),
  A2: Object.freeze({ phaseCode: 'A', title: 'Základní anamnéza a ověření cílové skupiny' }),
  A3: Object.freeze({ phaseCode: 'A', title: 'Uzavření smlouvy a souhlasu s monitoringem' }),
  A4: Object.freeze({ phaseCode: 'A', title: 'První stabilizační kroky' }),
  B1: Object.freeze({ phaseCode: 'B', title: 'Systematické mapování dluhů a jejich příčin' }),
  B2: Object.freeze({ phaseCode: 'B', title: 'Sestavení přehledu závazků' }),
  B3: Object.freeze({ phaseCode: 'B', title: 'Rozbor příčin dluhů' }),
  C1: Object.freeze({ phaseCode: 'C', title: 'Vyhodnocení nejvhodnějšího řešení' }),
  C2: Object.freeze({ phaseCode: 'C', title: 'Vyjednávání splátkových kalendářů' }),
  C3: Object.freeze({ phaseCode: 'C', title: 'Příprava a podání návrhu na oddlužení' }),
  C4: Object.freeze({ phaseCode: 'C', title: 'Ostatní řešení dluhové situace' }),
  C5: Object.freeze({ phaseCode: 'C', title: 'Komunikace se zaměstnavatelem a zvýšení příjmu' }),
  C6: Object.freeze({ phaseCode: 'C', title: 'Bezpečná digitální komunikace a právní gramotnost' }),
  C7: Object.freeze({ phaseCode: 'C', title: 'Právní poradenství' })
});

const DATA_SHEETS = Object.freeze({
  users: Object.freeze({
    name: 'Users',
    headers: Object.freeze([
      'actor_id', 'display_name', 'role', 'project_ids', 'active', 'created_at', 'updated_at'
    ])
  }),
  clientIndex: Object.freeze({
    name: 'ClientIndex',
    headers: Object.freeze([
      'client_id', 'client_number', 'project_id', 'registry_row', 'status',
      'created_at', 'created_by', 'updated_at', 'updated_by'
    ])
  }),
  clientDocuments: Object.freeze({
    name: 'ClientDocuments',
    headers: Object.freeze([
      'client_id', 'client_number', 'project_id', 'folder_id', 'folder_url',
      'monitoring_list_file_id', 'monitoring_list_url',
      'contract_file_id', 'contract_url', 'consent_file_id', 'consent_url',
      'created_at', 'created_by', 'updated_at', 'updated_by'
    ])
  }),
  paymentPlans: Object.freeze({
    name: 'PaymentPlans',
    headers: Object.freeze([
      'plan_id', 'project_id', 'client_id', 'client_number', 'creditor_type',
      'debt_amount', 'first_payment_month', 'planned_installments',
      'planned_end_month', 'average_payment', 'status',
      'installment_statuses_json', 'notes', 'source_system',
      'created_at', 'created_by', 'updated_at', 'updated_by'
    ])
  }),
  performances: Object.freeze({
    name: 'Performances',
    headers: Object.freeze([
      'performance_id', 'project_id', 'client_id', 'client_number', 'phase_code',
      'activity_codes_json', 'meeting_form', 'date', 'place', 'start_time', 'end_time',
      'duration_minutes', 'case_note', 'worker_id', 'worker_name', 'status',
      'source_system', 'idempotency_key', 'created_at', 'created_by', 'updated_at', 'updated_by',
      'legacy_source_file_id', 'legacy_source_file_name', 'legacy_source_sheet',
      'legacy_source_anchor', 'source_fingerprint', 'source_modified_at', 'imported_at'
    ])
  }),
  legacyImportCache: Object.freeze({
    name: 'LegacyImportCache',
    headers: Object.freeze([
      'legacy_file_id', 'legacy_file_name', 'client_number', 'source_modified_at',
      'last_imported_at', 'status', 'performance_count', 'error'
    ])
  }),
  legacyMap: Object.freeze({
    name: 'LegacyClientMap',
    headers: Object.freeze([
      'legacy_file_id', 'legacy_file_name', 'project_id', 'client_id', 'match_key',
      'mapping_status', 'cutover_date', 'note', 'updated_at', 'updated_by'
    ])
  }),
  audit: Object.freeze({
    name: 'AuditLog',
    headers: Object.freeze([
      'audit_id', 'timestamp', 'actor_id', 'project_id', 'action', 'entity_type',
      'entity_id', 'result', 'details'
    ])
  }),
  counters: Object.freeze({
    name: 'Counters',
    headers: Object.freeze(['counter_name', 'value', 'updated_at'])
  })
});

const REGISTRY_COLUMN = Object.freeze({
  projectId: 0,
  firstName: 1,
  lastName: 2,
  birthDate: 3,
  street: 4,
  houseNumber: 5,
  city: 6,
  postalCode: 7,
  catchmentCity: 8,
  emailOrDatabox: 9,
  phone: 10,
  gender: 11,
  employmentStatus: 12,
  education: 13,
  disadvantage: 14,
  entryDate: 15,
  exitDate: 16,
  exitSituation: 17,
  insolvency: 18,
  paymentSchedule: 19,
  paymentScheduleCount: 20,
  clientNumber: 21,
  employmentProjectFlag: 22
});

const LEGACY_ACTIVITY_CODES = Object.freeze([
  'A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'
]);
