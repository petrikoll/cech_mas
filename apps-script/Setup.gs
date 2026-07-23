function initializeBackend() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    let dataSpreadsheetId = properties.getProperty(BACKEND_CONFIG.dataSpreadsheetProperty);
    let dataSpreadsheet;

    if (dataSpreadsheetId) {
      dataSpreadsheet = SpreadsheetApp.openById(dataSpreadsheetId);
    } else {
      dataSpreadsheet = SpreadsheetApp.create('Výkaznictví CECH MAS - aplikační data');
      dataSpreadsheetId = dataSpreadsheet.getId();
      properties.setProperty(BACKEND_CONFIG.dataSpreadsheetProperty, dataSpreadsheetId);
    }

    Object.keys(DATA_SHEETS).forEach((key) => ensureDataSheet_(DATA_SHEETS[key]));
    syncExistingClientIndex_();

    return {
      ok: true,
      dataSpreadsheetId: dataSpreadsheetId,
      dataSpreadsheetUrl: dataSpreadsheet.getUrl(),
      message: 'Datové listy byly připraveny. Zápisy zůstanou zablokované, dokud není nastaven API token a Users.'
    };
  } finally {
    lock.releaseLock();
  }
}

function installBridgeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'scheduledLegacyBridgeRefresh')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('scheduledLegacyBridgeRefresh')
    .timeBased()
    .everyHours(1)
    .create();

  return { ok: true, message: 'Hodinová aktualizace bridge byla nastavena.' };
}

function scheduledLegacyBridgeRefresh() {
  const systemContext = { actorId: 'SYSTEM', projectId: '', role: 'SYSTEM' };
  const result = rebuildLegacyBridge_(systemContext, '');
  writeAudit_(systemContext, 'REBUILD_BRIDGE', 'BRIDGE', '', 'OK', JSON.stringify(result));
}

function addOrUpdateUser(actorId, displayName, role, projectIds, active) {
  const normalizedActorId = normalizeActorId_(actorId);
  const normalizedRole = String(role || '').trim().toUpperCase();
  if (!['WORKER', 'GARANT', 'ADMIN'].includes(normalizedRole)) {
    throw new Error('Role musí být WORKER, GARANT nebo ADMIN.');
  }
  const normalizedProjects = splitList_(projectIds).map(requireProjectId_);
  const existing = readDataObjects_(DATA_SHEETS.users)
    .find((row) => String(row.actor_id || '').trim().toLowerCase() === normalizedActorId.toLowerCase());
  const timestamp = nowIso_();
  const value = {
    actor_id: normalizedActorId,
    display_name: normalizeText_(displayName || normalizedActorId),
    role: normalizedRole,
    project_ids: Array.from(new Set(normalizedProjects)).join(','),
    active: active === false ? 'Ne' : 'Ano',
    created_at: existing ? existing.created_at : timestamp,
    updated_at: timestamp
  };
  if (existing) return updateDataObjectAtRow_(DATA_SHEETS.users, existing.__rowNumber, value);
  return appendDataObject_(DATA_SHEETS.users, value);
}

function authorizeBackendResources() {
  getRegistrySpreadsheet_().getName();
  getDataSpreadsheet_().getName();
  const legacyId = PropertiesService.getScriptProperties()
    .getProperty(BACKEND_CONFIG.legacySpreadsheetProperty);
  if (legacyId) SpreadsheetApp.openById(legacyId).getName();
  return { ok: true };
}
