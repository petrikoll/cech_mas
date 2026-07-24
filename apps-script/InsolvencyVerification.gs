const ISIR_CUTOFF_DATE = '2026-03-01';
const ISIR_CUZK_ENDPOINT = 'https://isir.justice.cz:8443/isir_cuzk_ws/IsirWsCuzkService';
const ISIR_DAILY_BATCH_SIZE = 40;
const ISIR_REVERIFY_AFTER_MS = 24 * 60 * 60 * 1000;
const ISIR_REQUEST_DELAY_MS = 1300;
const ISIR_INTERACTIVE_BATCH_SIZE = 1;

function listInsolvencyVerifications_(projectId) {
  const normalizedProjectId = requireProjectId_(projectId);
  return readDataObjects_(DATA_SHEETS.insolvencyVerifications)
    .filter((row) => row.project_id === normalizedProjectId)
    .map((row) => {
      const value = Object.assign({}, row);
      delete value.__rowNumber;
      return value;
    });
}

function listInsolvencyCases_(projectId) {
  const normalizedProjectId = requireProjectId_(projectId);
  return readDataObjects_(DATA_SHEETS.insolvencyCases)
    .filter((row) => row.project_id === normalizedProjectId)
    .map((row) => {
      const value = Object.assign({}, row);
      delete value.__rowNumber;
      return value;
    });
}

function listInsolvencyDocuments_(projectId) {
  const normalizedProjectId = requireProjectId_(projectId);
  return readDataObjects_(DATA_SHEETS.insolvencyDocuments)
    .filter((row) => row.project_id === normalizedProjectId)
    .map((row) => {
      const value = Object.assign({}, row);
      delete value.__rowNumber;
      return value;
    });
}

function listInsolvencyAnalyses_(projectId) {
  const normalizedProjectId = requireProjectId_(projectId);
  return readDataObjects_(DATA_SHEETS.insolvencyAnalyses)
    .filter((row) => row.project_id === normalizedProjectId)
    .map((row) => {
      const value = Object.assign({}, row);
      delete value.__rowNumber;
      return value;
    });
}

function normalizeIsirSourceUrl_(value) {
  const url = normalizeText_(value);
  if (!/^https:\/\/isir\.justice\.cz(?::8443)?\//i.test(url)) {
    throw new Error('Dokument nepochází z povolené adresy ISIR.');
  }
  return url;
}

function saveInsolvencySnapshot_(snapshot, context) {
  const value = snapshot || {};
  const verification = Object.assign({}, value.verification || {});
  const clientId = normalizeText_(verification.client_id);
  const index = getClientIndexById_(clientId);
  if (!index || index.project_id !== context.projectId) {
    throw new Error('Klient pro uložení kontroly ISIR nebyl v projektu nalezen.');
  }

  const timestamp = nowIso_();
  verification.client_id = clientId;
  verification.client_number = Number(index.client_number);
  verification.project_id = context.projectId;
  verification.verified_at = normalizeText_(verification.verified_at) || timestamp;
  verification.verified_by = context.actorId;
  verification.source = normalizeText_(verification.source) || 'ISIR_CUZK_WS_SERVER';
  verification.source_status = normalizeText_(verification.source_status) || 'NOT_FOUND';
  verification.matched = isTruthy_(verification.matched) ? 'Ano' : 'Ne';
  upsertDataObject_(
    DATA_SHEETS.insolvencyVerifications,
    'client_id',
    clientId,
    verification
  );

  const cases = Array.isArray(value.cases) ? value.cases : [];
  const existingCasesById = readDataObjects_(DATA_SHEETS.insolvencyCases).reduce((map, row) => {
    map[String(row.case_id || '')] = row;
    return map;
  }, {});
  const caseRows = cases.map((caseItem) => {
    const caseId = normalizeText_(caseItem.case_id);
    if (!caseId) return null;
    const existingCase = existingCasesById[caseId];
    return {
      case_id: caseId,
      project_id: context.projectId,
      client_id: clientId,
      client_number: Number(index.client_number),
      case_number: normalizeText_(caseItem.case_number),
      proceeding_started_at: normalizeIsirDate_(caseItem.proceeding_started_at),
      proceeding_ended_at: normalizeIsirDate_(caseItem.proceeding_ended_at),
      case_status: normalizeText_(caseItem.case_status),
      detail_url: normalizeText_(caseItem.detail_url),
      city: normalizeText_(caseItem.city),
      document_count: Math.max(0, Number(caseItem.document_count) || 0),
      main_document_count: Math.max(0, Number(caseItem.main_document_count) || 0),
      secondary_document_count: Math.max(0, Number(caseItem.secondary_document_count) || 0),
      last_event_at: normalizeIsirDate_(caseItem.last_event_at),
      last_event_title: normalizeText_(caseItem.last_event_title),
      claims_deadline: normalizeIsirDate_(caseItem.claims_deadline),
      claims_count: Math.max(0, Number(caseItem.claims_count) || 0),
      claims_total_amount: existingCase ? existingCase.claims_total_amount : '',
      ai_status: existingCase ? existingCase.ai_status : '',
      ai_model: existingCase ? existingCase.ai_model : '',
      ai_checked_at: existingCase ? existingCase.ai_checked_at : '',
      ai_summary_json: existingCase ? existingCase.ai_summary_json : '',
      ai_case_study: existingCase ? existingCase.ai_case_study : '',
      ai_case_study_at: existingCase ? existingCase.ai_case_study_at : '',
      checked_at: normalizeText_(caseItem.checked_at) || timestamp,
      updated_at: timestamp,
      updated_by: context.actorId
    };
  }).filter(Boolean);
  bulkUpsertDataObjects_(DATA_SHEETS.insolvencyCases, 'case_id', caseRows);

  const documents = Array.isArray(value.documents) ? value.documents : [];
  const existingDocumentsById = readDataObjects_(DATA_SHEETS.insolvencyDocuments).reduce((map, row) => {
    map[String(row.document_id || '')] = row;
    return map;
  }, {});
  const documentRows = documents.map((documentItem) => {
    const documentId = normalizeText_(documentItem.document_id);
    const caseId = normalizeText_(documentItem.case_id);
    if (!documentId || !caseId) return null;
    const existing = existingDocumentsById[documentId];
    return {
      document_id: documentId,
      case_id: caseId,
      project_id: context.projectId,
      client_id: clientId,
      title: normalizeText_(documentItem.title) || 'Dokument ISIR',
      document_type: normalizeText_(documentItem.document_type) || 'PDF',
      event_date: normalizeIsirDate_(documentItem.event_date),
      source_url: normalizeIsirSourceUrl_(documentItem.source_url),
      is_main: isTruthy_(documentItem.is_main) ? 'Ano' : 'Ne',
      is_new: existing ? existing.is_new : 'Ano',
      included_in_case_study: existing ? existing.included_in_case_study : '',
      analysis_status: existing ? existing.analysis_status : '',
      analysis_json: existing ? existing.analysis_json : '',
      analysis_at: existing ? existing.analysis_at : '',
      drive_file_id: existing ? existing.drive_file_id : '',
      drive_url: existing ? existing.drive_url : '',
      original_size: existing ? existing.original_size : '',
      stored_size: existing ? existing.stored_size : '',
      checked_at: normalizeText_(documentItem.checked_at) || timestamp,
      updated_at: timestamp,
      updated_by: context.actorId
    };
  }).filter(Boolean);
  bulkUpsertDataObjects_(DATA_SHEETS.insolvencyDocuments, 'document_id', documentRows);

  writeAudit_(
    context,
    'SAVE_ISIR_SNAPSHOT',
    'CLIENT',
    clientId,
    'OK',
    'cases=' + cases.length + ';documents=' + documents.length
  );
  return {
    verification: verification,
    cases: listInsolvencyCases_(context.projectId).filter((item) => item.client_id === clientId),
    documents: listInsolvencyDocuments_(context.projectId).filter((item) => item.client_id === clientId)
  };
}

function archiveIsirDocument_(documentId, context) {
  const normalizedDocumentId = normalizeText_(documentId);
  const documentRow = readDataObjects_(DATA_SHEETS.insolvencyDocuments)
    .find((row) => String(row.document_id || '') === normalizedDocumentId);
  if (!documentRow || documentRow.project_id !== context.projectId) {
    throw new Error('Dokument ISIR nebyl v projektu nalezen.');
  }
  const existingFile = getDriveFileByIdOrNull_(documentRow.drive_file_id);
  if (existingFile) return Object.assign({}, documentRow, {
    drive_file_id: existingFile.getId(),
    drive_url: existingFile.getUrl()
  });

  const clientDocumentRow = getClientDocumentRow_(documentRow.client_id);
  const clientFolder = getDriveFolderByIdOrNull_(clientDocumentRow && clientDocumentRow.folder_id);
  if (!clientFolder) throw new Error('Klient nemá založenou složku na Google Disku.');
  const isirFolder = ensureSubfolder_(clientFolder, 'ISIR');
  const sourceUrl = normalizeIsirSourceUrl_(documentRow.source_url);
  const response = UrlFetchApp.fetch(sourceUrl, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'CECH-MAS-Vykaznictvi/1.0' }
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('Stažení dokumentu z ISIR selhalo (HTTP ' + response.getResponseCode() + ').');
  }
  const originalBlob = response.getBlob();
  const safeTitle = (normalizeText_(documentRow.title) || 'Dokument ISIR')
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 140);
  const fileName = /\.pdf$/i.test(safeTitle) ? safeTitle : safeTitle + '.pdf';
  const existingByName = firstFileByName_(isirFolder, fileName);
  const driveFile = existingByName || isirFolder.createFile(originalBlob.setName(fileName));
  const timestamp = nowIso_();
  const stored = Object.assign({}, documentRow, {
    drive_file_id: driveFile.getId(),
    drive_url: driveFile.getUrl(),
    original_size: originalBlob.getBytes().length,
    stored_size: driveFile.getSize(),
    updated_at: timestamp,
    updated_by: context.actorId
  });
  delete stored.__rowNumber;
  upsertDataObject_(DATA_SHEETS.insolvencyDocuments, 'document_id', normalizedDocumentId, stored);
  writeAudit_(context, 'ARCHIVE_ISIR_DOCUMENT', 'ISIR_DOCUMENT', normalizedDocumentId, 'OK', fileName);
  return stored;
}

function saveInsolvencyAnalysis_(analysisInput, context) {
  const input = analysisInput || {};
  const caseId = normalizeText_(input.case_id);
  const clientId = normalizeText_(input.client_id);
  const analysisId = normalizeText_(input.analysis_id) || Utilities.getUuid();
  const caseRow = readDataObjects_(DATA_SHEETS.insolvencyCases)
    .find((row) => String(row.case_id || '') === caseId);
  if (!caseRow || caseRow.project_id !== context.projectId || caseRow.client_id !== clientId) {
    throw new Error('Řízení pro uložení AI analýzy nebylo v projektu nalezeno.');
  }

  const result = input.result && typeof input.result === 'object' ? input.result : {};
  const caseStudy = normalizeText_(result.case_study).slice(0, 45000);
  const summary = Object.assign({}, result);
  delete summary.case_study;
  const resultJson = JSON.stringify(summary);
  if (resultJson.length > 45000) {
    throw new Error('AI analýza je příliš rozsáhlá pro bezpečné uložení.');
  }
  const documentIds = Array.isArray(input.document_ids)
    ? input.document_ids.map(normalizeText_).filter(Boolean)
    : [];
  const timestamp = nowIso_();
  const row = {
    analysis_id: analysisId,
    case_id: caseId,
    project_id: context.projectId,
    client_id: clientId,
    kind: normalizeText_(input.kind) || 'CASE_DOCUMENT_ANALYSIS',
    document_ids_json: JSON.stringify(documentIds),
    result_json: resultJson,
    model: normalizeText_(input.model) || 'gemini-2.5-flash',
    created_at: normalizeText_(input.created_at) || timestamp,
    created_by: context.actorId,
    updated_at: timestamp,
    updated_by: context.actorId
  };
  upsertDataObject_(DATA_SHEETS.insolvencyAnalyses, 'analysis_id', analysisId, row);

  const finance = summary.finances && typeof summary.finances === 'object' ? summary.finances : {};
  updateDataObjectAtRow_(DATA_SHEETS.insolvencyCases, caseRow.__rowNumber, Object.assign({}, caseRow, {
    claims_count: Number(finance.reviewed_claims_count) || caseRow.claims_count || 0,
    claims_total_amount: Number(finance.claims_total_amount) || caseRow.claims_total_amount || '',
    ai_status: 'OK',
    ai_model: row.model,
    ai_checked_at: timestamp,
    ai_summary_json: resultJson,
    ai_case_study: caseStudy,
    ai_case_study_at: timestamp,
    updated_at: timestamp,
    updated_by: context.actorId
  }));

  const documentSummaries = Array.isArray(summary.document_summaries)
    ? summary.document_summaries
    : [];
  const caseDocumentsById = readDataObjects_(DATA_SHEETS.insolvencyDocuments)
    .filter((item) => item.case_id === caseId)
    .reduce((map, row) => {
      map[String(row.document_id || '')] = row;
      return map;
    }, {});
  const analyzedDocumentRows = documentSummaries.map((documentSummary) => {
    const documentId = normalizeText_(documentSummary.document_id);
    const documentRow = caseDocumentsById[documentId];
    if (!documentRow) return null;
    const updatedRow = Object.assign({}, documentRow, {
      included_in_case_study: 'Ano',
      analysis_status: 'OK',
      analysis_json: JSON.stringify(documentSummary).slice(0, 45000),
      analysis_at: timestamp,
      is_new: 'Ne',
      updated_at: timestamp,
      updated_by: context.actorId
    });
    delete updatedRow.__rowNumber;
    return updatedRow;
  }).filter(Boolean);
  bulkUpsertDataObjects_(
    DATA_SHEETS.insolvencyDocuments,
    'document_id',
    analyzedDocumentRows
  );

  writeAudit_(context, 'SAVE_ISIR_ANALYSIS', 'ISIR_CASE', caseId, 'OK',
    'documents=' + documentIds.length + ';model=' + row.model);
  return {
    analysis: row,
    case: listInsolvencyCases_(context.projectId).find((item) => item.case_id === caseId),
    documents: listInsolvencyDocuments_(context.projectId).filter((item) => item.case_id === caseId)
  };
}

function markIsirDocumentsSeen_(caseIdInput, context) {
  const caseId = normalizeText_(caseIdInput);
  const caseRow = readDataObjects_(DATA_SHEETS.insolvencyCases)
    .find((row) => String(row.case_id || '') === caseId);
  if (!caseRow || caseRow.project_id !== context.projectId) {
    throw new Error('Řízení nebylo v projektu nalezeno.');
  }
  const timestamp = nowIso_();
  const updated = [];
  readDataObjects_(DATA_SHEETS.insolvencyDocuments)
    .filter((row) => row.case_id === caseId && row.project_id === context.projectId)
    .forEach((row) => {
      const value = Object.assign({}, row, {
        is_new: 'Ne',
        updated_at: timestamp,
        updated_by: context.actorId
      });
      delete value.__rowNumber;
      updateDataObjectAtRow_(DATA_SHEETS.insolvencyDocuments, row.__rowNumber, value);
      updated.push(value);
    });
  return updated;
}

function readLegacyIsirMigrationFile_(fileIdInput, context) {
  const fileId = normalizeText_(fileIdInput);
  const file = getDriveFileByIdOrNull_(fileId);
  if (!file) throw new Error('Importní soubor ISIR nebyl na Google Disku nalezen.');
  const expectedFileName = context.projectId.toLowerCase() + '-isir-migration.json';
  if (file.getName() !== expectedFileName) {
    throw new Error('Importní soubor nepatří aktivnímu projektu.');
  }
  const parents = file.getParents();
  let allowedParent = false;
  while (parents.hasNext()) {
    if (parents.next().getName() === 'ISIR-Kontrola – archiv lokální aplikace') {
      allowedParent = true;
      break;
    }
  }
  if (!allowedParent) {
    throw new Error('Importní soubor není uložen v povolené archivní složce.');
  }

  let bundle;
  try {
    bundle = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  } catch (error) {
    throw new Error('Importní soubor ISIR není platný JSON.');
  }
  if (
    Number(bundle.version) !== 1 ||
    normalizeProjectId_(bundle.project_id) !== context.projectId ||
    !Array.isArray(bundle.entries)
  ) {
    throw new Error('Importní balíček ISIR má neplatnou strukturu nebo projekt.');
  }
  writeAudit_(
    context,
    'READ_LEGACY_ISIR_IMPORT',
    'DRIVE_FILE',
    fileId,
    'OK',
    'entries=' + bundle.entries.length
  );
  return bundle;
}

function escapeXmlText_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildIsirSoapRequest_(client) {
  return [
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:typ="http://isirws.cca.cz/types/">',
    '<soapenv:Header/>',
    '<soapenv:Body>',
    '<typ:getIsirWsCuzkDataRequest>',
    '<nazevOsoby>' + escapeXmlText_(client.prijmeni) + '</nazevOsoby>',
    '<jmeno>' + escapeXmlText_(client.jmeno) + '</jmeno>',
    '<datumNarozeni>' + escapeXmlText_(client.datum_narozeni) + '</datumNarozeni>',
    '<maxPocetVysledku>20</maxPocetVysledku>',
    '<filtrAktualniRizeni>F</filtrAktualniRizeni>',
    '<vyhledatPresnouShoduJmen>T</vyhledatPresnouShoduJmen>',
    '<vyhledatBezDiakritiky>T</vyhledatBezDiakritiky>',
    '<maxRelevanceVysledku>4</maxRelevanceVysledku>',
    '</typ:getIsirWsCuzkDataRequest>',
    '</soapenv:Body>',
    '</soapenv:Envelope>'
  ].join('');
}

function findDescendantText_(element, localName) {
  if (!element) return '';
  if (element.getName() === localName) return String(element.getText() || '').trim();
  const children = element.getChildren();
  for (let index = 0; index < children.length; index += 1) {
    const value = findDescendantText_(children[index], localName);
    if (value) return value;
  }
  return '';
}

function collectIsirResultElements_(element, results) {
  if (!element) return;
  const childNames = element.getChildren().map((child) => child.getName());
  if (childNames.indexOf('datumPmZahajeniUpadku') >= 0) results.push(element);
  element.getChildren().forEach((child) => collectIsirResultElements_(child, results));
}

function normalizeIsirDate_(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function isIsirEntryOnOrAfter_(value, cutoffDate) {
  const date = normalizeIsirDate_(value);
  return Boolean(date && date >= String(cutoffDate || ISIR_CUTOFF_DATE));
}

function parseIsirResponse_(xmlText) {
  const document = XmlService.parse(xmlText);
  const resultElements = [];
  collectIsirResultElements_(document.getRootElement(), resultElements);
  return resultElements.map((element) => {
    const senate = findDescendantText_(element, 'cisloSenatu');
    const caseType = findDescendantText_(element, 'druhVec') || 'INS';
    const caseNumber = findDescendantText_(element, 'bcVec');
    const year = findDescendantText_(element, 'rocnik');
    return {
      insolvencyDate: normalizeIsirDate_(findDescendantText_(element, 'datumPmZahajeniUpadku')),
      caseNumber: [senate, caseType, caseNumber, '/', year].filter(Boolean).join(' ').replace(' / ', '/'),
      detailUrl: findDescendantText_(element, 'urlDetailRizeni'),
      caseStatus: findDescendantText_(element, 'druhStavKonkursu'),
      relevance: Number(findDescendantText_(element, 'relevanceVysledku') || 99),
      additionalDebtor: findDescendantText_(element, 'dalsiDluznikVRizeni')
    };
  }).filter((item) => item.relevance <= 4 && item.additionalDebtor !== 'T');
}

function verifyClientInsolvency_(clientId, context) {
  const index = getClientIndexById_(clientId);
  if (!index || index.project_id !== context.projectId) throw new Error('Klient nebyl v projektu nalezen.');
  const rows = getRegistryRows_();
  const row = rows[Number(index.registry_row) - 2];
  if (!row) throw new Error('Klientský řádek nebyl nalezen.');
  const client = registryRowToClient_(row, Number(index.registry_row));
  if (!client || !client.jmeno || !client.prijmeni || !client.datum_narozeni) {
    throw new Error('Pro ověření ISIR je nutné jméno, příjmení a datum narození klienta.');
  }

  const response = UrlFetchApp.fetch(ISIR_CUZK_ENDPOINT, {
    method: 'post',
    contentType: 'text/xml; charset=utf-8',
    payload: buildIsirSoapRequest_(client),
    muteHttpExceptions: true,
    headers: { SOAPAction: 'getIsirWsCuzkData' }
  });
  const responseCode = response.getResponseCode();
  if (responseCode < 200 || responseCode >= 300) {
    throw new Error('ISIR neodpověděl úspěšně (HTTP ' + responseCode + ').');
  }

  const results = parseIsirResponse_(response.getContentText());
  const qualifying = results
    .filter((item) => isIsirEntryOnOrAfter_(item.insolvencyDate, ISIR_CUTOFF_DATE))
    .sort((left, right) => left.insolvencyDate.localeCompare(right.insolvencyDate))[0] || null;
  const latestFound = results
    .filter((item) => item.insolvencyDate)
    .sort((left, right) => right.insolvencyDate.localeCompare(left.insolvencyDate))[0] || null;
  const timestamp = nowIso_();
  const verification = {
    client_id: clientId,
    client_number: Number(index.client_number),
    project_id: context.projectId,
    matched: qualifying ? 'Ano' : 'Ne',
    insolvency_date: qualifying ? qualifying.insolvencyDate : '',
    case_number: qualifying ? qualifying.caseNumber : latestFound ? latestFound.caseNumber : '',
    detail_url: qualifying ? qualifying.detailUrl : latestFound ? latestFound.detailUrl : '',
    case_status: qualifying ? qualifying.caseStatus : latestFound ? latestFound.caseStatus : '',
    verified_at: timestamp,
    verified_by: context.actorId,
    source: 'ISIR_CUZK_WS',
    source_status: qualifying ? 'QUALIFIED' : results.length ? 'BEFORE_CUTOFF' : 'NOT_FOUND'
  };
  upsertDataObject_(DATA_SHEETS.insolvencyVerifications, 'client_id', clientId, verification);
  writeAudit_(context, 'VERIFY_ISIR', 'CLIENT', clientId, 'OK',
    'matched=' + verification.matched + '; date=' + verification.insolvency_date);
  return verification;
}

function verifyProjectInsolvenciesBatch_(context, options) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const input = options || {};
    const offset = Math.max(0, Number(input.offset) || 0);
    const indexByNumber = readDataObjects_(DATA_SHEETS.clientIndex).reduce((map, row) => {
      map[String(Number(row.client_number))] = row;
      return map;
    }, {});
    const projectClients = getRegistryRows_()
      .map((row, index) => registryRowToClient_(row, index + 2, indexByNumber))
      .filter((client) => client && client.project_id === context.projectId)
      .sort((left, right) => Number(left.client_number) - Number(right.client_number));
    const eligibleClients = projectClients.filter((client) =>
      client.klient_id && client.jmeno && client.prijmeni && client.datum_narozeni
    );
    // Hromadná kontrola z aplikace zpracovává jednoho klienta na jeden HTTP
    // požadavek. Prohlížeč tak dostane průběžnou odpověď a dlouhý dotaz
    // neskončí chybou brány dříve, než lze zobrazit výsledek.
    const candidates = eligibleClients.slice(offset, offset + ISIR_INTERACTIVE_BATCH_SIZE);
    const verifications = [];
    const errors = [];
    let failed = 0;

    candidates.forEach((client) => {
      try {
        verifications.push(verifyClientInsolvency_(client.klient_id, context));
      } catch (error) {
        failed += 1;
        errors.push({
          client_id: client.klient_id,
          client_number: client.client_number,
          message: String(error && error.message ? error.message : error)
        });
        writeAudit_(context, 'VERIFY_ISIR', 'CLIENT', client.klient_id, 'ERROR', error.message);
      }
    });

    const processedTo = offset + candidates.length;
    return {
      ok: true,
      project_id: context.projectId,
      totalClients: projectClients.length,
      totalEligible: eligibleClients.length,
      missingIdentity: projectClients.length - eligibleClients.length,
      checked: candidates.length,
      verified: verifications.length,
      matched: verifications.filter((item) => isTruthy_(item.matched)).length,
      failed,
      processedClientNumber: candidates.length ? Number(candidates[0].client_number) : null,
      nextOffset: processedTo < eligibleClients.length ? processedTo : null,
      verifications,
      errors
    };
  } finally {
    lock.releaseLock();
  }
}

function installDailyInsolvencyVerificationTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'scheduledDailyInsolvencyVerification')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('scheduledDailyInsolvencyVerification')
    .timeBased()
    .everyHours(1)
    .create();

  return {
    ok: true,
    message: 'Denní ověřování ISIR bylo zapnuto. Hodinová dávka zpracuje pouze klienty bez ověření za posledních 24 hodin.'
  };
}

function scheduledDailyInsolvencyVerification() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: false, skipped: true, reason: 'LOCKED' };
  try {
    const now = Date.now();
    const verificationByClientId = readDataObjects_(DATA_SHEETS.insolvencyVerifications)
      .reduce((map, row) => {
        map[String(row.client_id || '')] = row;
        return map;
      }, {});
    const indexByNumber = readDataObjects_(DATA_SHEETS.clientIndex).reduce((map, row) => {
      map[String(Number(row.client_number))] = row;
      return map;
    }, {});
    const candidates = getRegistryRows_()
      .map((row, index) => registryRowToClient_(row, index + 2, indexByNumber))
      .filter((client) => {
        if (!client || !client.klient_id || !client.jmeno || !client.prijmeni || !client.datum_narozeni) return false;
        const previous = verificationByClientId[String(client.klient_id)];
        const verifiedAt = previous ? Date.parse(String(previous.verified_at || '')) : 0;
        return !verifiedAt || now - verifiedAt >= ISIR_REVERIFY_AFTER_MS;
      })
      .sort((left, right) => {
        const leftVerified = Date.parse(String(verificationByClientId[left.klient_id]?.verified_at || '')) || 0;
        const rightVerified = Date.parse(String(verificationByClientId[right.klient_id]?.verified_at || '')) || 0;
        return leftVerified - rightVerified;
      })
      .slice(0, ISIR_DAILY_BATCH_SIZE);

    let verified = 0;
    let failed = 0;
    candidates.forEach((client, index) => {
      if (index > 0) Utilities.sleep(ISIR_REQUEST_DELAY_MS);
      const context = {
        actorId: 'SYSTEM_ISIR',
        displayName: 'Automatické ověření ISIR',
        role: 'SYSTEM',
        projectId: client.project_id
      };
      try {
        verifyClientInsolvency_(client.klient_id, context);
        verified += 1;
      } catch (error) {
        failed += 1;
        writeAudit_(context, 'VERIFY_ISIR', 'CLIENT', client.klient_id, 'ERROR', error.message);
      }
    });

    return {
      ok: true,
      candidates: candidates.length,
      verified,
      failed,
      remainingForNextBatch: Math.max(0, getRegistryRows_().length - candidates.length)
    };
  } finally {
    lock.releaseLock();
  }
}
