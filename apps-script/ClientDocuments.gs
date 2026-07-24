const CLIENT_FOLDER_SUBFOLDERS = Object.freeze([
  '1_Jednání se zájemcem o službu',
  '2_Mapování závazků a příčin předlužení',
  '3_Hledání, příprava a realizace řešení'
]);

function getClientDocumentRow_(clientId) {
  const normalizedClientId = String(clientId || '').trim();
  return readDataObjects_(DATA_SHEETS.clientDocuments).find((row) =>
    String(row.client_id || '').trim() === normalizedClientId
  ) || null;
}

function addClientDocumentLinks_(client, documentRow) {
  if (!client || !documentRow) return client;
  return Object.assign({}, client, {
    drive_folder_url: normalizeText_(documentRow.folder_url),
    monitoring_list_url: normalizeText_(documentRow.monitoring_list_url),
    contract_url: normalizeText_(documentRow.contract_url),
    consent_url: normalizeText_(documentRow.consent_url)
  });
}

function getDriveFileByIdOrNull_(fileId) {
  if (!fileId) return null;
  try {
    return DriveApp.getFileById(String(fileId));
  } catch (error) {
    return null;
  }
}

function getDriveFolderByIdOrNull_(folderId) {
  if (!folderId) return null;
  try {
    return DriveApp.getFolderById(String(folderId));
  } catch (error) {
    return null;
  }
}

function firstFolderByName_(parentFolder, name) {
  const folders = parentFolder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : null;
}

function firstFileByName_(folder, name) {
  const files = folder.getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}

function ensureSubfolder_(parentFolder, name) {
  return firstFolderByName_(parentFolder, name) || parentFolder.createFolder(name);
}

function ensureTemplateCopy_(folder, storedFileId, destinationName, templateFile) {
  const storedFile = getDriveFileByIdOrNull_(storedFileId);
  if (storedFile) return storedFile;
  const existingFile = firstFileByName_(folder, destinationName);
  return existingFile || templateFile.makeCopy(destinationName, folder);
}

function getClientDocumentConfiguration_(projectId) {
  const normalizedProjectId = requireProjectId_(projectId);
  const isCech = normalizedProjectId === 'CECH';
  const rootFolderProperty = isCech
    ? BACKEND_CONFIG.cechRootFolderProperty
    : BACKEND_CONFIG.masRootFolderProperty;
  const contractTemplateProperty = isCech
    ? BACKEND_CONFIG.cechContractTemplateProperty
    : BACKEND_CONFIG.masContractTemplateProperty;
  const consentTemplateProperty = isCech
    ? BACKEND_CONFIG.cechConsentTemplateProperty
    : BACKEND_CONFIG.masConsentTemplateProperty;

  return {
    rootFolder: DriveApp.getFolderById(getRequiredScriptProperty_(rootFolderProperty)),
    monitoringTemplate: DriveApp.getFileById(
      getRequiredScriptProperty_(BACKEND_CONFIG.monitoringListTemplateProperty)
    ),
    contractTemplate: DriveApp.getFileById(getRequiredScriptProperty_(contractTemplateProperty)),
    consentTemplate: DriveApp.getFileById(getRequiredScriptProperty_(consentTemplateProperty))
  };
}

function buildClientFolderName_(client) {
  const number = Number(client.client_number);
  const fullName = normalizeText_([client.jmeno, client.prijmeni].filter(Boolean).join(' '));
  if (!Number.isInteger(number) || number <= 0 || !fullName) {
    throw new Error('Klient nemá platné číslo nebo jméno pro založení složky.');
  }
  return String(number) + '_' + fullName.replace(/[\\/:*?"<>|]/g, '-');
}

function ensureClientFolder_(clientId, context) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const index = getClientIndexById_(clientId);
    if (!index) throw new Error('Klient nebyl nalezen.');
    if (requireProjectId_(index.project_id) !== context.projectId) {
      throw new Error('Klient nepatří do zvoleného projektu.');
    }

    const registryRows = getRegistryRows_();
    const registryRow = registryRows[Number(index.registry_row) - 2];
    const client = registryRowToClient_(registryRow, Number(index.registry_row), index);
    if (!client) throw new Error('Klientský řádek nebyl nalezen.');
    client.klient_id = index.client_id;

    // Resolve all resources before creating anything, so missing configuration
    // cannot leave a newly created client folder half empty.
    const configuration = getClientDocumentConfiguration_(context.projectId);
    const existing = getClientDocumentRow_(index.client_id);
    const folderName = buildClientFolderName_(client);
    let clientFolder = getDriveFolderByIdOrNull_(existing && existing.folder_id);
    if (!clientFolder) {
      clientFolder = firstFolderByName_(configuration.rootFolder, folderName) ||
        configuration.rootFolder.createFolder(folderName);
    }

    CLIENT_FOLDER_SUBFOLDERS.forEach((name) => ensureSubfolder_(clientFolder, name));
    const monitoringList = ensureTemplateCopy_(
      clientFolder,
      existing && existing.monitoring_list_file_id,
      'Monitorovaci_list.xlsm',
      configuration.monitoringTemplate
    );
    const contract = ensureTemplateCopy_(
      clientFolder,
      existing && existing.contract_file_id,
      'SMLOUVA.docx',
      configuration.contractTemplate
    );
    const consent = ensureTemplateCopy_(
      clientFolder,
      existing && existing.consent_file_id,
      'SOUHLAS.docx',
      configuration.consentTemplate
    );

    const timestamp = nowIso_();
    const value = {
      client_id: index.client_id,
      client_number: Number(index.client_number),
      project_id: context.projectId,
      folder_id: clientFolder.getId(),
      folder_url: clientFolder.getUrl(),
      monitoring_list_file_id: monitoringList.getId(),
      monitoring_list_url: monitoringList.getUrl(),
      contract_file_id: contract.getId(),
      contract_url: contract.getUrl(),
      consent_file_id: consent.getId(),
      consent_url: consent.getUrl(),
      created_at: existing ? existing.created_at : timestamp,
      created_by: existing ? existing.created_by : context.actorId,
      updated_at: timestamp,
      updated_by: context.actorId
    };
    upsertDataObject_(DATA_SHEETS.clientDocuments, 'client_id', index.client_id, value);
    writeAudit_(
      context,
      existing ? 'ENSURE' : 'CREATE',
      'CLIENT_DOCUMENTS',
      index.client_id,
      'OK',
      'folder=ready;monitoring_list=ready;contract=ready;consent=ready'
    );
    return addClientDocumentLinks_(client, value);
  } catch (error) {
    writeAudit_(context, 'ENSURE', 'CLIENT_DOCUMENTS', clientId, 'ERROR', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function debtMappingText_(value, maxLength) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength || 20000);
}

function debtMappingArray_(value, maxItems) {
  return Array.isArray(value)
    ? value.filter(Boolean).slice(0, maxItems || 50)
    : [];
}

function formatDebtMappingAmount_(value) {
  const amount = Number(value);
  if (!isFinite(amount)) return 'Neuvedeno';
  const fixed = amount.toFixed(2).replace('.', ',');
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';
}

function appendDebtMappingSection_(body, heading, textValue) {
  const value = debtMappingText_(textValue);
  if (!value) return;
  body.appendParagraph(heading).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(value);
}

function appendDebtMappingList_(body, heading, items) {
  const values = debtMappingArray_(items, 50)
    .map((item) => debtMappingText_(item, 3000))
    .filter(Boolean);
  if (!values.length) return;
  body.appendParagraph(heading).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  values.forEach((item) => body.appendListItem(item).setGlyphType(DocumentApp.GlyphType.BULLET));
}

function normalizeDebtMappingDocument_(input) {
  const document = input && typeof input === 'object' ? input : {};
  const obligations = debtMappingArray_(document.obligations, 60)
    .map((item) => ({
      creditor: debtMappingText_(item && item.creditor, 500),
      amount: Number(item && item.amount),
      status: debtMappingText_(item && item.status, 500),
      source: debtMappingText_(item && item.source, 120),
      evidence: debtMappingText_(item && item.evidence, 2000)
    }))
    .filter((item) => item.creditor && item.evidence);

  const normalized = {
    title: 'Mapování závazků a příčin předlužení',
    overallSummary: debtMappingText_(document.overallSummary),
    clientSituation: debtMappingText_(document.clientSituation),
    obligations: obligations,
    isirSummary: debtMappingText_(document.isirSummary),
    causes: debtMappingArray_(document.causes, 40),
    risks: debtMappingArray_(document.risks, 40),
    recommendedSteps: debtMappingArray_(document.recommendedSteps, 40),
    missingInformation: debtMappingArray_(document.missingInformation, 40),
    sourcesUsed: debtMappingArray_(document.sourcesUsed, 10)
  };
  if (!normalized.overallSummary || !normalized.clientSituation) {
    throw new Error('Dokument mapování neobsahuje povinné části.');
  }
  return normalized;
}

function findGoogleDocumentByName_(folder, name) {
  const files = folder.getFilesByName(name);
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_DOCS) return file;
  }
  return null;
}

function listDebtMappings_(projectId) {
  const normalizedProjectId = requireProjectId_(projectId);
  return readDataObjects_(DATA_SHEETS.debtMappings)
    .filter((row) =>
      requireProjectId_(row.project_id) === normalizedProjectId &&
      String(row.status || '').toUpperCase() !== 'DELETED'
    )
    .map((row) => {
      const result = Object.assign({}, row);
      delete result.__rowNumber;
      return result;
    });
}

function debtMappingDateValue_(value) {
  const normalized = normalizeIsoDate_(value);
  return normalized ? new Date(normalized + 'T12:00:00') : null;
}

function debtMappingPreviousDay_(value) {
  const date = debtMappingDateValue_(value);
  if (!date) return '';
  date.setDate(date.getDate() - 1);
  return Utilities.formatDate(date, BACKEND_CONFIG.timeZone, 'yyyy-MM-dd');
}

function debtMappingOneMonthAfter_(value) {
  const date = debtMappingDateValue_(value);
  if (!date) return '';
  date.setMonth(date.getMonth() + 1);
  return Utilities.formatDate(date, BACKEND_CONFIG.timeZone, 'yyyy-MM-dd');
}

function resolveDebtMappingTimeline_(clientId) {
  const clientKey = String(clientId || '').trim();
  const performances = readDataObjects_(DATA_SHEETS.performances)
    .filter((row) =>
      String(row.client_id || '').trim() === clientKey &&
      String(row.status || '').toUpperCase() !== 'DELETED'
    )
    .map((row) => {
      let activities = [];
      try {
        activities = JSON.parse(String(row.activity_codes_json || '[]'));
      } catch (error) {
        activities = String(row.activity_codes_json || '').split(/[;,]/);
      }
      return {
        date: normalizeIsoDate_(row.date),
        activities: Array.isArray(activities)
          ? activities.map((item) => String(item || '').trim().toUpperCase())
          : []
      };
    })
    .filter((item) => item.date)
    .sort((left, right) => left.date.localeCompare(right.date));

  const firstSupportDate = performances.length ? performances[0].date : '';
  const firstMappingDate = performances.find((item) =>
    item.activities.some((code) => ['B1', 'B2', 'B3'].includes(code))
  );
  const firstFilingPerformance = performances.find((item) => item.activities.includes('C3'));
  const firstCase = readDataObjects_(DATA_SHEETS.insolvencyCases)
    .filter((row) => String(row.client_id || '').trim() === clientKey)
    .map((row) => normalizeIsoDate_(row.proceeding_started_at))
    .filter(Boolean)
    .sort()[0] || '';
  const filingDates = [
    firstFilingPerformance && firstFilingPerformance.date,
    firstCase
  ].filter(Boolean).sort();
  const filingDate = filingDates[0] || '';

  let activityDate = firstMappingDate && firstMappingDate.date
    ? firstMappingDate.date
    : firstSupportDate || todayIso_();
  let basis = firstMappingDate
    ? 'První výkon mapování B1–B3'
    : firstSupportDate
      ? 'První evidovaná podpora'
      : 'Datum vytvoření dokumentu';

  const firstSupportDeadline = debtMappingOneMonthAfter_(firstSupportDate);
  if (firstSupportDeadline && activityDate > firstSupportDeadline) {
    activityDate = firstSupportDeadline;
    basis = 'Nejpozději jeden měsíc od první evidované podpory';
  }
  if (filingDate && activityDate >= filingDate) {
    activityDate = debtMappingPreviousDay_(filingDate);
    basis = 'Den před prvním podáním oddlužení / zahájením řízení';
  }
  return {
    activityDate: activityDate,
    basis: basis,
    firstSupportDate: firstSupportDate,
    filingDate: filingDate
  };
}

function debtMappingDocumentText_(document) {
  const lines = [
    document.overallSummary,
    '',
    'Sociální a finanční situace',
    document.clientSituation
  ];
  if (document.isirSummary) {
    lines.push('', 'Souhrn údajů z ISIR', document.isirSummary);
  }
  if (document.causes.length) {
    lines.push('', 'Příčiny předlužení a oblasti k ověření');
    document.causes.forEach((item) => lines.push('• ' + debtMappingText_(item, 3000)));
  }
  if (document.recommendedSteps.length) {
    lines.push('', 'Doporučené navazující kroky');
    document.recommendedSteps.forEach((item) => lines.push('• ' + debtMappingText_(item, 3000)));
  }
  return lines.join('\n').trim().slice(0, 45000);
}

function saveDebtMappingDocument_(clientId, inputDocument, metadata, context) {
  const document = normalizeDebtMappingDocument_(inputDocument);
  const documentMetadata = metadata && typeof metadata === 'object' ? metadata : {};

  // Zajistí klientskou složku i při prvním použití této funkce.
  ensureClientFolder_(clientId, context);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const index = getClientIndexById_(clientId);
    if (!index) throw new Error('Klient nebyl nalezen.');
    if (requireProjectId_(index.project_id) !== context.projectId) {
      throw new Error('Klient nepatří do zvoleného projektu.');
    }
    const registryRows = getRegistryRows_();
    const registryRow = registryRows[Number(index.registry_row) - 2];
    const client = registryRowToClient_(registryRow, Number(index.registry_row), index);
    if (!client) throw new Error('Klientský řádek nebyl nalezen.');

    const stored = getClientDocumentRow_(index.client_id);
    const clientFolder = getDriveFolderByIdOrNull_(stored && stored.folder_id);
    if (!clientFolder) throw new Error('Složku klienta se nepodařilo načíst.');
    const mappingFolder = ensureSubfolder_(
      clientFolder,
      '2_Mapování závazků a příčin předlužení'
    );
    const fullName = normalizeText_([client.jmeno, client.prijmeni].filter(Boolean).join(' '));
    const safeName = fullName.replace(/[\\/:*?"<>|]/g, '-');
    const fileName = 'Mapování závazků a příčin předlužení - ' +
      String(index.client_number) + ' - ' + safeName;

    let file = findGoogleDocumentByName_(mappingFolder, fileName);
    const wasCreated = !file;
    if (!file) {
      const createdDocument = DocumentApp.create(fileName);
      file = DriveApp.getFileById(createdDocument.getId());
      file.moveTo(mappingFolder);
      createdDocument.saveAndClose();
    }

    const googleDocument = DocumentApp.openById(file.getId());
    const body = googleDocument.getBody();
    body.clear();
    body.setMarginTop(42).setMarginBottom(42).setMarginLeft(48).setMarginRight(48);

    body.appendParagraph(document.title)
      .setHeading(DocumentApp.ParagraphHeading.TITLE);
    const identityTable = body.appendTable([
      ['Klient', fullName],
      ['ID klienta', String(index.client_number)],
      ['Datum narození', normalizeText_(client.datum_narozeni) || 'Neuvedeno'],
      ['Projekt', context.projectId],
      ['Datum vytvoření / aktualizace', Utilities.formatDate(new Date(), BACKEND_CONFIG.timeZone, 'd. M. yyyy H:mm')]
    ]);
    identityTable.getRow(0).getCell(0).setBackgroundColor('#f3f4f6');

    appendDebtMappingSection_(body, 'Celkové shrnutí situace klienta', document.overallSummary);
    appendDebtMappingSection_(body, 'Sociální a finanční situace', document.clientSituation);

    body.appendParagraph('Přehled doložených závazků')
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    if (document.obligations.length) {
      const rows = [['Věřitel / typ', 'Částka', 'Stav', 'Zdroj a opora']];
      document.obligations.forEach((item) => rows.push([
        item.creditor,
        formatDebtMappingAmount_(item.amount),
        item.status || 'Neuvedeno',
        (item.source ? item.source + ': ' : '') + item.evidence
      ]));
      const table = body.appendTable(rows);
      for (let cellIndex = 0; cellIndex < table.getRow(0).getNumCells(); cellIndex += 1) {
        table.getRow(0).getCell(cellIndex).setBackgroundColor('#e8edf5');
      }
    } else {
      body.appendParagraph('V dostupných podkladech nebyl doložen jednotlivý závazek s dostatečnou identifikací.');
    }

    appendDebtMappingSection_(body, 'Souhrn údajů z ISIR', document.isirSummary);
    appendDebtMappingList_(body, 'Příčiny předlužení a oblasti k ověření', document.causes);
    appendDebtMappingList_(body, 'Rizika', document.risks);
    appendDebtMappingList_(body, 'Doporučené navazující kroky', document.recommendedSteps);
    appendDebtMappingList_(body, 'Chybějící nebo rozporné údaje', document.missingInformation);
    appendDebtMappingList_(body, 'Použité zdroje', document.sourcesUsed);

    body.appendHorizontalRule();
    body.appendParagraph(
      'Dokument byl automaticky sestaven z dat evidovaných v aplikaci. ' +
      'Před použitím pro rozhodnutí nebo podání je nutná odborná kontrola aktuálnosti podkladů.'
    ).setItalic(true);

    googleDocument.saveAndClose();
    const timeline = resolveDebtMappingTimeline_(index.client_id);
    const mappingId = 'debt-mapping-' + context.projectId + '-' + index.client_id;
    const existingMapping = readDataObjects_(DATA_SHEETS.debtMappings)
      .find((row) => String(row.mapping_id || '') === mappingId);
    const timestamp = nowIso_();
    const mappingRow = {
      mapping_id: mappingId,
      project_id: context.projectId,
      client_id: index.client_id,
      client_number: Number(index.client_number),
      activity_date: timeline.activityDate,
      timeline_basis: timeline.basis,
      title: document.title,
      document_text: debtMappingDocumentText_(document),
      file_id: file.getId(),
      file_url: file.getUrl(),
      folder_id: mappingFolder.getId(),
      folder_url: mappingFolder.getUrl(),
      model: debtMappingText_(documentMetadata.model, 120) || 'gemini-2.5-flash',
      sources_json: JSON.stringify(document.sourcesUsed),
      created_at: existingMapping ? existingMapping.created_at : timestamp,
      created_by: existingMapping ? existingMapping.created_by : context.actorId,
      updated_at: timestamp,
      updated_by: context.actorId
    };
    upsertDataObject_(DATA_SHEETS.debtMappings, 'mapping_id', mappingId, mappingRow);
    const result = {
      mapping_id: mappingId,
      client_id: index.client_id,
      activity_date: timeline.activityDate,
      timeline_basis: timeline.basis,
      file_id: file.getId(),
      file_url: file.getUrl(),
      file_name: fileName,
      folder_id: mappingFolder.getId(),
      folder_url: mappingFolder.getUrl(),
      created: wasCreated,
      updated_at: nowIso_(),
      mapping: mappingRow
    };
    writeAudit_(
      context,
      wasCreated ? 'CREATE' : 'UPDATE',
      'DEBT_MAPPING_DOCUMENT',
      file.getId(),
      'OK',
      'client_id=' + index.client_id + ';file=' + fileName
    );
    return result;
  } catch (error) {
    writeAudit_(
      context,
      'SAVE',
      'DEBT_MAPPING_DOCUMENT',
      clientId,
      'ERROR',
      error.message
    );
    throw error;
  } finally {
    lock.releaseLock();
  }
}
