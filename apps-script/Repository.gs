function getRequiredScriptProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error('Chybí Script Property: ' + name);
  return value;
}

function getRegistrySpreadsheet_() {
  return SpreadsheetApp.openById(
    getRequiredScriptProperty_(BACKEND_CONFIG.registrySpreadsheetProperty)
  );
}

function getDataSpreadsheet_() {
  return SpreadsheetApp.openById(
    getRequiredScriptProperty_(BACKEND_CONFIG.dataSpreadsheetProperty)
  );
}

function getLegacySpreadsheet_() {
  return SpreadsheetApp.openById(
    getRequiredScriptProperty_(BACKEND_CONFIG.legacySpreadsheetProperty)
  );
}

function getRequiredSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Chybí list: ' + sheetName);
  return sheet;
}

function ensureDataSheet_(sheetSpec) {
  const spreadsheet = getDataSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(sheetSpec.name);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetSpec.name);
  const headers = sheetSpec.headers.slice();

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  const headerMismatch = headers.some((header, index) => currentHeaders[index] !== header);
  if (headerMismatch) {
    const appendOnlyExtension = currentHeaders.every((header, index) =>
      !header || header === headers[index]
    );
    if (sheet.getLastRow() > 1 && currentHeaders.some(Boolean) && !appendOnlyExtension) {
      throw new Error('List ' + sheetSpec.name + ' má neočekávanou strukturu hlavičky.');
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function readDataObjects_(sheetSpec) {
  const sheet = ensureDataSheet_(sheetSpec);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const headers = sheetSpec.headers;
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .filter((row) => row.some((value) => String(value || '').trim() !== ''))
    .map((row, index) => {
      const object = { __rowNumber: index + 2 };
      headers.forEach((header, columnIndex) => {
        object[header] = row[columnIndex];
      });
      return object;
    });
}

function appendDataObject_(sheetSpec, value) {
  const sheet = ensureDataSheet_(sheetSpec);
  const row = sheetSpec.headers.map((header) => value[header] ?? '');
  sheet.appendRow(row);
  return value;
}

function updateDataObjectAtRow_(sheetSpec, rowNumber, value) {
  const sheet = ensureDataSheet_(sheetSpec);
  const row = sheetSpec.headers.map((header) => value[header] ?? '');
  sheet.getRange(Number(rowNumber), 1, 1, row.length).setValues([row]);
  return value;
}

function upsertDataObject_(sheetSpec, keyName, keyValue, value) {
  const rows = readDataObjects_(sheetSpec);
  const normalizedKey = String(keyValue || '');
  const existing = rows.find((row) => String(row[keyName] || '') === normalizedKey);
  if (existing) return updateDataObjectAtRow_(sheetSpec, existing.__rowNumber, value);
  return appendDataObject_(sheetSpec, value);
}

function bulkUpsertDataObjects_(sheetSpec, keyName, values) {
  const items = Array.isArray(values) ? values : [];
  if (!items.length) return [];
  const sheet = ensureDataSheet_(sheetSpec);
  const existingRows = readDataObjects_(sheetSpec);
  const existingByKey = existingRows.reduce((map, row) => {
    map[String(row[keyName] || '')] = row;
    return map;
  }, {});
  const updates = [];
  const appends = [];

  items.forEach((value) => {
    const normalizedKey = String(value && value[keyName] || '');
    if (!normalizedKey) return;
    const existing = existingByKey[normalizedKey];
    const row = sheetSpec.headers.map((header) => value[header] ?? '');
    if (existing) {
      updates.push({ rowNumber: Number(existing.__rowNumber), row: row });
      existingByKey[normalizedKey] = Object.assign({}, value, {
        __rowNumber: Number(existing.__rowNumber)
      });
      return;
    }
    appends.push(row);
    existingByKey[normalizedKey] = Object.assign({}, value, {
      __rowNumber: sheet.getLastRow() + appends.length
    });
  });

  updates.forEach((update) => {
    sheet.getRange(update.rowNumber, 1, 1, update.row.length).setValues([update.row]);
  });
  if (appends.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, sheetSpec.headers.length)
      .setValues(appends);
  }
  return items;
}

function replaceSheetValues_(sheetName, values) {
  if (!Array.isArray(values) || !values.length) throw new Error('Chybí data pro zápis.');
  const spreadsheet = getDataSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  const rowCount = values.length;
  const columnCount = Math.max.apply(null, values.map((row) => row.length));
  if (sheet.getMaxRows() < rowCount) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowCount - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < columnCount) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), columnCount - sheet.getMaxColumns());
  }

  sheet.clearContents();
  const normalizedValues = values.map((row) => {
    const copy = row.slice();
    while (copy.length < columnCount) copy.push('');
    return copy;
  });
  sheet.getRange(1, 1, rowCount, columnCount).setValues(normalizedValues);
  sheet.setFrozenRows(1);
  return { rows: rowCount - 1, columns: columnCount };
}

function nowIso_() {
  return Utilities.formatDate(new Date(), BACKEND_CONFIG.timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function todayIso_() {
  return Utilities.formatDate(new Date(), BACKEND_CONFIG.timeZone, 'yyyy-MM-dd');
}

function uuid_() {
  return Utilities.getUuid();
}

function normalizeIsoDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, BACKEND_CONFIG.timeZone, 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return match[1] + '-' + String(Number(match[2])).padStart(2, '0') + '-' +
      String(Number(match[3])).padStart(2, '0');
  }
  match = text.match(/^(\d{1,2})[.\/]\s*(\d{1,2})[.\/]\s*(\d{4})$/);
  if (match) {
    return match[3] + '-' + String(Number(match[2])).padStart(2, '0') + '-' +
      String(Number(match[1])).padStart(2, '0');
  }
  throw new Error('Neplatné datum: ' + text);
}

function normalizeText_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeMatchText_(value) {
  return normalizeText_(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function writeAudit_(context, action, entityType, entityId, result, details) {
  appendDataObject_(DATA_SHEETS.audit, {
    audit_id: uuid_(),
    timestamp: nowIso_(),
    actor_id: context && context.actorId ? context.actorId : 'SYSTEM',
    project_id: context && context.projectId ? context.projectId : '',
    action: action,
    entity_type: entityType,
    entity_id: entityId || '',
    result: result || 'OK',
    details: sanitizeAuditDetails_(details)
  });
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorPayload_(error) {
  return {
    ok: false,
    error: String(error && error.message ? error.message : error || 'Neznámá chyba')
  };
}
