import { createHash } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';

const ISIR_CUZK_ENDPOINT =
  'https://isir.justice.cz:8443/isir_cuzk_ws/IsirWsCuzkService';
const ISIR_ORIGIN = 'https://isir.justice.cz';
const ISIR_CUTOFF_DATE = '2026-03-01';
const MAX_REQUEST_BYTES = 256 * 1024;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('Požadavek je příliš velký.'));
        request.destroy();
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
  }
  match = text.match(/^(\d{1,2})[./]\s*(\d{1,2})[./]\s*(\d{4})/);
  if (match) {
    return `${match[3]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  }
  return '';
}

function buildSoapRequest(client) {
  return [
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:typ="http://isirws.cca.cz/types/">',
    '<soapenv:Header/><soapenv:Body><typ:getIsirWsCuzkDataRequest>',
    `<nazevOsoby>${escapeXml(client.lastName)}</nazevOsoby>`,
    `<jmeno>${escapeXml(client.firstName)}</jmeno>`,
    `<datumNarozeni>${escapeXml(client.birthDate)}</datumNarozeni>`,
    '<maxPocetVysledku>20</maxPocetVysledku>',
    '<filtrAktualniRizeni>F</filtrAktualniRizeni>',
    '<vyhledatPresnouShoduJmen>T</vyhledatPresnouShoduJmen>',
    '<vyhledatBezDiakritiky>T</vyhledatBezDiakritiky>',
    '<maxRelevanceVysledku>4</maxRelevanceVysledku>',
    '</typ:getIsirWsCuzkDataRequest></soapenv:Body></soapenv:Envelope>'
  ].join('');
}

function localName(node) {
  return String(node?.localName || node?.nodeName || '').replace(/^.*:/, '');
}

function firstText(parent, name) {
  if (!parent) return '';
  const descendants = parent.getElementsByTagName('*');
  for (let index = 0; index < descendants.length; index += 1) {
    if (localName(descendants[index]) === name) {
      return String(descendants[index].textContent || '').trim();
    }
  }
  return '';
}

function elementsByLocalName(parent, name) {
  const matches = [];
  const descendants = parent?.getElementsByTagName?.('*') || [];
  for (let index = 0; index < descendants.length; index += 1) {
    if (localName(descendants[index]) === name) matches.push(descendants[index]);
  }
  return matches;
}

function parseSoapResponse(xmlText) {
  const document = new DOMParser().parseFromString(String(xmlText || ''), 'text/xml');
  const fault = elementsByLocalName(document, 'Fault')[0];
  if (fault) throw new Error(firstText(fault, 'faultstring') || 'ISIR vrátil chybu SOAP.');

  const status = elementsByLocalName(document, 'stav')[0];
  const errorCode = firstText(status, 'kodChyby');
  if (errorCode && errorCode !== 'WS2') {
    throw new Error(
      [errorCode, firstText(status, 'textChyby'), firstText(status, 'popisChyby')]
        .filter(Boolean)
        .join(': ')
    );
  }

  return elementsByLocalName(document, 'data')
    .map((element) => {
      const senate = firstText(element, 'cisloSenatu');
      const caseType = firstText(element, 'druhVec') || 'INS';
      const caseNumber = firstText(element, 'bcVec');
      const year = firstText(element, 'rocnik');
      const proceedingStartedAt = normalizeDate(firstText(element, 'datumPmZahajeniUpadku'));
      return {
        case_id: [senate, caseType, caseNumber, year].filter(Boolean).join('-'),
        case_number: `${senate} ${caseType} ${caseNumber}/${year}`.trim(),
        proceeding_started_at: proceedingStartedAt,
        proceeding_ended_at: normalizeDate(firstText(element, 'datumPmUkonceniUpadku')),
        case_status: firstText(element, 'druhStavKonkursu'),
        detail_url: firstText(element, 'urlDetailRizeni'),
        relevance: Number(firstText(status, 'relevanceVysledku') || 4),
        additional_debtor: firstText(element, 'dalsiDluznikVRizeni') === 'T',
        city: firstText(element, 'mesto')
      };
    })
    .filter((item) => item.relevance <= 4 && !item.additional_debtor);
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stableId(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
}

function parsePdfLinksFromSegment(segment, caseId, seen, rowIsMain = true) {
  const text = String(segment || '');
  const linkPattern = /<a\b[^>]*href\s*=\s*["']([^"']*dokument\.PDF[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const documents = [];
  let match;
  while ((match = linkPattern.exec(text))) {
    const sourceUrl = new URL(match[1].replace(/&amp;/gi, '&'), ISIR_ORIGIN).toString();
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    const nearbyText = decodeHtml(text.slice(Math.max(0, match.index - 420), match.index));
    const dates = [...nearbyText.matchAll(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/g)];
    const lastDate = dates.length ? dates[dates.length - 1] : null;
    documents.push({
      document_id: stableId(sourceUrl),
      case_id: caseId,
      title: decodeHtml(match[2]) || 'Dokument ISIR',
      document_type: 'PDF',
      is_main: rowIsMain && documents.length === 0 ? 'Ano' : 'Ne',
      is_new: '',
      included_in_case_study: '',
      analysis_status: '',
      analysis_json: '',
      analysis_at: '',
      event_date: lastDate
        ? `${lastDate[3]}-${String(Number(lastDate[2])).padStart(2, '0')}-${String(Number(lastDate[1])).padStart(2, '0')}`
        : '',
      source_url: sourceUrl,
      drive_file_id: '',
      drive_url: '',
      original_size: '',
      stored_size: ''
    });
  }
  return documents;
}

function parseDocumentsFromDetail(html, caseId) {
  const text = String(html || '');
  const rows = [...text.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  const seen = new Set();
  const documents = [];
  if (rows.length) {
    rows.forEach((row) => documents.push(...parsePdfLinksFromSegment(row, caseId, seen, true)));
  }
  if (!documents.length) {
    documents.push(...parsePdfLinksFromSegment(text, caseId, seen, true));
  } else {
    documents.push(...parsePdfLinksFromSegment(text, caseId, seen, false));
  }
  return documents;
}

function addMonths(dateValue, months) {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

async function loadCaseDocuments(caseItem, fetchImpl) {
  if (!caseItem.detail_url) return [];
  try {
    const response = await fetchImpl(caseItem.detail_url, {
      headers: { 'User-Agent': 'CECH-MAS-Vykaznictvi/1.0' },
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) return [];
    return parseDocumentsFromDetail(await response.text(), caseItem.case_id);
  } catch (error) {
    console.warn(`ISIR detail load failed for ${caseItem.case_id}:`, error.message);
    return [];
  }
}

async function checkClient(client, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const normalized = {
    id: String(client?.id || client?.client_id || '').trim(),
    number: Number(client?.number || client?.client_number || 0),
    projectId: String(client?.projectId || client?.project_id || '').trim().toUpperCase(),
    firstName: String(client?.firstName || client?.jmeno || '').trim(),
    lastName: String(client?.lastName || client?.prijmeni || '').trim(),
    birthDate: normalizeDate(client?.birthDate || client?.datumNarozeni || client?.datum_narozeni)
  };
  if (!normalized.id || !['CECH', 'MAS'].includes(normalized.projectId)) {
    throw new Error('Klient nemá platné ID nebo projekt.');
  }
  if (!normalized.firstName || !normalized.lastName || !normalized.birthDate) {
    throw new Error('Pro kontrolu ISIR je nutné jméno, příjmení a datum narození.');
  }

  const response = await fetchImpl(ISIR_CUZK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '',
      'User-Agent': 'CECH-MAS-Vykaznictvi/1.0'
    },
    body: buildSoapRequest(normalized),
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`ISIR neodpověděl úspěšně (HTTP ${response.status}).`);

  const cases = parseSoapResponse(await response.text());
  const documentsByCase = await Promise.all(
    cases.map((caseItem) => loadCaseDocuments(caseItem, fetchImpl))
  );
  const documents = documentsByCase.flat();
  const qualifying = cases
    .filter((item) => item.proceeding_started_at >= ISIR_CUTOFF_DATE)
    .sort((left, right) => right.proceeding_started_at.localeCompare(left.proceeding_started_at))[0] || null;
  const latest = [...cases]
    .sort((left, right) => right.proceeding_started_at.localeCompare(left.proceeding_started_at))[0] || null;
  const checkedAt = new Date().toISOString();
  const enrichedCases = cases.map((item) => {
    const caseDocuments = documents
      .filter((document) => document.case_id === item.case_id)
      .sort((left, right) => String(right.event_date || '').localeCompare(String(left.event_date || '')));
    const latestDocument = caseDocuments[0] || null;
    const insolvencyDecision = caseDocuments.find((document) =>
      /usnesen[íi].*(úpadku|upadku)|(úpadku|upadku).*usnesen[íi]/i.test(document.title)
    );
    const claimDocuments = caseDocuments.filter((document) =>
      /přihl[aá]ška pohled[aá]vky/i.test(document.title)
    );
    return {
      ...item,
      client_id: normalized.id,
      client_number: normalized.number,
      project_id: normalized.projectId,
      checked_at: checkedAt,
      document_count: caseDocuments.length,
      main_document_count: caseDocuments.filter((document) => document.is_main === 'Ano').length,
      secondary_document_count: caseDocuments.filter((document) => document.is_main !== 'Ano').length,
      last_event_at: latestDocument?.event_date || '',
      last_event_title: latestDocument?.title || '',
      claims_deadline: insolvencyDecision ? addMonths(insolvencyDecision.event_date, 2) : '',
      claims_count: claimDocuments.length,
      claims_total_amount: '',
      ai_status: '',
      ai_model: '',
      ai_checked_at: '',
      ai_summary_json: '',
      ai_case_study: '',
      ai_case_study_at: ''
    };
  });

  return {
    verification: {
      client_id: normalized.id,
      client_number: normalized.number,
      project_id: normalized.projectId,
      matched: qualifying ? 'Ano' : 'Ne',
      insolvency_date: qualifying?.proceeding_started_at || '',
      case_number: qualifying?.case_number || latest?.case_number || '',
      detail_url: qualifying?.detail_url || latest?.detail_url || '',
      case_status: qualifying?.case_status || latest?.case_status || '',
      verified_at: checkedAt,
      source: 'ISIR_CUZK_WS_SERVER',
      source_status: qualifying ? 'QUALIFIED' : cases.length ? 'BEFORE_CUTOFF' : 'NOT_FOUND'
    },
    cases: enrichedCases,
    documents: documents.map((item) => ({
      ...item,
      client_id: normalized.id,
      project_id: normalized.projectId,
      checked_at: checkedAt
    }))
  };
}

async function handleIsirRequest(request, response, options = {}) {
  if (request.method !== 'POST') {
    response.writeHead(405, { Allow: 'POST' });
    response.end();
    return;
  }
  try {
    const payload = JSON.parse((await readRequestBody(request)) || '{}');
    if (payload.action !== 'checkClient') {
      sendJson(response, 400, { ok: false, error: 'Neznámá akce ISIR.' });
      return;
    }
    const snapshot = await checkClient(payload.client || {}, options);
    sendJson(response, 200, { ok: true, snapshot });
  } catch (error) {
    console.error('ISIR request failed:', error);
    sendJson(response, 502, {
      ok: false,
      error: String(error?.message || error || 'Kontrola ISIR selhala.')
    });
  }
}

export {
  ISIR_CUTOFF_DATE,
  buildSoapRequest,
  checkClient,
  handleIsirRequest,
  parseDocumentsFromDetail,
  parseSoapResponse
};
