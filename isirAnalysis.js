import {
  buildCaseStudyAnalysisPrompt,
  buildCaseStudyFinalPrompt,
  buildCaseStudyShorteningPrompt
} from './isirPrompts.js';
import {
  CLAIM_AMOUNT_EXTRACTION_PROMPT,
  STRUCTURED_REPORT_EXTRACTION_PROMPT,
  buildDataVerificationPrompt,
  buildDocumentAnalysisPrompt,
  buildDocumentFinalPrompt,
  buildStructuredFinalPrompt,
  isClaimApplicationDocument,
  isStructuredIsirDocument
} from './isirDocumentPrompts.js';

const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_DOCUMENTS = 10;
const MAX_PDF_BYTES = 18 * 1024 * 1024;
const GEMINI_MODEL = 'gemini-2.5-flash';

function currentDateInPrague(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) throw new Error('Požadavek na analýzu je příliš velký.');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function normalizeIsirPdfUrl(value) {
  const url = new URL(String(value || ''));
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'isir.justice.cz' ||
    !/\/isir\/doc\/dokument\.pdf$/i.test(url.pathname)
  ) {
    throw new Error('Analýza přijímá pouze PDF dokumenty z oficiálního ISIR.');
  }
  return url.toString();
}

function stripJsonFence(value) {
  const text = String(value || '').trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : text;
}

function parseGeminiJson(payload) {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini nevrátil text analýzy.');
  const parsed = JSON.parse(stripJsonFence(text));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini nevrátil platnou strukturu analýzy.');
  }
  return parsed;
}

function parseGeminiText(payload) {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  if (!text) throw new Error('Gemini nevrátil text analýzy.');
  return stripJsonFence(text);
}

function sectionText(value, key) {
  const text = String(value || '');
  const pattern = new RegExp(`\\[\\[SECTION:${key}:[^\\]]+\\]\\]\\s*([\\s\\S]*?)(?=\\[\\[SECTION:|$)`, 'i');
  return (text.match(pattern)?.[1] || '').trim();
}

function minimizeSummary(value) {
  const summary = sectionText(value, 'summary') || String(value || '');
  const compact = summary.replace(/\s+/g, ' ').trim();
  return compact.length > 280 ? `${compact.slice(0, 277).trim()}…` : compact;
}

async function generateGemini({ apiKey, parts, json = false, fetchImpl, signal }) {
  const upstream = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {})
      }),
      signal
    }
  );
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    throw new Error(payload?.error?.message || `Gemini analýza selhala (HTTP ${upstream.status}).`);
  }
  return payload;
}

async function fetchSelectedPdfs(documents, fetchImpl) {
  const result = [];
  let totalBytes = 0;
  for (const document of documents) {
    const sourceUrl = normalizeIsirPdfUrl(document.source_url);
    const upstream = await fetchImpl(sourceUrl, {
      headers: { 'User-Agent': 'CECH-MAS-Vykaznictvi/1.0' },
      signal: AbortSignal.timeout(45_000)
    });
    if (!upstream.ok) {
      throw new Error(`Dokument „${document.title || 'ISIR'}“ se nepodařilo stáhnout (HTTP ${upstream.status}).`);
    }
    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (!contentType.includes('pdf') && buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
      throw new Error(`Dokument „${document.title || 'ISIR'}“ není platné PDF.`);
    }
    totalBytes += buffer.length;
    if (totalBytes > MAX_PDF_BYTES) {
      throw new Error('Vybrané dokumenty jsou pro jednu analýzu příliš velké.');
    }
    result.push({ ...document, buffer });
  }
  return result;
}

async function analyzeSingleDocument({ document, pdf, apiKey, fetchImpl, signal }) {
  const structured = isStructuredIsirDocument(document);
  const claimApplication = isClaimApplicationDocument(document);
  const workingPayload = await generateGemini({
    apiKey,
    parts: [
      {
        text: claimApplication
          ? `${CLAIM_AMOUNT_EXTRACTION_PROMPT}\n\nMETADATA:\n${JSON.stringify({
            document_id: document.document_id,
            title: document.title,
            event_date: document.event_date
          }, null, 2)}`
          : structured
          ? `${STRUCTURED_REPORT_EXTRACTION_PROMPT}\n\nMETADATA:\n${JSON.stringify({
            document_id: document.document_id,
            title: document.title,
            event_date: document.event_date
          }, null, 2)}`
          : buildDocumentAnalysisPrompt(document)
      },
      { inlineData: { mimeType: 'application/pdf', data: pdf.buffer.toString('base64') } }
    ],
    json: true,
    fetchImpl,
    signal
  });
  const working = parseGeminiJson(workingPayload);
  const normalizedWorking = claimApplication
    ? {
      category: 'Přihláška pohledávky',
      working_analysis: {
        what_document_says: working.amount == null
          ? ['Celkovou částku se nepodařilo bezpečně vytěžit.']
          : [`Celková přihlášená pohledávka: ${working.amount} ${working.currency || 'CZK'}.`],
        practical_meaning_for_debt_advisor: ['Částka je určena pro kontrolní součet hlavních přihlášek.'],
        explicit_deadlines: [],
        explicit_debtor_obligations: [],
        advisor_recommendations: working.amount == null ? ['Ověřit částku ručně v poli V. Pohledávky celkem.'] : [],
        unclear_or_incomplete_information: working.amount == null ? [working.evidence || 'Cílové pole nebylo bezpečně nalezeno.'] : []
      },
      confidence: working.confidence || 'low'
    }
    : working;
  const finalPayload = await generateGemini({
    apiKey,
    parts: [{
      text: structured
        ? buildStructuredFinalPrompt(working)
        : buildDocumentFinalPrompt(normalizedWorking)
    }],
    fetchImpl,
    signal
  });
  const summaryText = parseGeminiText(finalPayload);
  return {
    document_id: String(document.document_id || ''),
    title: document.title || '',
    category: normalizedWorking.category || working.document_type || document.document_type || '',
    specialized_reader: claimApplication
      ? 'claim_amount'
      : structured
        ? 'debt_relief_structured_report'
        : 'general_document',
    structured_extraction: structured ? working : null,
    claim_amount_extraction: claimApplication ? working : null,
    working_analysis: structured ? null : (normalizedWorking.working_analysis || normalizedWorking),
    summary_text: summaryText,
    minimal_summary: minimizeSummary(summaryText),
    confidence: normalizedWorking.confidence || '',
    model: GEMINI_MODEL,
    analyzed_at: new Date().toISOString()
  };
}

function normalizedCorrections(value) {
  const allowed = new Set([
    'case_status',
    'proceeding_started_at',
    'proceeding_ended_at',
    'claims_deadline',
    'claims_count',
    'claims_total_amount',
    'last_event_at',
    'last_event_title'
  ]);
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && allowed.has(String(item.field || '')))
    .map((item) => ({
      field: String(item.field),
      label: String(item.label || item.field),
      current_value: item.current_value ?? null,
      proposed_value: item.proposed_value ?? null,
      source_document_id: String(item.source_document_id || ''),
      reason: String(item.reason || ''),
      confidence: String(item.confidence || 'low')
    }));
}

function baseAnalysis(input, documents, kind, result) {
  return {
    analysis_id: `${String(input.case?.case_id || 'case')}-${kind.toLowerCase()}-${Date.now()}`,
    case_id: String(input.case?.case_id || ''),
    client_id: String(input.client?.id || input.client?.client_id || ''),
    project_id: String(input.client?.projectId || input.client?.project_id || ''),
    kind,
    document_ids: documents.map((document) => String(document.document_id || '')),
    model: GEMINI_MODEL,
    created_at: new Date().toISOString(),
    result
  };
}

async function analyzeIsirDocuments(input, options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY není na serveru nastaven.');
  const fetchImpl = options.fetchImpl || fetch;
  const inputDocuments = Array.isArray(input.documents) ? input.documents : [];
  if (inputDocuments.length > MAX_DOCUMENTS) {
    throw new Error(`Pro jednu analýzu lze vybrat nejvýše ${MAX_DOCUMENTS} dokumentů.`);
  }
  const documents = inputDocuments.slice(0, MAX_DOCUMENTS);
  if (!documents.length) throw new Error('Vyberte alespoň jeden dokument k analýze.');
  const contextDocuments = Array.isArray(input.context_documents)
    ? input.context_documents
    : documents;
  const mode = String(input.mode || 'case-study');
  const pdfs = await fetchSelectedPdfs(documents, fetchImpl);
  const currentDate = currentDateInPrague();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    mode === 'document-summary' ? 900_000 : 360_000
  );

  try {
    if (mode === 'document-summary') {
      const documentSummaries = [];
      for (let index = 0; index < documents.length; index += 1) {
        options.onProgress?.({
          progress: 10 + Math.round((index / documents.length) * 80),
          message: `Čtení dokumentu ${index + 1}/${documents.length}: ${documents[index].title || 'ISIR'}`
        });
        documentSummaries.push(await analyzeSingleDocument({
          document: documents[index],
          pdf: pdfs[index],
          apiKey,
          fetchImpl,
          signal: controller.signal
        }));
      }
      return baseAnalysis(input, documents, 'DOCUMENT_SUMMARY', { document_summaries: documentSummaries });
    }

    if (mode === 'data-verification') {
      options.onProgress?.({ progress: 25, message: 'Porovnávám údaje aplikace s PDF.' });
      const payload = await generateGemini({
        apiKey,
        parts: [
          { text: buildDataVerificationPrompt({ caseItem: input.case, documents }) },
          ...pdfs.flatMap((document) => [
            { text: `PDF dokument ID ${document.document_id}: ${document.title || 'Dokument ISIR'}` },
            { inlineData: { mimeType: 'application/pdf', data: document.buffer.toString('base64') } }
          ])
        ],
        json: true,
        fetchImpl,
        signal: controller.signal
      });
      const verification = parseGeminiJson(payload);
      verification.recommended_corrections = normalizedCorrections(verification.recommended_corrections);
      return baseAnalysis(input, documents, 'DATA_VERIFICATION', { data_verification: verification });
    }

    options.onProgress?.({ progress: 22, message: 'Připravuji pracovní rozbor kazuistiky.' });
    const parts = [
      {
        text: buildCaseStudyAnalysisPrompt({
          caseItem: input.case,
          client: input.client,
          documents,
          contextDocuments,
          currentDate
        })
      },
      ...pdfs.flatMap((document) => [
        { text: `Následuje PDF s ID ${document.document_id}: ${document.title || 'Dokument ISIR'}` },
        { inlineData: { mimeType: 'application/pdf', data: document.buffer.toString('base64') } }
      ])
    ];
    const workingPayload = await generateGemini({
      apiKey,
      parts,
      json: true,
      fetchImpl,
      signal: controller.signal
    });
    const workingAnalysis = parseGeminiJson(workingPayload);
    options.onProgress?.({ progress: 65, message: 'Kontroluji a zkracuji finální kazuistiku.' });
    const finalPayload = await generateGemini({
      apiKey,
      parts: [{ text: buildCaseStudyFinalPrompt({ workingAnalysis, caseItem: input.case, currentDate }) }],
      fetchImpl,
      signal: controller.signal
    });
    let caseStudy = parseGeminiText(finalPayload);
    if (caseStudy.length > 6000) {
      const shortenedPayload = await generateGemini({
        apiKey,
        parts: [{ text: buildCaseStudyShorteningPrompt(caseStudy) }],
        fetchImpl,
        signal: controller.signal
      });
      caseStudy = parseGeminiText(shortenedPayload);
    }
    return baseAnalysis(input, documents, 'CASE_DOCUMENT_ANALYSIS', {
      working_case_analysis: workingAnalysis.working_case_analysis || workingAnalysis,
      case_study: caseStudy
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleIsirAnalysisRequest(request, response, options = {}) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { ok: false, error: 'Povolena je pouze metoda POST.' });
    return;
  }
  try {
    const input = await readJsonBody(request);
    const analysis = await analyzeIsirDocuments(input, options);
    sendJson(response, 200, { ok: true, analysis });
  } catch (error) {
    const status = error?.name === 'AbortError' ? 504 : 400;
    console.error('ISIR analysis failed:', error);
    sendJson(response, status, {
      ok: false,
      error: error?.name === 'AbortError'
        ? 'Analýza dokumentů překročila časový limit.'
        : String(error?.message || error || 'Analýza dokumentů selhala.')
    });
  }
}

export {
  MAX_DOCUMENTS,
  analyzeIsirDocuments,
  currentDateInPrague,
  handleIsirAnalysisRequest,
  minimizeSummary,
  normalizeIsirPdfUrl,
  normalizedCorrections,
  parseGeminiJson,
  parseGeminiText
};
