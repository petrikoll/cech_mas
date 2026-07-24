import {
  buildCaseStudyAnalysisPrompt,
  buildCaseStudyFinalPrompt,
  buildCaseStudyShorteningPrompt
} from './isirPrompts.js';

const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_DOCUMENTS = 10;
const MAX_PDF_BYTES = 18 * 1024 * 1024;
const GEMINI_MODEL = 'gemini-2.5-flash';

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
  if (!text) throw new Error('Gemini nevrátil text kazuistiky.');
  return stripJsonFence(text);
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
      throw new Error('Vybrané dokumenty jsou pro jednu analýzu příliš velké. Vyberte menší počet PDF.');
    }
    result.push({ ...document, buffer });
  }
  return result;
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

  const pdfs = await fetchSelectedPdfs(documents, fetchImpl);
  const currentDate = new Date().toISOString().slice(0, 10);
  const parts = [
    { text: buildCaseStudyAnalysisPrompt({
      caseItem: input.case,
      client: input.client,
      documents,
      currentDate
    }) },
    ...pdfs.flatMap((document) => [
      { text: `Následuje PDF s ID ${document.document_id}: ${document.title || 'Dokument ISIR'}` },
      { inlineData: { mimeType: 'application/pdf', data: document.buffer.toString('base64') } }
    ])
  ];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240_000);
  try {
    const workingPayload = await generateGemini({
      apiKey,
      parts,
      json: true,
      fetchImpl,
      signal: controller.signal
    });
    const workingAnalysis = parseGeminiJson(workingPayload);
    const finalPayload = await generateGemini({
      apiKey,
      parts: [{
        text: buildCaseStudyFinalPrompt({
          workingAnalysis,
          caseItem: input.case,
          currentDate
        })
      }],
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
    return {
      analysis_id: `${String(input.case?.case_id || 'case')}-${Date.now()}`,
      case_id: String(input.case?.case_id || ''),
      client_id: String(input.client?.id || input.client?.client_id || ''),
      project_id: String(input.client?.projectId || input.client?.project_id || ''),
      kind: 'CASE_DOCUMENT_ANALYSIS',
      document_ids: documents.map((document) => String(document.document_id || '')),
      model: GEMINI_MODEL,
      created_at: new Date().toISOString(),
      result: {
        working_case_analysis: workingAnalysis.working_case_analysis || workingAnalysis,
        case_study: caseStudy
      }
    };
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
  handleIsirAnalysisRequest,
  normalizeIsirPdfUrl,
  parseGeminiJson,
  parseGeminiText
};
