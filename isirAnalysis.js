import {
  buildCaseStudyAnalysisPrompt,
  buildCaseStudyFinalPrompt,
  buildCaseStudyShorteningPrompt
} from './isirPrompts.js';
import {
  CLAIM_AMOUNT_EXTRACTION_PROMPT,
  DOCUMENT_ANALYSIS_PROMPT,
  STRUCTURED_REPORT_EXTRACTION_PROMPT,
  buildDataVerificationPrompt,
  buildDocumentFinalPrompt,
  buildStructuredFinalPrompt,
  isClaimApplicationDocument,
  isStructuredIsirDocument
} from './isirDocumentPrompts.js';

const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_DOCUMENTS = 14;
const MAX_DOCUMENT_SUMMARY_DOCUMENTS = 10;
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

function parseLocalizedNumber(value) {
  if (value === null || value === '' || value === undefined) return NaN;
  if (typeof value === 'number') return value;
  let text = String(value).replace(/\u00a0/g, ' ').replace(/[^\d,.\s-]/g, '').trim();
  if (!text) return NaN;
  text = text.replace(/\s/g, '');
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1) {
    text = text.replace(/\./g, '');
  }
  return Number(text);
}

async function generateGemini({ apiKey, parts, json = false, fetchImpl, signal }) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
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
      if (upstream.ok) return payload;
      const error = new Error(
        payload?.error?.message || `Gemini analýza selhala (HTTP ${upstream.status}).`
      );
      if (upstream.status !== 429 && upstream.status < 500) throw error;
      lastError = error;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error;
    }
    if (attempt < 2) {
      await new Promise((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(Object.assign(new Error('Analýza byla přerušena.'), { name: 'AbortError' }));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, 1500 * (attempt + 1));
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }
  throw lastError || new Error('Gemini analýza selhala.');
}

async function generateGeminiJson(options) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload = await generateGemini({ ...options, json: true });
    try {
      return parseGeminiJson(payload);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Gemini nevrátil platný JSON.');
}

async function generateGeminiText(options) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload = await generateGemini(options);
    try {
      return parseGeminiText(payload);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Gemini nevrátil text analýzy.');
}

async function fetchSelectedPdfs(documents, fetchImpl, onProgress) {
  const result = [];
  let totalBytes = 0;
  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    onProgress?.({
      progress: 3 + Math.round((index / Math.max(1, documents.length)) * 15),
      message: `Načítám ${index + 1}/${documents.length} dokumentu: ${document.title || 'ISIR'}`
    });
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

function cachedStructuredExtraction(document) {
  try {
    const cached = typeof document?.analysis_json === 'object'
      ? document.analysis_json
      : JSON.parse(String(document?.analysis_json || ''));
    if (cached?.structured_extraction) return cached.structured_extraction;
    if (cached?.document_family === 'debt_relief_structured_report') return cached;
  } catch {
    // Dokument zatím nemá platné uložené strukturované vytěžení.
  }
  return null;
}

async function extractStructuredDocument({ document, pdf, apiKey, fetchImpl, signal }) {
  const structuredExtraction = await generateGeminiJson({
    apiKey,
    parts: [
      {
        text: `${STRUCTURED_REPORT_EXTRACTION_PROMPT}\n\nNázev dokumentu v ISIR: ${document.title || document.document_type || ''}`
      },
      { inlineData: { mimeType: 'application/pdf', data: pdf.buffer.toString('base64') } }
    ],
    fetchImpl,
    signal
  });
  const amount = parseLocalizedNumber(extraction.amount);
  return {
    document_id: String(document.document_id || ''),
    title: document.title || '',
    specialized_reader: 'debt_relief_structured_report',
    structured_extraction: structuredExtraction,
    confidence: structuredExtraction.confidence || '',
    model: GEMINI_MODEL,
    analyzed_at: new Date().toISOString()
  };
}

async function extractClaimAmount({ document, pdf, apiKey, fetchImpl, signal }) {
  const extraction = await generateGeminiJson({
    apiKey,
    parts: [
      {
        text: `${CLAIM_AMOUNT_EXTRACTION_PROMPT}\n\nNázev dokumentu v ISIR: ${document.title || document.document_type || ''}`
      },
      { inlineData: { mimeType: 'application/pdf', data: pdf.buffer.toString('base64') } }
    ],
    fetchImpl,
    signal
  });
  return {
    document_id: String(document.document_id || ''),
    title: document.title || '',
    amount: Number.isFinite(amount) ? amount : null,
    currency: extraction.currency || 'CZK',
    evidence: extraction.evidence || '',
    confidence: extraction.confidence || 'low'
  };
}

async function analyzeDocumentSelection({
  input,
  documents,
  pdfs,
  apiKey,
  fetchImpl,
  signal
}) {
  const allStructured = documents.every(isStructuredIsirDocument);
  if (allStructured) {
    const cachedPayloads = documents.map(cachedStructuredExtraction).filter(Boolean);
    if (!cachedPayloads.length) {
      const summaryText = [
        '[[SECTION:summary:Shrnutí]]',
        'Vybrané formulářové dokumenty zatím nemají uložená strukturovaná data. Shrnutí nebylo znovu spuštěno nad PDF.',
        '',
        '[[SECTION:deadlines:Lhůty a povinnosti]]',
        'Z těchto dokumentů zatím nejsou bezpečně vytěžena data pro lhůty nebo povinnosti.',
        '',
        '[[SECTION:other:Ostatní informace a doporučení]]',
        'Nechte nejprve doběhnout automatickou strukturovanou extrakci a potom shrnutí vytvořte znovu.'
      ].join('\n');
      return baseAnalysis(input, documents, 'DOCUMENT_SUMMARY', {
        document_summary: {
          title: 'Formulářová data zatím nejsou vytěžena',
          summary_text: summaryText,
          minimal_summary: minimizeSummary(summaryText),
          document_ids: documents.map((document) => String(document.document_id || '')),
          model: GEMINI_MODEL
        }
      });
    }
    const summaryText = await generateGeminiText({
      apiKey,
      parts: [{
        text: buildStructuredFinalPrompt({
          documents: cachedPayloads,
          missing_documents: documents
            .filter((document) => !cachedStructuredExtraction(document))
            .map((document) => ({ id: document.document_id, title: document.title }))
        })
      }],
      fetchImpl,
      signal
    });
    const structuredTitle = {
      review_report: 'Zpráva pro oddlužení / zpráva o přezkumu',
      performance_report: 'Sdělení správce o plnění oddlužení',
      completion_report: 'Sdělení správce o splnění oddlužení',
      trustee_fee_accounting: 'Vyúčtování odměny a výdajů správce',
      mixed: 'Formulářový dokument správce k oddlužení'
    }[String(cachedPayloads[0]?.document_type || '')]
      || 'Formulářový dokument správce k oddlužení';
    return baseAnalysis(input, documents, 'DOCUMENT_SUMMARY', {
      document_summary: {
        title: structuredTitle,
        summary_text: summaryText,
        minimal_summary: minimizeSummary(summaryText),
        document_ids: documents.map((document) => String(document.document_id || '')),
        model: GEMINI_MODEL
      }
    });
  }

  const documentList = documents
    .map((document) => `- ${document.event_date || 'bez data'}: ${document.title || document.document_type || 'dokument'}`)
    .join('\n');
  const workingAnalysis = await generateGeminiJson({
    apiKey,
    parts: [
      ...pdfs.flatMap((document) => [
        { text: `PDF dokument: ${document.title || 'Dokument ISIR'}` },
        { inlineData: { mimeType: 'application/pdf', data: document.buffer.toString('base64') } }
      ]),
      { text: `${DOCUMENT_ANALYSIS_PROMPT}\n\nVybrané dokumenty:\n${documentList}` }
    ],
    fetchImpl,
    signal
  });
  const summaryText = await generateGeminiText({
    apiKey,
    parts: [{ text: buildDocumentFinalPrompt(workingAnalysis) }],
    fetchImpl,
    signal
  });
  return baseAnalysis(input, documents, 'DOCUMENT_SUMMARY', {
    document_summary: {
      title: workingAnalysis.category || 'Shrnutí vybraných dokumentů',
      summary_text: summaryText,
      minimal_summary: minimizeSummary(summaryText),
      document_ids: documents.map((document) => String(document.document_id || '')),
      model: GEMINI_MODEL
    },
    working_document_analysis: workingAnalysis
  });
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
  const mode = String(input.mode || 'case-study');
  const documentLimit = mode === 'document-summary'
    ? MAX_DOCUMENT_SUMMARY_DOCUMENTS
    : MAX_DOCUMENTS;
  if (inputDocuments.length > documentLimit) {
    throw new Error(`Pro tuto analýzu lze vybrat nejvýše ${documentLimit} dokumentů.`);
  }
  const documents = inputDocuments.slice(0, documentLimit);
  if (!documents.length) throw new Error('Vyberte alespoň jeden dokument k analýze.');
  const contextDocuments = Array.isArray(input.context_documents)
    ? input.context_documents
    : documents;
  const currentDate = currentDateInPrague();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    ['document-summary', 'structured-extraction'].includes(mode) ? 900_000 : 360_000
  );

  try {
    if (mode === 'document-summary') {
      options.onProgress?.({ progress: 8, message: 'Připravuji vybrané dokumenty pro AI shrnutí.' });
      const allStructuredDocuments = documents.every(isStructuredIsirDocument);
      const pdfs = allStructuredDocuments
        ? []
        : await fetchSelectedPdfs(documents, fetchImpl, options.onProgress);
      options.onProgress?.({
        progress: 45,
        message: `Vytvářím jedno shrnutí z ${documents.length} vybraných dokumentů.`
      });
      return await analyzeDocumentSelection({
        input,
        documents,
        pdfs,
        apiKey,
        fetchImpl,
        signal: controller.signal
      });
    }

    if (mode === 'structured-extraction') {
      if (!documents.every(isStructuredIsirDocument)) {
        throw new Error('Strukturovanou extrakci lze spustit pouze pro podporované formulářové dokumenty.');
      }
      const pdfs = await fetchSelectedPdfs(documents, fetchImpl, options.onProgress);
      const structuredExtractions = [];
      for (let index = 0; index < documents.length; index += 1) {
        options.onProgress?.({
          progress: 10 + Math.round((index / documents.length) * 80),
          message: `Strukturovaně čtu formulář ${index + 1}/${documents.length}: ${documents[index].title || 'ISIR'}`
        });
        structuredExtractions.push(await extractStructuredDocument({
          document: documents[index],
          pdf: pdfs[index],
          apiKey,
          fetchImpl,
          signal: controller.signal
        }));
      }
      return baseAnalysis(input, documents, 'STRUCTURED_DOCUMENT_EXTRACTION', {
        structured_extractions: structuredExtractions
      });
    }

    if (mode === 'claim-extraction') {
      if (!documents.every((document) =>
        isClaimApplicationDocument(document) && String(document.is_main || '') === 'Ano'
      )) {
        throw new Error('Částky lze číst pouze z hlavních dokumentů přihlášek pohledávek.');
      }
      const pdfs = await fetchSelectedPdfs(documents, fetchImpl, options.onProgress);
      const claimAmountExtractions = [];
      for (let index = 0; index < documents.length; index += 1) {
        options.onProgress?.({
          progress: 10 + Math.round((index / documents.length) * 80),
          message: `Čtu částku z přihlášky ${index + 1}/${documents.length}: ${documents[index].title || 'ISIR'}`
        });
        claimAmountExtractions.push(await extractClaimAmount({
          document: documents[index],
          pdf: pdfs[index],
          apiKey,
          fetchImpl,
          signal: controller.signal
        }));
      }
      const parsedExistingAmount = parseLocalizedNumber(input.case?.claims_total_amount);
      const existingAmount = Number.isFinite(parsedExistingAmount) ? parsedExistingAmount : 0;
      const addedAmount = claimAmountExtractions.reduce(
        (sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0),
        0
      );
      return baseAnalysis(input, documents, 'CLAIM_AMOUNT_EXTRACTION', {
        claim_amount_extractions: claimAmountExtractions,
        claims_total_amount_added: addedAmount,
        claims_total_amount: existingAmount + addedAmount
      });
    }

    if (mode === 'data-verification') {
      const pdfs = await fetchSelectedPdfs(documents, fetchImpl, options.onProgress);
      options.onProgress?.({ progress: 25, message: 'Porovnávám údaje aplikace s PDF.' });
      const verification = await generateGeminiJson({
        apiKey,
        parts: [
          { text: buildDataVerificationPrompt({ caseItem: input.case, documents }) },
          ...pdfs.flatMap((document) => [
            { text: `PDF dokument ID ${document.document_id}: ${document.title || 'Dokument ISIR'}` },
            { inlineData: { mimeType: 'application/pdf', data: document.buffer.toString('base64') } }
          ])
        ],
        fetchImpl,
        signal: controller.signal
      });
      verification.recommended_corrections = normalizedCorrections(verification.recommended_corrections);
      return baseAnalysis(input, documents, 'DATA_VERIFICATION', { data_verification: verification });
    }

    const pdfs = await fetchSelectedPdfs(documents, fetchImpl, options.onProgress);
    options.onProgress?.({ progress: 22, message: 'Vytvářím pracovní rozbor kazuistiky.' });
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
    const workingAnalysis = await generateGeminiJson({
      apiKey,
      parts,
      fetchImpl,
      signal: controller.signal
    });
    options.onProgress?.({ progress: 65, message: 'Kontroluji a zkracuji finální kazuistiku.' });
    let caseStudy = await generateGeminiText({
      apiKey,
      parts: [{ text: buildCaseStudyFinalPrompt({ workingAnalysis, caseItem: input.case, currentDate }) }],
      fetchImpl,
      signal: controller.signal
    });
    if (caseStudy.length > 6000) {
      caseStudy = await generateGeminiText({
        apiKey,
        parts: [{ text: buildCaseStudyShorteningPrompt(caseStudy) }],
        fetchImpl,
        signal: controller.signal
      });
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
  parseLocalizedNumber,
  parseGeminiJson,
  parseGeminiText
};
