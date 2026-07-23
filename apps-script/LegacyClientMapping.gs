const LEGACY_MANUAL_MAPPING_STATUSES = Object.freeze([
  'EXPLICIT', 'MANUAL', 'APPROVED'
]);

function buildLegacyIdentityKey_(firstName, lastName, birthDate) {
  const first = normalizeMatchText_(firstName);
  const last = normalizeMatchText_(lastName);
  if (!first || !last) return '';
  let date = '';
  try {
    date = normalizeIsoDate_(birthDate);
  } catch (error) {
    date = normalizeMatchText_(birthDate);
  }
  return [first, last, date].join('|');
}

function buildLegacyBirthDateKey_(birthDate) {
  try {
    return normalizeIsoDate_(birthDate);
  } catch (error) {
    return normalizeMatchText_(birthDate);
  }
}

function classifyLegacyIdentityCandidate_(candidate, matchedStatus) {
  const rawProjectId = String(candidate && candidate.projectId || '').trim().toUpperCase();
  if (rawProjectId === 'PRAC') {
    return { status: 'EXCLUDED_PRAC', candidate: candidate };
  }
  const projectId = normalizeProjectId_(rawProjectId);
  if (!projectId) {
    return { status: 'EXCLUDED_OTHER_PROJECT', candidate: candidate };
  }
  if (!candidate.clientIndex || !candidate.clientIndex.client_id) {
    return { status: 'BROKEN_CLIENT_INDEX', candidate: candidate };
  }
  return {
    status: matchedStatus,
    candidate: candidate,
    clientIndex: candidate.clientIndex
  };
}

function resolveLegacyIdentityCandidate_(sourceIdentity, candidates) {
  if (!sourceIdentity) {
    return { status: 'MISSING_LEGACY_IDENTITY', candidate: null };
  }

  const identityKey = buildLegacyIdentityKey_(
    sourceIdentity.firstName,
    sourceIdentity.lastName,
    sourceIdentity.birthDate
  );
  const exactMatches = (candidates || []).filter((candidate) =>
    candidate.identityKey === identityKey
  );
  if (exactMatches.length === 1) {
    return classifyLegacyIdentityCandidate_(exactMatches[0], 'AUTO_IDENTITY');
  }
  if (exactMatches.length > 1) {
    return { status: 'AMBIGUOUS_IDENTITY', candidate: null };
  }

  const birthDateKey = buildLegacyBirthDateKey_(sourceIdentity.birthDate);
  const birthDateMatches = (candidates || []).filter((candidate) =>
    candidate.birthDateKey && candidate.birthDateKey === birthDateKey
  );
  const sameFirstNameMatches = birthDateMatches.filter((candidate) =>
    normalizeMatchText_(candidate.firstName) ===
      normalizeMatchText_(sourceIdentity.firstName)
  );
  if (sameFirstNameMatches.length === 1) {
    return classifyLegacyIdentityCandidate_(sameFirstNameMatches[0], 'AUTO_BIRTH_DATE');
  }
  if (birthDateMatches.length > 1 || sameFirstNameMatches.length > 1) {
    return { status: 'AMBIGUOUS_BIRTH_DATE', candidate: null };
  }
  return { status: 'UNMAPPED_IDENTITY', candidate: null };
}

function getLegacyRegistryIdentityCandidates_() {
  const indexByNumber = readDataObjects_(DATA_SHEETS.clientIndex).reduce((map, row) => {
    map[String(Number(row.client_number))] = row;
    return map;
  }, {});

  return getRegistryRows_()
    .map((row, index) => {
      if (!isOccupiedRegistryRow_(row)) return null;
      const projectId = String(row[REGISTRY_COLUMN.projectId] || '').trim().toUpperCase();
      const clientNumber = Number(row[REGISTRY_COLUMN.clientNumber]);
      const firstName = normalizeText_(row[REGISTRY_COLUMN.firstName]);
      const lastName = normalizeText_(row[REGISTRY_COLUMN.lastName]);
      const birthDate = safeNormalizeDate_(row[REGISTRY_COLUMN.birthDate]);
      return {
        projectId: projectId,
        clientNumber: clientNumber,
        registryRow: index + 2,
        firstName: firstName,
        lastName: lastName,
        birthDate: birthDate,
        identityKey: buildLegacyIdentityKey_(firstName, lastName, birthDate),
        birthDateKey: buildLegacyBirthDateKey_(birthDate),
        clientIndex: indexByNumber[String(clientNumber)] || null
      };
    })
    .filter(Boolean);
}

function getLegacySourceIdentities_() {
  const sheet = getRequiredSheet_(
    getLegacySpreadsheet_(),
    BACKEND_CONFIG.legacyClientDataSheetName
  );
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 10).getValues()
    .filter((row) => normalizeText_(row[0]) || normalizeText_(row[1]))
    .map((row) => ({
      fileId: normalizeText_(row[0]),
      fileName: normalizeText_(row[1]),
      sourceProjectId: normalizeText_(row[2]).toUpperCase(),
      firstName: normalizeText_(row[7]),
      lastName: normalizeText_(row[8]),
      birthDate: safeNormalizeDate_(row[9])
    }));
}

function getManualLegacyMappings_() {
  const byFileId = {};
  const byFileName = {};
  readDataObjects_(DATA_SHEETS.legacyMap).forEach((row) => {
    const status = String(row.mapping_status || '').trim().toUpperCase();
    if (!LEGACY_MANUAL_MAPPING_STATUSES.includes(status)) return;
    const fileId = String(row.legacy_file_id || '').trim();
    const fileName = String(row.legacy_file_name || '').trim().toLowerCase();
    if (fileId) byFileId[fileId] = row;
    if (fileName) byFileName[fileName] = row;
  });
  return { byFileId: byFileId, byFileName: byFileName };
}

function resolveManualLegacyMapping_(manualMapping, candidates) {
  if (!manualMapping) return null;
  const clientId = String(manualMapping.client_id || '').trim();
  const candidate = (candidates || []).find((item) =>
    item.clientIndex && String(item.clientIndex.client_id || '') === clientId
  );
  if (!candidate) {
    return { status: 'BROKEN_EXPLICIT_MAPPING', candidate: null };
  }
  return {
    status: String(manualMapping.mapping_status || 'EXPLICIT').trim().toUpperCase(),
    candidate: candidate,
    clientIndex: candidate.clientIndex
  };
}

function resolveLegacyPerformanceSources_(sources) {
  const identities = getLegacySourceIdentities_();
  const identityByFileId = {};
  const identityByFileName = {};
  identities.forEach((identity) => {
    if (identity.fileId) identityByFileId[identity.fileId] = identity;
    if (identity.fileName) identityByFileName[identity.fileName.toLowerCase()] = identity;
  });

  const candidates = getLegacyRegistryIdentityCandidates_();
  const manualMappings = getManualLegacyMappings_();
  return (sources || []).map((source) => {
    const fileId = source.file ? String(source.file.getId() || '') : '';
    const fileName = source.file
      ? String(source.file.getName() || '')
      : String(source.expectedName || '');
    const identity = identityByFileId[fileId] ||
      identityByFileName[fileName.toLowerCase()] ||
      null;
    const manual = manualMappings.byFileId[fileId] ||
      manualMappings.byFileName[fileName.toLowerCase()] ||
      null;
    const resolved = resolveManualLegacyMapping_(manual, candidates) ||
      resolveLegacyIdentityCandidate_(identity, candidates);
    return Object.assign({}, resolved, {
      fileId: fileId,
      fileName: fileName,
      source: source,
      identity: identity
    });
  });
}

function syncLegacyClientMap_(resolutions) {
  const existingRows = readDataObjects_(DATA_SHEETS.legacyMap);
  const byFileId = {};
  existingRows.forEach((row) => {
    byFileId[String(row.legacy_file_id || '')] = row;
  });
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  (resolutions || []).forEach((resolution) => {
    if (!resolution.fileId) return;
    const existing = byFileId[resolution.fileId];
    const existingStatus = String(existing && existing.mapping_status || '').toUpperCase();
    if (LEGACY_MANUAL_MAPPING_STATUSES.includes(existingStatus)) {
      unchanged += 1;
      return;
    }
    const candidate = resolution.candidate || {};
    const clientIndex = resolution.clientIndex || candidate.clientIndex || {};
    const value = {
      legacy_file_id: resolution.fileId,
      legacy_file_name: resolution.fileName,
      project_id: String(candidate.projectId || ''),
      client_id: String(clientIndex.client_id || ''),
      match_key: resolution.identity
        ? buildLegacyIdentityKey_(
          resolution.identity.firstName,
          resolution.identity.lastName,
          resolution.identity.birthDate
        )
        : '',
      mapping_status: resolution.status,
      cutover_date: existing ? existing.cutover_date || '' : '',
      note: candidate.clientNumber
        ? 'registry_client_number=' + candidate.clientNumber
        : '',
      updated_at: nowIso_(),
      updated_by: 'SYSTEM'
    };
    if (existing) {
      const comparableHeaders = DATA_SHEETS.legacyMap.headers.filter((header) =>
        !['updated_at', 'updated_by'].includes(header)
      );
      const isSame = comparableHeaders.every((header) =>
        String(existing[header] || '') === String(value[header] || '')
      );
      if (isSame) {
        unchanged += 1;
        return;
      }
      updateDataObjectAtRow_(DATA_SHEETS.legacyMap, existing.__rowNumber, value);
      updated += 1;
      return;
    }
    appendDataObject_(DATA_SHEETS.legacyMap, value);
    created += 1;
  });

  return { created: created, updated: updated, unchanged: unchanged };
}
