const LEGACY_IMPORT_OFFSET_PROPERTY = 'LEGACY_PERFORMANCE_IMPORT_OFFSET';
const LEGACY_IMPORT_BATCH_SIZE = 8;

function sha256Hex_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || '')
  );
  return digest.map((byte) => ('0' + (byte & 0xff).toString(16)).slice(-2)).join('');
}

function normalizeLegacyTime_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, BACKEND_CONFIG.timeZone, 'HH:mm');
  }
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

function legacyPhaseForSheetName_(sheetName) {
  const normalized = normalizeMatchText_(sheetName);
  if (normalized.includes('jednani se zajemcem')) return 'A';
  if (normalized.includes('zavazku') && normalized.includes('pricin predluz')) return 'B';
  if (normalized.includes('hledani') && normalized.includes('realizace reseni')) return 'C';
  return '';
}

function parseLegacyActivityCode_(phaseCode, activityLabel) {
  const match = String(activityLabel || '').trim().match(/^(\d+)\s*\./);
  if (!match) return '';
  const code = String(phaseCode || '').toUpperCase() + Number(match[1]);
  return Object.prototype.hasOwnProperty.call(ACTIVITY_CATALOG, code) &&
    ACTIVITY_CATALOG[code].phaseCode === phaseCode
    ? code
    : '';
}

function buildLegacyPerformanceStableId_(fileId, sheetName, anchor) {
  return 'LEGACY-' + sha256Hex_([
    String(fileId || '').trim(),
    normalizeMatchText_(sheetName),
    String(anchor || '').trim().toUpperCase()
  ].join('|')).slice(0, 40);
}

function stripLegacyNoteLabel_(value) {
  return String(value || '')
    .replace(/^\s*z[aá]pis\s+z\s+jedn[aá]n[ií]\s*:\s*/i, '')
    .trim();
}

function listLegacyClientWorkbookFiles_() {
  const rootFolder = DriveApp.getFolderById(
    getRequiredScriptProperty_(BACKEND_CONFIG.legacyClientRootFolderProperty)
  );
  const folders = rootFolder.getFolders();
  const files = [];

  while (folders.hasNext()) {
    const folder = folders.next();
    const match = String(folder.getName() || '').trim().match(/^(\d+)_/);
    if (!match) continue;
    const clientNumber = Number(match[1]);
    const expectedName = clientNumber + '.xlsm';
    const matchingFiles = folder.getFilesByName(expectedName);
    if (!matchingFiles.hasNext()) {
      files.push({
        clientNumber: clientNumber,
        folderName: folder.getName(),
        file: null,
        expectedName: expectedName
      });
      continue;
    }
    files.push({
      clientNumber: clientNumber,
      folderName: folder.getName(),
      file: matchingFiles.next(),
      expectedName: expectedName
    });
  }

  return files.sort((left, right) => left.clientNumber - right.clientNumber);
}

function convertLegacyWorkbookToTemporarySheet_(file) {
  if (typeof Drive === 'undefined' || !Drive.Files || !Drive.Files.copy) {
    throw new Error('V Apps Script projektu není zapnutá rozšířená služba Drive API v2.');
  }
  const copied = Drive.Files.copy(
    {
      title: 'TMP_CECH_MAS_IMPORT_' + file.getId(),
      mimeType: MimeType.GOOGLE_SHEETS
    },
    file.getId(),
    { convert: true }
  );
  if (!copied || !copied.id) {
    throw new Error('Drive API nevrátilo ID převedeného XLSM.');
  }
  return copied.id;
}

function openTemporarySpreadsheetWithRetry_(spreadsheetId) {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return SpreadsheetApp.openById(spreadsheetId);
    } catch (error) {
      lastError = error;
      if (attempt < 5) Utilities.sleep(attempt * 750);
    }
  }
  throw new Error('Dočasně převedený XLSM nelze otevřít: ' + String(lastError));
}

function extractLegacyPerformancesFromSheet_(sheet, source, clientIndex, issues) {
  const phaseCode = legacyPhaseForSheetName_(sheet.getName());
  if (!phaseCode) return [];

  const range = sheet.getDataRange();
  const displayValues = range.getDisplayValues();
  const results = [];

  displayValues.forEach((row, rowIndex) => {
    row.forEach((cellValue, columnIndex) => {
      if (normalizeMatchText_(cellValue) !== 'forma jednani') return;

      const valueRow = displayValues[rowIndex + 1] || [];
      const timeRow = displayValues[rowIndex + 3] || [];
      const meetingForm = normalizeText_(valueRow[columnIndex]);
      const rawDate = valueRow[columnIndex + 1];
      const place = normalizeText_(valueRow[columnIndex + 2]);
      const startTime = normalizeLegacyTime_(timeRow[columnIndex]);
      const endTime = normalizeLegacyTime_(timeRow[columnIndex + 1]);

      let noteRowIndex = -1;
      for (
        let candidate = rowIndex + 5;
        candidate <= Math.min(rowIndex + 13, displayValues.length - 1);
        candidate += 1
      ) {
        const text = normalizeMatchText_(
          (displayValues[candidate] || [])[columnIndex]
        );
        if (text.startsWith('zapis z jednani')) {
          noteRowIndex = candidate;
          break;
        }
      }

      const activityEnd = noteRowIndex >= 0 ? noteRowIndex : Math.min(rowIndex + 13, displayValues.length);
      const activityCodes = [];
      for (let activityRow = rowIndex + 5; activityRow < activityEnd; activityRow += 1) {
        const code = parseLegacyActivityCode_(
          phaseCode,
          (displayValues[activityRow] || [])[columnIndex]
        );
        if (code && !activityCodes.includes(code)) activityCodes.push(code);
      }

      const note = noteRowIndex >= 0
        ? stripLegacyNoteLabel_((displayValues[noteRowIndex] || [])[columnIndex])
        : '';
      const hasAnyContent = Boolean(
        rawDate || meetingForm || place || startTime || endTime || activityCodes.length || note
      );
      if (!hasAnyContent) return;
      if (!rawDate || !startTime || !endTime || !activityCodes.length) {
        issues.push(
          'Neúplný výkon v souboru ' + source.fileName +
          ', list ' + sheet.getName() + ', buňka ' +
          sheet.getRange(rowIndex + 1, columnIndex + 1).getA1Notation() + '.'
        );
        return;
      }

      const date = normalizeIsoDate_(rawDate);
      const durationMinutes = calculateDurationMinutes_(startTime, endTime, '');
      const anchor = sheet.getRange(rowIndex + 1, columnIndex + 1).getA1Notation();
      const performanceId = buildLegacyPerformanceStableId_(
        source.fileId,
        sheet.getName(),
        anchor
      );
      const timestamp = nowIso_();
      const normalizedCodes = normalizeActivityCodes_(activityCodes);
      const fingerprint = sha256Hex_([
        source.fileId,
        sheet.getName(),
        anchor,
        clientIndex.client_id,
        date,
        startTime,
        endTime,
        normalizedCodes.join(','),
        meetingForm,
        place,
        note
      ].join('|'));

      results.push({
        performance_id: performanceId,
        project_id: clientIndex.project_id,
        client_id: clientIndex.client_id,
        client_number: Number(clientIndex.client_number),
        phase_code: phaseCode,
        activity_codes_json: JSON.stringify(normalizedCodes),
        meeting_form: meetingForm,
        date: date,
        place: place,
        start_time: startTime,
        end_time: endTime,
        duration_minutes: durationMinutes,
        case_note: note,
        worker_id: 'LEGACY_XLSM',
        worker_name: 'Historický XLSM',
        status: 'ACTIVE',
        source_system: 'LEGACY_XLSM',
        idempotency_key: performanceId,
        created_at: timestamp,
        created_by: 'LEGACY_IMPORT',
        updated_at: timestamp,
        updated_by: 'LEGACY_IMPORT',
        legacy_source_file_id: source.fileId,
        legacy_source_file_name: source.fileName,
        legacy_source_sheet: sheet.getName(),
        legacy_source_anchor: anchor,
        source_fingerprint: fingerprint,
        source_modified_at: source.modifiedAt,
        imported_at: timestamp
      });
    });
  });

  return results;
}

function extractLegacyWorkbookPerformances_(file, clientIndex) {
  let temporaryFileId = '';
  try {
    temporaryFileId = convertLegacyWorkbookToTemporarySheet_(file);
    const spreadsheet = openTemporarySpreadsheetWithRetry_(temporaryFileId);
    const source = {
      fileId: file.getId(),
      fileName: file.getName(),
      modifiedAt: file.getLastUpdated().toISOString()
    };
    const issues = [];
    const performances = spreadsheet.getSheets().flatMap((sheet) =>
      extractLegacyPerformancesFromSheet_(sheet, source, clientIndex, issues)
    );
    return { performances: performances, issues: issues };
  } finally {
    if (temporaryFileId) {
      try {
        Drive.Files.remove(temporaryFileId);
      } catch (cleanupError) {
        console.warn('Dočasný importní soubor se nepodařilo odstranit: ' + cleanupError.message);
      }
    }
  }
}

function upsertLegacyPerformances_(performances, existingRows) {
  const byId = {};
  existingRows.forEach((row) => {
    byId[String(row.performance_id || '')] = row;
  });
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  performances.forEach((performance) => {
    const existing = byId[performance.performance_id];
    if (!existing) {
      appendDataObject_(DATA_SHEETS.performances, performance);
      byId[performance.performance_id] = performance;
      created += 1;
      return;
    }
    if (String(existing.source_system || '').toUpperCase() !== 'LEGACY_XLSM') {
      throw new Error('Kolize historického výkonu s výkonem z nové aplikace.');
    }
    if (String(existing.source_fingerprint || '') === performance.source_fingerprint) {
      unchanged += 1;
      return;
    }
    performance.created_at = existing.created_at || performance.created_at;
    performance.created_by = existing.created_by || performance.created_by;
    updateDataObjectAtRow_(DATA_SHEETS.performances, existing.__rowNumber, performance);
    updated += 1;
  });

  return { created: created, updated: updated, unchanged: unchanged };
}

function deactivateLegacyPerformancesForSource_(existingRows, fileId, activeIds, status) {
  const allowedIds = activeIds || new Set();
  let deactivated = 0;
  (existingRows || []).forEach((row) => {
    if (String(row.source_system || '').toUpperCase() !== 'LEGACY_XLSM') return;
    if (String(row.legacy_source_file_id || '') !== String(fileId || '')) return;
    if (String(row.status || '').toUpperCase() !== 'ACTIVE') return;
    if (allowedIds.has(String(row.performance_id || ''))) return;
    const updated = Object.assign({}, row, {
      status: String(status || 'STALE_SOURCE').toUpperCase(),
      updated_at: nowIso_(),
      updated_by: 'LEGACY_RECONCILIATION'
    });
    delete updated.__rowNumber;
    updateDataObjectAtRow_(DATA_SHEETS.performances, row.__rowNumber, updated);
    Object.assign(row, updated);
    deactivated += 1;
  });
  return deactivated;
}

function legacySourceMappingIsCurrent_(existingRows, fileId, clientIndex, cachedCount) {
  const activeRows = (existingRows || []).filter((row) =>
    String(row.source_system || '').toUpperCase() === 'LEGACY_XLSM' &&
    String(row.legacy_source_file_id || '') === String(fileId || '') &&
    String(row.status || '').toUpperCase() === 'ACTIVE'
  );
  if (activeRows.length !== Number(cachedCount || 0)) return false;
  return activeRows.every((row) =>
    String(row.client_id || '') === String(clientIndex.client_id || '') &&
    normalizeProjectId_(row.project_id) === normalizeProjectId_(clientIndex.project_id)
  );
}

function syncLegacyPerformances_(context, options) {
  const settings = options || {};
  const offset = Math.max(0, Number(settings.offset) || 0);
  const batchSize = Math.min(12, Math.max(1, Number(settings.batchSize) || LEGACY_IMPORT_BATCH_SIZE));
  const dryRun = settings.dryRun === true;
  const force = settings.force === true;
  const projectFilter = settings.projectId ? requireProjectId_(settings.projectId) : '';
  const sources = listLegacyClientWorkbookFiles_();
  const batch = sources.slice(offset, offset + batchSize);
  const resolutions = resolveLegacyPerformanceSources_(sources);
  const resolutionByFileId = {};
  const resolutionByFileName = {};
  resolutions.forEach((resolution) => {
    if (resolution.fileId) resolutionByFileId[resolution.fileId] = resolution;
    if (resolution.fileName) {
      resolutionByFileName[resolution.fileName.toLowerCase()] = resolution;
    }
  });
  const mapSync = dryRun
    ? { created: 0, updated: 0, unchanged: resolutions.length }
    : syncLegacyClientMap_(resolutions);
  const cacheRows = readDataObjects_(DATA_SHEETS.legacyImportCache);
  const cacheByFileId = {};
  cacheRows.forEach((row) => {
    cacheByFileId[String(row.legacy_file_id || '')] = row;
  });
  const existingPerformances = readDataObjects_(DATA_SHEETS.performances);

  const summary = {
    offset: offset,
    batchSize: batchSize,
    totalFiles: sources.length,
    scannedFiles: batch.length,
    convertedFiles: 0,
    skippedUnchangedFiles: 0,
    missingFiles: 0,
    unmappedClients: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    extractedPerformances: 0,
    incompletePerformances: 0,
    deactivatedPerformances: 0,
    excludedPracFiles: 0,
    unmappedFiles: 0,
    mappingStatusCounts: {},
    mapSync: mapSync,
    errors: []
  };

  batch.forEach((source) => {
    if (!source.file) {
      summary.missingFiles += 1;
      return;
    }

    const fileId = source.file.getId();
    const fileName = source.file.getName();
    const resolution = resolutionByFileId[fileId] ||
      resolutionByFileName[fileName.toLowerCase()] ||
      { status: 'UNMAPPED_IDENTITY', clientIndex: null };
    const mappingStatus = String(resolution.status || 'UNMAPPED_IDENTITY').toUpperCase();
    summary.mappingStatusCounts[mappingStatus] =
      (summary.mappingStatusCounts[mappingStatus] || 0) + 1;
    const clientIndex = resolution.clientIndex || null;

    if (!clientIndex) {
      if (mappingStatus === 'EXCLUDED_PRAC') summary.excludedPracFiles += 1;
      else {
        summary.unmappedClients += 1;
        summary.unmappedFiles += 1;
      }
      if (!dryRun) {
        summary.deactivatedPerformances += deactivateLegacyPerformancesForSource_(
          existingPerformances,
          fileId,
          new Set(),
          mappingStatus
        );
        upsertDataObject_(
          DATA_SHEETS.legacyImportCache,
          'legacy_file_id',
          fileId,
          {
            legacy_file_id: fileId,
            legacy_file_name: fileName,
            client_number: source.clientNumber,
            source_modified_at: source.file.getLastUpdated().toISOString(),
            last_imported_at: nowIso_(),
            status: mappingStatus,
            performance_count: 0,
            error: ''
          }
        );
      }
      return;
    }
    if (projectFilter && clientIndex.project_id !== projectFilter) return;

    const modifiedAt = source.file.getLastUpdated().toISOString();
    const cache = cacheByFileId[fileId];
    const mappingIsCurrent = legacySourceMappingIsCurrent_(
      existingPerformances,
      fileId,
      clientIndex,
      cache ? cache.performance_count : 0
    );
    if (
      !dryRun &&
      !force &&
      cache &&
      ['OK', 'PARTIAL'].includes(String(cache.status || '').toUpperCase()) &&
      String(cache.source_modified_at || '') === modifiedAt &&
      mappingIsCurrent
    ) {
      summary.skippedUnchangedFiles += 1;
      return;
    }

    try {
      const extracted = extractLegacyWorkbookPerformances_(source.file, clientIndex);
      const performances = extracted.performances;
      summary.convertedFiles += 1;
      summary.extractedPerformances += performances.length;
      summary.incompletePerformances += extracted.issues.length;
      if (!dryRun) {
        const result = upsertLegacyPerformances_(performances, existingPerformances);
        summary.created += result.created;
        summary.updated += result.updated;
        summary.unchanged += result.unchanged;
        summary.deactivatedPerformances += deactivateLegacyPerformancesForSource_(
          existingPerformances,
          fileId,
          new Set(performances.map((performance) => performance.performance_id)),
          'STALE_SOURCE'
        );
        upsertDataObject_(
          DATA_SHEETS.legacyImportCache,
          'legacy_file_id',
          fileId,
          {
            legacy_file_id: fileId,
            legacy_file_name: source.file.getName(),
            client_number: source.clientNumber,
            source_modified_at: modifiedAt,
            last_imported_at: nowIso_(),
            status: extracted.issues.length ? 'PARTIAL' : 'OK',
            performance_count: performances.length,
            error: extracted.issues.join(' | ').slice(0, 240)
          }
        );
      }
    } catch (error) {
      const safeError = String(error && error.message ? error.message : error).slice(0, 240);
      summary.errors.push({
        clientNumber: source.clientNumber,
        fileName: source.expectedName,
        error: safeError
      });
      if (!dryRun) {
        upsertDataObject_(
          DATA_SHEETS.legacyImportCache,
          'legacy_file_id',
          fileId,
          {
            legacy_file_id: fileId,
            legacy_file_name: source.file.getName(),
            client_number: source.clientNumber,
            source_modified_at: modifiedAt,
            last_imported_at: nowIso_(),
            status: 'ERROR',
            performance_count: 0,
            error: safeError
          }
        );
      }
    }
  });

  summary.nextOffset = offset + batch.length < sources.length
    ? offset + batch.length
    : 0;
  summary.done = summary.nextOffset === 0;
  summary.dryRun = dryRun;

  if (!dryRun) {
    writeAudit_(
      context,
      'SYNC',
      'LEGACY_PERFORMANCES',
      '',
      summary.errors.length ? 'PARTIAL' : 'OK',
      JSON.stringify({
        offset: summary.offset,
        scannedFiles: summary.scannedFiles,
        created: summary.created,
        updated: summary.updated,
        errors: summary.errors.length
      })
    );
  }
  return summary;
}

function runLegacyPerformanceImportBatch() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const offset = Number(properties.getProperty(LEGACY_IMPORT_OFFSET_PROPERTY)) || 0;
    const context = {
      actorId: 'SYSTEM',
      displayName: 'Automatický import',
      role: 'SYSTEM',
      projectId: ''
    };
    const result = syncLegacyPerformances_(context, {
      offset: offset,
      batchSize: LEGACY_IMPORT_BATCH_SIZE
    });
    properties.setProperty(
      LEGACY_IMPORT_OFFSET_PROPERTY,
      String(result.nextOffset || 0)
    );
    return result;
  } finally {
    lock.releaseLock();
  }
}

function runLegacyPerformanceSyncWithLock_(context, options) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return syncLegacyPerformances_(context, options);
  } finally {
    lock.releaseLock();
  }
}

function auditLegacyPerformanceImport() {
  const allLegacyPerformances = readDataObjects_(DATA_SHEETS.performances)
    .filter((row) => String(row.source_system || '').toUpperCase() === 'LEGACY_XLSM');
  const performances = allLegacyPerformances
    .filter((row) => String(row.status || '').toUpperCase() === 'ACTIVE');
  const cacheRows = readDataObjects_(DATA_SHEETS.legacyImportCache);
  const mapRows = readDataObjects_(DATA_SHEETS.legacyMap);
  const mapByFileId = mapRows.reduce((map, row) => {
    map[String(row.legacy_file_id || '')] = row;
    return map;
  }, {});
  const summary = {
    offset: Number(
      PropertiesService.getScriptProperties().getProperty(LEGACY_IMPORT_OFFSET_PROPERTY)
    ) || 0,
    performanceCount: performances.length,
    uniquePerformanceIds: new Set(
      performances.map((row) => String(row.performance_id || ''))
    ).size,
    totalMinutes: performances.reduce(
      (sum, row) => sum + (Number(row.duration_minutes) || 0),
      0
    ),
    projectCounts: performances.reduce((counts, row) => {
      const projectId = String(row.project_id || '').toUpperCase();
      counts[projectId] = (counts[projectId] || 0) + 1;
      return counts;
    }, {}),
    phaseMinutes: performances.reduce((counts, row) => {
      const phase = String(row.phase_code || '').toUpperCase();
      counts[phase] = (counts[phase] || 0) + (Number(row.duration_minutes) || 0);
      return counts;
    }, {}),
    projectMinutes: performances.reduce((counts, row) => {
      const projectId = String(row.project_id || '').toUpperCase();
      counts[projectId] = (counts[projectId] || 0) + (Number(row.duration_minutes) || 0);
      return counts;
    }, {}),
    activityCounts: performances.reduce((counts, row) => {
      let codes = [];
      try {
        codes = normalizeActivityCodes_(row.activity_codes_json || []);
      } catch (error) {
        codes = [];
      }
      codes.forEach((code) => {
        counts[code] = (counts[code] || 0) + 1;
      });
      return counts;
    }, {}),
    activeSourceFileCount: new Set(
      performances.map((row) => String(row.legacy_source_file_id || '')).filter(Boolean)
    ).size,
    activeClientCount: new Set(
      performances.map((row) => String(row.client_id || '')).filter(Boolean)
    ).size,
    mappingMismatchCount: performances.filter((row) => {
      const mapping = mapByFileId[String(row.legacy_source_file_id || '')];
      if (!mapping) return true;
      const mappingStatus = String(mapping.mapping_status || '').toUpperCase();
      if (mappingStatus === 'EXCLUDED_PRAC' ||
          mappingStatus === 'EXCLUDED_OTHER_PROJECT') return true;
      return String(row.client_id || '') !== String(mapping.client_id || '') ||
        normalizeProjectId_(row.project_id) !== normalizeProjectId_(mapping.project_id);
    }).length,
    performanceStatusCounts: allLegacyPerformances.reduce((counts, row) => {
      const status = String(row.status || '').toUpperCase() || 'EMPTY';
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {}),
    cacheStatusCounts: cacheRows.reduce((counts, row) => {
      const status = String(row.status || '').toUpperCase() || 'EMPTY';
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {}),
    cachePerformanceCount: cacheRows.reduce(
      (sum, row) => sum + (Number(row.performance_count) || 0),
      0
    ),
    mappingStatusCounts: mapRows.reduce((counts, row) => {
      const status = String(row.mapping_status || '').toUpperCase() || 'EMPTY';
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {})
  };
  console.log(JSON.stringify(summary));
  return summary;
}

function scheduledLegacyPerformanceImport() {
  return runLegacyPerformanceImportBatch();
}

function installLegacyPerformanceImportTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === 'scheduledLegacyPerformanceImport')
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  ScriptApp.newTrigger('scheduledLegacyPerformanceImport')
    .timeBased()
    .everyMinutes(15)
    .create();

  return {
    ok: true,
    message: 'Pravidelný import historických výkonů byl nastaven po 15 minutách.'
  };
}
