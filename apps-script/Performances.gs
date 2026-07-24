function normalizeActivityCodes_(value) {
  let codes = value;
  if (typeof codes === 'string') {
    const text = codes.trim();
    if (text.startsWith('[')) {
      try {
        codes = JSON.parse(text);
      } catch (error) {
        throw new Error('Neplatný seznam činností.');
      }
    } else {
      codes = splitList_(text);
    }
  }
  if (!Array.isArray(codes)) codes = [];

  const normalized = Array.from(new Set(codes.map((code) =>
    String(code || '').trim().toUpperCase()
  ).filter(Boolean)));
  if (!normalized.length) throw new Error('Vyberte alespoň jednu činnost KA1.');

  normalized.forEach((code) => {
    if (!Object.prototype.hasOwnProperty.call(ACTIVITY_CATALOG, code)) {
      throw new Error('Neplatný kód činnosti: ' + code);
    }
  });

  const phases = Array.from(new Set(normalized.map((code) => ACTIVITY_CATALOG[code].phaseCode)));
  if (phases.length !== 1) {
    throw new Error('Jeden výkon může obsahovat činnosti pouze z jedné fáze podpory.');
  }
  return normalized.sort();
}

function timeToMinutes_(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function calculateDurationMinutes_(startTime, endTime, explicitDuration) {
  const start = timeToMinutes_(startTime);
  const end = timeToMinutes_(endTime);
  if (start !== null || end !== null) {
    if (start === null || end === null) throw new Error('Vyplňte začátek i konec výkonu.');
    if (end <= start) throw new Error('Konec výkonu musí být později než začátek.');
    const duration = end - start;
    if (duration > 720) throw new Error('Délka jednoho výkonu nesmí překročit 12 hodin.');
    return duration;
  }

  const duration = Number(explicitDuration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 720) {
    throw new Error('Neplatná délka výkonu.');
  }
  return Math.round(duration);
}

function buildIdempotencyKey_(performance) {
  const seed = [
    performance.project_id,
    performance.client_id,
    performance.date,
    performance.start_time,
    performance.end_time,
    performance.duration_minutes,
    performance.activity_codes_json,
    normalizeText_(performance.worker_id || performance.worker_name),
    normalizeText_(performance.case_note)
  ].join('|');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
  return digest.map((byte) => ('0' + (byte & 0xff).toString(16)).slice(-2)).join('');
}

function buildClientIdentityMap_() {
  const registryRows = getRegistryRows_();
  return readDataObjects_(DATA_SHEETS.clientIndex).reduce((map, index) => {
    const row = registryRows[Number(index.registry_row) - 2];
    if (!row || !isOccupiedRegistryRow_(row)) return map;
    map[String(index.client_id || '')] = buildGlobalClientIdentityKey_(
      row[REGISTRY_COLUMN.firstName],
      row[REGISTRY_COLUMN.lastName],
      row[REGISTRY_COLUMN.birthDate]
    );
    return map;
  }, {});
}

function buildGlobalPerformanceDuplicateKey_(performance, clientIdentity) {
  let activityCodes = performance.activity_codes_json || performance.activity_codes || [];
  try {
    activityCodes = normalizeActivityCodes_(activityCodes).join(',');
  } catch (error) {
    activityCodes = normalizeText_(activityCodes);
  }
  const seed = [
    clientIdentity,
    normalizeText_(performance.date),
    normalizeText_(performance.start_time),
    normalizeText_(performance.end_time),
    Number(performance.duration_minutes || 0),
    activityCodes,
    normalizeMatchText_(performance.meeting_form),
    normalizeMatchText_(performance.place),
    normalizeMatchText_(performance.case_note)
  ].join('|');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
  return digest.map((byte) => ('0' + (byte & 0xff).toString(16)).slice(-2)).join('');
}

function requireClientForProject_(clientId, projectId) {
  const index = getClientIndexById_(clientId);
  if (!index) {
    const fallbackNumberMatch = String(clientId || '').match(/^client-(\d+)$/);
    if (fallbackNumberMatch) {
      const byNumber = getClientIndexByNumber_(Number(fallbackNumberMatch[1]));
      if (byNumber) return requireClientForProject_(byNumber.client_id, projectId);
    }
    throw new Error('Klient nebyl nalezen v aplikačním indexu.');
  }
  if (requireProjectId_(index.project_id) !== requireProjectId_(projectId)) {
    throw new Error('Klient nepatří do aktivního projektu.');
  }
  return index;
}

function normalizePerformanceInput_(input, context) {
  const clientId = String(input.klient_id || input.client_id || '').trim();
  if (!clientId) throw new Error('Chybí klient výkonu.');
  const clientIndex = requireClientForProject_(clientId, context.projectId);
  const activityCodes = normalizeActivityCodes_(
    input.activity_codes || input.activity_codes_json || input.kody_cinnosti
  );
  const phaseCode = ACTIVITY_CATALOG[activityCodes[0]].phaseCode;
  const date = normalizeIsoDate_(input.datum || input.date || todayIso_());
  const startTime = normalizeText_(input.cas_od || input.start_time);
  const endTime = normalizeText_(input.cas_do || input.end_time);
  const durationMinutes = calculateDurationMinutes_(
    startTime,
    endTime,
    input.duration_minutes || (
      input.pocet_hodin !== '' && input.pocet_hodin !== undefined
        ? Number(input.pocet_hodin) * 60
        : ''
    )
  );
  const timestamp = nowIso_();

  const normalized = {
    performance_id: normalizeText_(input.vykon_id || input.performance_id) || uuid_(),
    project_id: context.projectId,
    client_id: clientIndex.client_id,
    client_number: Number(clientIndex.client_number),
    phase_code: phaseCode,
    activity_codes_json: JSON.stringify(activityCodes),
    meeting_form: normalizeText_(input.forma_poskytovani || input.meeting_form),
    date: date,
    place: normalizeText_(input.misto || input.place),
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationMinutes,
    case_note: normalizeText_(input.popis || input.case_note || input.dokument_text),
    worker_id: context.actorId,
    worker_name: normalizeText_(input.pracovnik || input.worker_name || context.displayName),
    status: 'ACTIVE',
    source_system: 'NEW_APP',
    idempotency_key: normalizeText_(input.idempotency_key),
    created_at: timestamp,
    created_by: context.actorId,
    updated_at: timestamp,
    updated_by: context.actorId
  };
  normalized.idempotency_key = normalized.idempotency_key || buildIdempotencyKey_(normalized);
  return normalized;
}

function savePerformance_(performanceInput, context) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const normalized = normalizePerformanceInput_(performanceInput || {}, context);
    const rows = readDataObjects_(DATA_SHEETS.performances);
    const identityByClientId = buildClientIdentityMap_();
    const normalizedDuplicateKey = buildGlobalPerformanceDuplicateKey_(
      normalized,
      identityByClientId[normalized.client_id] || normalized.client_id
    );
    const duplicate = rows.find((row) =>
      String(row.status || '').toUpperCase() === 'ACTIVE' &&
      (
        String(row.idempotency_key || '') === normalized.idempotency_key ||
        buildGlobalPerformanceDuplicateKey_(
          row,
          identityByClientId[String(row.client_id || '')] || String(row.client_id || '')
        ) === normalizedDuplicateKey
      )
    );
    if (duplicate) {
      const result = Object.assign({}, duplicate);
      delete result.__rowNumber;
      return result;
    }

    const existing = rows.find((row) =>
      String(row.performance_id || '') === normalized.performance_id
    );
    if (existing) {
      if (requireProjectId_(existing.project_id) !== context.projectId) {
        throw new Error('Výkon patří do jiného projektu.');
      }
      normalized.created_at = existing.created_at;
      normalized.created_by = existing.created_by;
      updateDataObjectAtRow_(DATA_SHEETS.performances, existing.__rowNumber, normalized);
      writeAudit_(context, 'UPDATE', 'PERFORMANCE', normalized.performance_id, 'OK',
        'duration_minutes=' + normalized.duration_minutes);
      return normalized;
    }

    appendDataObject_(DATA_SHEETS.performances, normalized);
    writeAudit_(context, 'CREATE', 'PERFORMANCE', normalized.performance_id, 'OK',
      'duration_minutes=' + normalized.duration_minutes);
    return normalized;
  } catch (error) {
    writeAudit_(context, 'SAVE', 'PERFORMANCE',
      performanceInput && (performanceInput.vykon_id || performanceInput.performance_id),
      'ERROR', error.message);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function listPerformances_(projectId) {
  const normalizedProjectId = requireProjectId_(projectId);
  return readDataObjects_(DATA_SHEETS.performances)
    .filter((row) =>
      normalizeProjectId_(row.project_id) === normalizedProjectId &&
      String(row.status || '').toUpperCase() === 'ACTIVE'
    )
    .map((row) => {
      const result = Object.assign({}, row);
      delete result.__rowNumber;
      return result;
    });
}

function deletePerformance_(performanceId, context) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const rows = readDataObjects_(DATA_SHEETS.performances);
    const existing = rows.find((row) =>
      String(row.performance_id || '') === String(performanceId || '')
    );
    if (!existing) throw new Error('Výkon nebyl nalezen.');
    if (requireProjectId_(existing.project_id) !== context.projectId) {
      throw new Error('Výkon patří do jiného projektu.');
    }
    const updated = Object.assign({}, existing, {
      status: 'CANCELLED',
      updated_at: nowIso_(),
      updated_by: context.actorId
    });
    delete updated.__rowNumber;
    updateDataObjectAtRow_(DATA_SHEETS.performances, existing.__rowNumber, updated);
    writeAudit_(context, 'CANCEL', 'PERFORMANCE', existing.performance_id, 'OK', '');
    return { performance_id: existing.performance_id, status: 'CANCELLED' };
  } finally {
    lock.releaseLock();
  }
}
