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
