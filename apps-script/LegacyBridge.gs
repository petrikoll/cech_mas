function buildLegacyMatchKey_(projectId, firstName, lastName, birthDate) {
  const project = normalizeProjectId_(projectId);
  if (!project) return '';
  const first = normalizeMatchText_(firstName);
  const last = normalizeMatchText_(lastName);
  if (!first || !last) return '';
  let date = '';
  try {
    date = normalizeIsoDate_(birthDate);
  } catch (error) {
    date = normalizeMatchText_(birthDate);
  }
  return [project, first, last, date].join('|');
}

function durationToMinutes_(value) {
  if (value === '' || value === null || value === undefined) return 0;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return value.getHours() * 60 + value.getMinutes() + Math.round(value.getSeconds() / 60);
  }
  if (typeof value === 'number') {
    return value > 0 && value < 1 ? Math.round(value * 24 * 60) : Math.round(value * 60);
  }
  const text = String(value).trim().replace(',', '.');
  const timeMatch = text.match(/^(\d+):(\d{2})$/);
  if (timeMatch) return Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.round(numeric * 60) : 0;
}

function minutesToDurationText_(minutes) {
  const normalized = Math.max(0, Math.round(Number(minutes) || 0));
  return Math.floor(normalized / 60) + ':' + String(normalized % 60).padStart(2, '0');
}

function aggregateNewPerformances_(performances, projectId) {
  const normalizedProjectId = projectId ? requireProjectId_(projectId) : '';
  const result = {};
  (performances || []).forEach((row) => {
    const rowProject = normalizeProjectId_(row.project_id);
    if (!rowProject || (normalizedProjectId && rowProject !== normalizedProjectId)) return;
    if (String(row.status || '').toUpperCase() !== 'ACTIVE') return;
    if (String(row.source_system || '').toUpperCase() !== 'NEW_APP') return;
    const clientId = String(row.client_id || '').trim();
    if (!clientId) return;

    if (!result[clientId]) {
      result[clientId] = {
        clientId: clientId,
        projectId: rowProject,
        phaseMinutes: { A: 0, B: 0, C: 0 },
        activityCounts: LEGACY_ACTIVITY_CODES.reduce((map, code) => {
          map[code] = 0;
          return map;
        }, {}),
        performanceCount: 0
      };
    }

    const aggregate = result[clientId];
    const phaseCode = String(row.phase_code || '').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(aggregate.phaseMinutes, phaseCode)) {
      aggregate.phaseMinutes[phaseCode] += Number(row.duration_minutes) || 0;
    }
    let codes = [];
    try {
      codes = normalizeActivityCodes_(row.activity_codes_json || []);
    } catch (error) {
      codes = [];
    }
    codes.forEach((code) => {
      aggregate.activityCounts[code] += 1;
    });
    aggregate.performanceCount += 1;
  });
  return result;
}

function getClientBridgeMaps_(projectId) {
  const clients = projectId
    ? listClients_(projectId)
    : Object.keys(PROJECT_CONFIG).flatMap((id) => listClients_(id));
  const byId = {};
  const byMatchKey = {};
  clients.forEach((client) => {
    byId[client.klient_id] = client;
    const key = buildLegacyMatchKey_(
      client.project_id,
      client.jmeno,
      client.prijmeni,
      client.datum_narozeni
    );
    if (!key) return;
    if (!byMatchKey[key]) byMatchKey[key] = [];
    byMatchKey[key].push(client);
  });
  return { clients, byId, byMatchKey };
}

function getExplicitLegacyMappings_() {
  const byFileId = {};
  const byFileName = {};
  readDataObjects_(DATA_SHEETS.legacyMap).forEach((row) => {
    if (String(row.mapping_status || '').toUpperCase() === 'REJECTED') return;
    const fileId = String(row.legacy_file_id || '').trim();
    const fileName = String(row.legacy_file_name || '').trim().toLowerCase();
    if (fileId) byFileId[fileId] = row;
    if (fileName) byFileName[fileName] = row;
  });
  return { byFileId, byFileName };
}

function resolveLegacyClient_(legacyRow, clientMaps, explicitMappings) {
  const fileId = String(legacyRow[0] || '').trim();
  const fileName = String(legacyRow[1] || '').trim();
  const explicit = explicitMappings.byFileId[fileId] ||
    explicitMappings.byFileName[fileName.toLowerCase()];
  if (explicit) {
    const explicitStatus = String(explicit.mapping_status || '').toUpperCase();
    if (explicitStatus === 'EXCLUDED_PRAC' ||
        explicitStatus === 'EXCLUDED_OTHER_PROJECT') {
      return { client: null, status: explicitStatus };
    }
    const client = clientMaps.byId[String(explicit.client_id || '')];
    return client
      ? { client: client, status: explicitStatus || 'EXPLICIT' }
      : { client: null, status: 'BROKEN_EXPLICIT_MAPPING' };
  }

  const key = buildLegacyMatchKey_(
    legacyRow[2],
    legacyRow[7],
    legacyRow[8],
    legacyRow[9]
  );
  const matches = key ? clientMaps.byMatchKey[key] || [] : [];
  if (matches.length === 1) return { client: matches[0], status: 'AUTO_IDENTITY' };
  if (matches.length > 1) return { client: null, status: 'AMBIGUOUS_IDENTITY' };
  return { client: null, status: 'UNMAPPED' };
}

function mergeLegacyAndAppRow_(legacyRow, client, aggregate, mappingStatus) {
  const row = legacyRow.slice(0, 25);
  while (row.length < 25) row.push('');
  if (client) {
    row[2] = client.project_id;
    row[7] = client.jmeno;
    row[8] = client.prijmeni;
    row[9] = client.datum_narozeni;
  }
  if (aggregate) {
    const legacyA = durationToMinutes_(row[3]);
    const legacyB = durationToMinutes_(row[4]);
    const legacyC = durationToMinutes_(row[5]);
    row[3] = minutesToDurationText_(legacyA + aggregate.phaseMinutes.A);
    row[4] = minutesToDurationText_(legacyB + aggregate.phaseMinutes.B);
    row[5] = minutesToDurationText_(legacyC + aggregate.phaseMinutes.C);
    row[6] = minutesToDurationText_(
      legacyA + legacyB + legacyC +
      aggregate.phaseMinutes.A + aggregate.phaseMinutes.B + aggregate.phaseMinutes.C
    );
    LEGACY_ACTIVITY_CODES.forEach((code, index) => {
      row[10 + index] = Number(row[10 + index] || 0) + aggregate.activityCounts[code];
    });
    row[24] = nowIso_();
  }
  return row.concat([
    aggregate ? 'LEGACY_XLSM+NEW_APP' : 'LEGACY_XLSM',
    client ? client.klient_id : '',
    mappingStatus
  ]);
}

function buildAppOnlyBridgeRow_(client, aggregate) {
  const row = Array(25).fill('');
  row[0] = 'APP:' + client.klient_id;
  row[1] = 'APP:' + client.client_number;
  row[2] = client.project_id;
  row[3] = minutesToDurationText_(aggregate.phaseMinutes.A);
  row[4] = minutesToDurationText_(aggregate.phaseMinutes.B);
  row[5] = minutesToDurationText_(aggregate.phaseMinutes.C);
  row[6] = minutesToDurationText_(
    aggregate.phaseMinutes.A + aggregate.phaseMinutes.B + aggregate.phaseMinutes.C
  );
  row[7] = client.jmeno;
  row[8] = client.prijmeni;
  row[9] = client.datum_narozeni;
  LEGACY_ACTIVITY_CODES.forEach((code, index) => {
    row[10 + index] = aggregate.activityCounts[code];
  });
  row[24] = nowIso_();
  return row.concat(['NEW_APP', client.klient_id, 'APP_ONLY']);
}

function rebuildLegacyBridge_(context, projectId) {
  const filterProjectId = projectId ? requireProjectId_(projectId) : '';
  const legacySheet = getRequiredSheet_(getLegacySpreadsheet_(), BACKEND_CONFIG.legacyClientDataSheetName);
  const lastRow = legacySheet.getLastRow();
  const legacyValues = lastRow > 0
    ? legacySheet.getRange(1, 1, lastRow, 25).getValues()
    : [];
  if (!legacyValues.length) throw new Error('Starý list Klientská Data je prázdný.');

  const header = legacyValues[0].slice(0, 25).concat([
    'Zdrojový systém', 'Client ID', 'Stav mapování'
  ]);
  const clientMaps = getClientBridgeMaps_(filterProjectId);
  const explicitMappings = getExplicitLegacyMappings_();
  const performances = readDataObjects_(DATA_SHEETS.performances);
  const aggregates = aggregateNewPerformances_(performances, filterProjectId);
  const usedClientIds = {};
  const output = [header];
  const mappingSummary = {};

  legacyValues.slice(1).forEach((legacyRow) => {
    const resolved = resolveLegacyClient_(legacyRow, clientMaps, explicitMappings);
    const client = resolved.client;
    if (resolved.status === 'EXCLUDED_PRAC' ||
        resolved.status === 'EXCLUDED_OTHER_PROJECT') return;
    const rowProject = client
      ? normalizeProjectId_(client.project_id)
      : normalizeProjectId_(legacyRow[2]);
    if (!rowProject || (filterProjectId && rowProject !== filterProjectId)) return;
    const aggregate = client ? aggregates[client.klient_id] : null;
    if (client) usedClientIds[client.klient_id] = true;
    output.push(mergeLegacyAndAppRow_(legacyRow, client, aggregate, resolved.status));
    mappingSummary[resolved.status] = (mappingSummary[resolved.status] || 0) + 1;
  });

  clientMaps.clients.forEach((client) => {
    const aggregate = aggregates[client.klient_id];
    if (!aggregate || usedClientIds[client.klient_id]) return;
    output.push(buildAppOnlyBridgeRow_(client, aggregate));
    mappingSummary.APP_ONLY = (mappingSummary.APP_ONLY || 0) + 1;
  });

  const written = replaceSheetValues_(BACKEND_CONFIG.bridgeSheetName, output);
  const result = {
    rows: written.rows,
    mappingSummary: mappingSummary,
    generatedAt: nowIso_()
  };
  writeAudit_(context, 'REBUILD', 'BRIDGE', '', 'OK', JSON.stringify(result));
  return result;
}

function getBridgeStatus_() {
  const spreadsheet = getDataSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(BACKEND_CONFIG.bridgeSheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return { ready: false, rows: 0, updatedAt: '' };
  }
  const lastRow = sheet.getLastRow();
  const updatedValues = sheet.getRange(2, 25, lastRow - 1, 1).getDisplayValues().flat().filter(Boolean);
  return {
    ready: true,
    rows: lastRow - 1,
    updatedAt: updatedValues.length ? updatedValues.sort().slice(-1)[0] : ''
  };
}
