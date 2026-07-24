function getRegistrySheet_() {
  return getRequiredSheet_(getRegistrySpreadsheet_(), BACKEND_CONFIG.registrySheetName);
}

function getRegistryRows_() {
  const sheet = getRegistrySheet_();
  const lastRow = Math.max(sheet.getLastRow(), 2);
  return sheet.getRange(2, 1, lastRow - 1, 23).getValues();
}

function isOccupiedRegistryRow_(row) {
  return Boolean(normalizeText_(row[REGISTRY_COLUMN.firstName]) ||
    normalizeText_(row[REGISTRY_COLUMN.lastName]));
}

function findNextClientNumberFromRows_(rows) {
  const usedNumbers = rows
    .filter(isOccupiedRegistryRow_)
    .map((row) => Number(row[REGISTRY_COLUMN.clientNumber]))
    .filter((value) => Number.isInteger(value) && value > 0);
  return usedNumbers.length ? Math.max.apply(null, usedNumbers) + 1 : 1;
}

function findFreeRegistryRow_(rows, clientNumber) {
  const matchingPrefilledIndex = rows.findIndex((row) =>
    !isOccupiedRegistryRow_(row) &&
    Number(row[REGISTRY_COLUMN.clientNumber]) === Number(clientNumber)
  );
  if (matchingPrefilledIndex >= 0) return matchingPrefilledIndex + 2;

  const firstBlankIndex = rows.findIndex((row) => !isOccupiedRegistryRow_(row));
  return firstBlankIndex >= 0 ? firstBlankIndex + 2 : rows.length + 2;
}

function getClientIndexByNumber_(clientNumber) {
  return readDataObjects_(DATA_SHEETS.clientIndex).find((row) =>
    Number(row.client_number) === Number(clientNumber)
  ) || null;
}

function getClientIndexById_(clientId) {
  const normalizedId = String(clientId || '').trim();
  return readDataObjects_(DATA_SHEETS.clientIndex).find((row) =>
    String(row.client_id || '') === normalizedId
  ) || null;
}

function ensureClientIndex_(clientNumber, projectId, registryRow, actorId) {
  const existing = getClientIndexByNumber_(clientNumber);
  const timestamp = nowIso_();
  if (existing) {
    if (requireProjectId_(existing.project_id) !== requireProjectId_(projectId)) {
      throw new Error('Číslo klienta je v indexu přiřazeno jinému projektu.');
    }
    const updated = Object.assign({}, existing, {
      registry_row: registryRow,
      status: 'ACTIVE',
      updated_at: timestamp,
      updated_by: actorId || 'SYSTEM'
    });
    delete updated.__rowNumber;
    return updateDataObjectAtRow_(DATA_SHEETS.clientIndex, existing.__rowNumber, updated);
  }

  return appendDataObject_(DATA_SHEETS.clientIndex, {
    client_id: uuid_(),
    client_number: Number(clientNumber),
    project_id: requireProjectId_(projectId),
    registry_row: Number(registryRow),
    status: 'ACTIVE',
    created_at: timestamp,
    created_by: actorId || 'SYSTEM',
    updated_at: timestamp,
    updated_by: actorId || 'SYSTEM'
  });
}

function syncExistingClientIndex_() {
  const rows = getRegistryRows_();
  const existingRows = readDataObjects_(DATA_SHEETS.clientIndex);
  const nextRows = existingRows.map((row) => {
    const value = Object.assign({}, row);
    delete value.__rowNumber;
    return value;
  });
  const positionByNumber = nextRows.reduce((map, row, index) => {
    map[String(Number(row.client_number))] = index;
    return map;
  }, {});
  let createdOrUpdated = 0;

  rows.forEach((row, index) => {
    const projectId = normalizeProjectId_(row[REGISTRY_COLUMN.projectId]);
    const clientNumber = Number(row[REGISTRY_COLUMN.clientNumber]);
    if (!projectId || !isOccupiedRegistryRow_(row) || !Number.isInteger(clientNumber)) return;

    const key = String(clientNumber);
    const existingPosition = positionByNumber[key];
    const existing = Number.isInteger(existingPosition) ? nextRows[existingPosition] : null;
    const timestamp = nowIso_();

    if (existing) {
      if (requireProjectId_(existing.project_id) !== projectId) {
        throw new Error('Číslo klienta ' + clientNumber + ' je v indexu přiřazeno jinému projektu.');
      }
      nextRows[existingPosition] = Object.assign({}, existing, {
        registry_row: index + 2,
        status: 'ACTIVE',
        updated_at: timestamp,
        updated_by: 'SYSTEM'
      });
    } else {
      positionByNumber[key] = nextRows.length;
      nextRows.push({
        client_id: uuid_(),
        client_number: clientNumber,
        project_id: projectId,
        registry_row: index + 2,
        status: 'ACTIVE',
        created_at: timestamp,
        created_by: 'SYSTEM',
        updated_at: timestamp,
        updated_by: 'SYSTEM'
      });
    }
    createdOrUpdated += 1;
  });

  replaceSheetValues_(
    DATA_SHEETS.clientIndex.name,
    [DATA_SHEETS.clientIndex.headers].concat(
      nextRows.map((row) => DATA_SHEETS.clientIndex.headers.map((header) => row[header] ?? ''))
    )
  );

  return createdOrUpdated;
}

function registryRowToClient_(row, registryRow, indexByNumber) {
  const projectId = normalizeProjectId_(row[REGISTRY_COLUMN.projectId]);
  if (!projectId || !isOccupiedRegistryRow_(row)) return null;
  const clientNumber = Number(row[REGISTRY_COLUMN.clientNumber]);
  if (!Number.isInteger(clientNumber) || clientNumber <= 0) return null;
  const index = indexByNumber
    ? indexByNumber[String(clientNumber)] || null
    : getClientIndexByNumber_(clientNumber);

  return {
    klient_id: index ? index.client_id : 'client-' + clientNumber,
    client_number: clientNumber,
    project_id: projectId,
    source_system: 'LEGACY_REGISTRY',
    registry_row: registryRow,
    jmeno: normalizeText_(row[REGISTRY_COLUMN.firstName]),
    prijmeni: normalizeText_(row[REGISTRY_COLUMN.lastName]),
    datum_narozeni: safeNormalizeDate_(row[REGISTRY_COLUMN.birthDate]),
    ulice: normalizeText_(row[REGISTRY_COLUMN.street]),
    cislo_popisne: normalizeText_(row[REGISTRY_COLUMN.houseNumber]),
    mesto: normalizeText_(row[REGISTRY_COLUMN.city]),
    psc: normalizeText_(row[REGISTRY_COLUMN.postalCode]),
    spadove_mesto: normalizeText_(row[REGISTRY_COLUMN.catchmentCity]),
    email_datova_schranka: normalizeText_(row[REGISTRY_COLUMN.emailOrDatabox]),
    telefon: normalizeText_(row[REGISTRY_COLUMN.phone]),
    pohlavi: normalizeText_(row[REGISTRY_COLUMN.gender]),
    postaveni_na_trhu_prace: normalizeText_(row[REGISTRY_COLUMN.employmentStatus]),
    dosazene_vzdelani: normalizeText_(row[REGISTRY_COLUMN.education]),
    znevyhodneni: normalizeText_(row[REGISTRY_COLUMN.disadvantage]),
    datum_vstupu_do_projektu: safeNormalizeDate_(row[REGISTRY_COLUMN.entryDate]),
    datum_vystupu_z_projektu: safeNormalizeDate_(row[REGISTRY_COLUMN.exitDate]),
    situace_po_ukonceni: normalizeText_(row[REGISTRY_COLUMN.exitSituation]),
    oddluzeni: normalizeText_(row[REGISTRY_COLUMN.insolvency]),
    splatkovy_kalendar: normalizeText_(row[REGISTRY_COLUMN.paymentSchedule]),
    pocet_splatkovych_kalendaru: row[REGISTRY_COLUMN.paymentScheduleCount] || ''
  };
}

function safeNormalizeDate_(value) {
  if (!value) return '';
  try {
    return normalizeIsoDate_(value);
  } catch (error) {
    return normalizeText_(value);
  }
}

function listClients_(projectId) {
  const normalizedProjectId = requireProjectId_(projectId);
  const indexByNumber = readDataObjects_(DATA_SHEETS.clientIndex).reduce((map, row) => {
    map[String(Number(row.client_number))] = row;
    return map;
  }, {});
  const documentsByClientId = readDataObjects_(DATA_SHEETS.clientDocuments).reduce((map, row) => {
    map[String(row.client_id || '')] = row;
    return map;
  }, {});
  return getRegistryRows_()
    .map((row, index) => registryRowToClient_(row, index + 2, indexByNumber))
    .filter((client) => client && client.project_id === normalizedProjectId)
    .map((client) => addClientDocumentLinks_(
      client,
      documentsByClientId[String(client.klient_id || '')]
    ));
}

function buildRegistryRowFromClient_(client, clientNumber, existingRow) {
  const row = Array.isArray(existingRow) ? existingRow.slice(0, 23) : Array(23).fill('');
  while (row.length < 23) row.push('');
  row[REGISTRY_COLUMN.projectId] = requireProjectId_(client.project_id);
  row[REGISTRY_COLUMN.firstName] = normalizeText_(client.jmeno);
  row[REGISTRY_COLUMN.lastName] = normalizeText_(client.prijmeni);
  row[REGISTRY_COLUMN.birthDate] = client.datum_narozeni ? normalizeIsoDate_(client.datum_narozeni) : '';
  row[REGISTRY_COLUMN.street] = normalizeText_(client.ulice);
  row[REGISTRY_COLUMN.houseNumber] = normalizeText_(client.cislo_popisne);
  row[REGISTRY_COLUMN.city] = normalizeText_(client.mesto);
  row[REGISTRY_COLUMN.postalCode] = normalizeText_(client.psc);
  row[REGISTRY_COLUMN.catchmentCity] = normalizeText_(client.spadove_mesto);
  row[REGISTRY_COLUMN.emailOrDatabox] = normalizeText_(client.email_datova_schranka || client.email || client.datova_schranka);
  row[REGISTRY_COLUMN.phone] = normalizeText_(client.telefon);
  row[REGISTRY_COLUMN.gender] = normalizeText_(client.pohlavi);
  row[REGISTRY_COLUMN.employmentStatus] = normalizeText_(client.postaveni_na_trhu_prace);
  row[REGISTRY_COLUMN.education] = normalizeText_(client.dosazene_vzdelani);
  row[REGISTRY_COLUMN.disadvantage] = normalizeText_(client.znevyhodneni);
  row[REGISTRY_COLUMN.entryDate] = client.datum_vstupu_do_projektu ?
    normalizeIsoDate_(client.datum_vstupu_do_projektu) : '';
  row[REGISTRY_COLUMN.exitDate] = client.datum_vystupu_z_projektu ?
    normalizeIsoDate_(client.datum_vystupu_z_projektu) : '';
  row[REGISTRY_COLUMN.exitSituation] = normalizeText_(client.situace_po_ukonceni);
  row[REGISTRY_COLUMN.insolvency] = normalizeText_(client.oddluzeni);
  row[REGISTRY_COLUMN.paymentSchedule] = normalizeText_(client.splatkovy_kalendar);
  row[REGISTRY_COLUMN.paymentScheduleCount] = client.pocet_splatkovych_kalendaru || '';
  row[REGISTRY_COLUMN.clientNumber] = Number(clientNumber);
  row[REGISTRY_COLUMN.employmentProjectFlag] = '';
  return row;
}

function buildGlobalClientIdentityKey_(firstName, lastName, birthDate) {
  return [
    normalizeMatchText_(firstName),
    normalizeMatchText_(lastName),
    birthDate ? safeNormalizeDate_(birthDate) : ''
  ].join('|');
}

function assertNoDuplicateClient_(rows, client, ignoredClientNumber) {
  const targetKey = buildGlobalClientIdentityKey_(
    client.jmeno,
    client.prijmeni,
    client.datum_narozeni
  );
  if (!normalizeText_(client.jmeno) || !normalizeText_(client.prijmeni)) {
    throw new Error('Jméno a příjmení klienta jsou povinné.');
  }

  const duplicate = rows.find((row) => {
    if (!isOccupiedRegistryRow_(row)) return false;
    const number = Number(row[REGISTRY_COLUMN.clientNumber]);
    if (Number(ignoredClientNumber) === number) return false;
    const rowProject = normalizeProjectId_(row[REGISTRY_COLUMN.projectId]);
    if (!rowProject) return false;
    return buildGlobalClientIdentityKey_(
      row[REGISTRY_COLUMN.firstName],
      row[REGISTRY_COLUMN.lastName],
      row[REGISTRY_COLUMN.birthDate]
    ) === targetKey;
  });
  if (duplicate) {
    const duplicateProject = normalizeProjectId_(duplicate[REGISTRY_COLUMN.projectId]);
    throw new Error(
      'Klient se stejným jménem a datem narození už existuje' +
      (duplicateProject ? ' v projektu ' + duplicateProject : '') + '.'
    );
  }
}

function saveClient_(clientInput, context) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const client = Object.assign({}, clientInput, { project_id: context.projectId });
    const rows = getRegistryRows_();
    const existingIndex = client.klient_id ? getClientIndexById_(client.klient_id) : null;
    let clientNumber;
    let registryRow;
    let existingRow;

    if (existingIndex) {
      if (requireProjectId_(existingIndex.project_id) !== context.projectId) {
        throw new Error('Projekt klienta nelze změnit.');
      }
      clientNumber = Number(existingIndex.client_number);
      registryRow = Number(existingIndex.registry_row);
      existingRow = rows[registryRow - 2];
      if (!existingRow) throw new Error('Klientský řádek nebyl nalezen.');
    } else {
      clientNumber = findNextClientNumberFromRows_(rows);
      registryRow = findFreeRegistryRow_(rows, clientNumber);
      existingRow = rows[registryRow - 2] || Array(23).fill('');
    }

    assertNoDuplicateClient_(rows, client, existingIndex ? clientNumber : '');
    const row = buildRegistryRowFromClient_(client, clientNumber, existingRow);
    getRegistrySheet_().getRange(registryRow, 1, 1, 23).setValues([row]);
    const index = ensureClientIndex_(clientNumber, context.projectId, registryRow, context.actorId);
    const savedClient = registryRowToClient_(row, registryRow);
    savedClient.klient_id = index.client_id;
    savedClient.source_system = 'NEW_APP';
    writeAudit_(context, existingIndex ? 'UPDATE' : 'CREATE', 'CLIENT', index.client_id, 'OK',
      'client_number=' + clientNumber);
    return savedClient;
  } catch (error) {
    writeAudit_(context, 'SAVE', 'CLIENT', clientInput && clientInput.klient_id, 'ERROR', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}
