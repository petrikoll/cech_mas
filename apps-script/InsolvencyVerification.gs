const ISIR_CUTOFF_DATE = '2026-03-01';
const ISIR_CUZK_ENDPOINT = 'https://isir.justice.cz:8443/isir_cuzk_ws/IsirWsCuzkService';
const ISIR_DAILY_BATCH_SIZE = 40;
const ISIR_REVERIFY_AFTER_MS = 24 * 60 * 60 * 1000;
const ISIR_REQUEST_DELAY_MS = 1300;

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
