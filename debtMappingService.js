const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_CONTEXT_TEXT = 120_000;

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
    if (size > MAX_REQUEST_BYTES) {
      const error = new Error('Podklady pro mapování jsou příliš rozsáhlé.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function text(value, maxLength = 8_000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactArray(value, maxItems) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, maxItems) : [];
}

function boundedJson(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return text(value, 6_000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => boundedJson(item, depth + 1));
  if (typeof value !== 'object') return text(value, 500);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, item]) => [text(key, 120), boundedJson(item, depth + 1)])
  );
}

function normalizeDebtMappingContext(input = {}) {
  const client = input.client && typeof input.client === 'object' ? input.client : {};
  const monitoring = input.monitoring && typeof input.monitoring === 'object' ? input.monitoring : {};
  const isir = input.isir && typeof input.isir === 'object' ? input.isir : {};

  const normalized = {
    client: {
      id: text(client.id, 120),
      number: text(client.number, 30),
      fullName: text(client.fullName, 240),
      birthDate: text(client.birthDate, 30),
      projectId: text(client.projectId, 20),
      address: text(client.address, 500),
      employmentStatus: text(client.employmentStatus, 500),
      disadvantage: text(client.disadvantage, 1_000),
      projectEntryDate: text(client.projectEntryDate, 30),
      note: text(client.note, 4_000)
    },
    monitoring: {
      sourceAvailable: Boolean(monitoring.sourceAvailable),
      sourceUrl: text(monitoring.sourceUrl, 1_000),
      performances: compactArray(monitoring.performances, 80).map((item) => ({
        date: text(item.date, 30),
        activities: compactArray(item.activities, 12).map((value) => text(value, 80)),
        title: text(item.title, 500),
        note: text(item.note, 4_000),
        worker: text(item.worker, 240),
        durationMinutes: numberOrNull(item.durationMinutes)
      }))
    },
    paymentPlans: compactArray(input.paymentPlans, 40).map((item) => ({
      creditorType: text(item.creditorType, 500),
      debtAmount: numberOrNull(item.debtAmount),
      firstPaymentMonth: text(item.firstPaymentMonth, 20),
      plannedInstallments: numberOrNull(item.plannedInstallments),
      plannedEndMonth: text(item.plannedEndMonth, 20),
      averagePayment: numberOrNull(item.averagePayment),
      status: text(item.status, 80),
      notes: text(item.notes, 2_000)
    })),
    isir: {
      verification: isir.verification && typeof isir.verification === 'object'
        ? {
            matched: Boolean(isir.verification.matched),
            caseNumber: text(isir.verification.caseNumber, 120),
            caseStatus: text(isir.verification.caseStatus, 300),
            insolvencyDate: text(isir.verification.insolvencyDate, 30),
            verifiedAt: text(isir.verification.verifiedAt, 50)
          }
        : null,
      cases: compactArray(isir.cases, 12).map((item) => ({
        caseId: text(item.caseId, 160),
        caseNumber: text(item.caseNumber, 120),
        caseStatus: text(item.caseStatus, 300),
        proceedingStartedAt: text(item.proceedingStartedAt, 30),
        proceedingEndedAt: text(item.proceedingEndedAt, 30),
        claimsDeadline: text(item.claimsDeadline, 30),
        claimsCount: numberOrNull(item.claimsCount),
        claimsTotalAmount: numberOrNull(item.claimsTotalAmount),
        lastEventAt: text(item.lastEventAt, 30),
        lastEventTitle: text(item.lastEventTitle, 1_000),
        caseStudy: text(item.caseStudy, 20_000)
      })),
      analyses: compactArray(isir.analyses, 8).map((item) => ({
        kind: text(item.kind, 120),
        createdAt: text(item.createdAt, 50),
        result: item.result && typeof item.result === 'object' ? boundedJson(item.result) : {}
      })),
      documents: compactArray(isir.documents, 80).map((item) => ({
        title: text(item.title, 700),
        type: text(item.type, 200),
        date: text(item.date, 30),
        isMain: Boolean(item.isMain)
      }))
    }
  };

  const serialized = JSON.stringify(normalized);
  if (serialized.length > MAX_CONTEXT_TEXT) {
    normalized.monitoring.performances = normalized.monitoring.performances.slice(0, 35);
    normalized.isir.analyses = normalized.isir.analyses.slice(0, 3);
    normalized.isir.documents = normalized.isir.documents.slice(0, 35);
  }
  return normalized;
}

function buildDebtMappingPrompt(context) {
  return [
    'Jsi profesionální, empatický a věcný sociální a dluhový poradce.',
    'Tvým úkolem je připravit dokument „Mapování závazků a příčin předlužení“ na základě předaných strukturovaných dat.',
    'Primární podklady jsou monitorovací data klienta a systémová data ISIR. Doplňkovými podklady jsou splátkové kalendáře a chronologické zápisy práce s klientem.',
    '',
    'Závazná pravidla:',
    '- Použij výhradně skutečnosti obsažené ve vstupních datech. Nic nedovozuj jako jistotu a nevymýšlej věřitele, částky, příčiny ani osobní okolnosti.',
    '- Jednotlivé závazky uveď jen tehdy, když jsou přímo doložené splátkovým kalendářem nebo jednoznačným zápisem. Souhrnnou částku z ISIR neprezentuj jako nový jednotlivý závazek.',
    '- U neúplných nebo rozporných údajů uveď nejistotu v poli missingInformation.',
    '- Rozliš doložené příčiny od odborných hypotéz. Hypotézu formuluj výslovně jako oblast k ověření.',
    '- Doporučené kroky mají být konkrétní, odborné a přiměřené dostupným podkladům.',
    '- Neuváděj doporučení typu vyhledat dluhového poradce, obrátit se na dluhovou poradnu nebo zahájit další mapování, protože dokument vzniká v rámci dluhového poradenství.',
    '- Piš formálně, srozumitelně a česky.',
    '- Vrať pouze validní JSON bez markdownu.',
    '',
    'Požadované JSON schéma:',
    JSON.stringify({
      title: 'Mapování závazků a příčin předlužení',
      overallSummary: 'souvislý text',
      clientSituation: 'souvislý text',
      obligations: [
        {
          creditor: 'název nebo doložený typ věřitele',
          amount: 0,
          status: 'stav závazku',
          source: 'splátkový kalendář | monitorovací zápis',
          evidence: 'stručná konkrétní opora ve vstupu'
        }
      ],
      isirSummary: 'souhrn insolvenčních údajů, případně že řízení nebylo doloženo',
      causes: ['doložená příčina nebo výslovně označená oblast k ověření'],
      risks: ['zjištěné riziko'],
      recommendedSteps: ['konkrétní navazující krok'],
      missingInformation: ['chybějící nebo rozporný údaj'],
      sourcesUsed: ['Monitorovací data', 'ISIR', 'Splátkové kalendáře']
    }, null, 2),
    '',
    'Vstupní data:',
    JSON.stringify(context)
  ].join('\n');
}

function parseGeminiJson(payload) {
  const raw = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  if (!raw) throw new Error('Gemini nevrátil obsah mapování.');
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1].trim() : raw);
}

function cleanTextArray(value, maxItems = 40) {
  return compactArray(value, maxItems).map((item) => text(item, 3_000)).filter(Boolean);
}

function validateDebtMappingDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AI nevrátila platnou strukturu dokumentu.');
  }
  const overallSummary = text(value.overallSummary, 20_000);
  const clientSituation = text(value.clientSituation, 20_000);
  if (!overallSummary || !clientSituation) {
    throw new Error('AI nevrátila povinné textové části mapování.');
  }

  const obligations = compactArray(value.obligations, 60).map((item) => ({
    creditor: text(item?.creditor, 500),
    amount: numberOrNull(item?.amount),
    status: text(item?.status, 500),
    source: text(item?.source, 120),
    evidence: text(item?.evidence, 2_000)
  })).filter((item) =>
    item.creditor &&
    item.evidence &&
    ['splátkový kalendář', 'monitorovací zápis'].includes(item.source.toLocaleLowerCase('cs'))
  );

  return {
    title: 'Mapování závazků a příčin předlužení',
    overallSummary,
    clientSituation,
    obligations,
    isirSummary: text(value.isirSummary, 20_000),
    causes: cleanTextArray(value.causes),
    risks: cleanTextArray(value.risks),
    recommendedSteps: cleanTextArray(value.recommendedSteps),
    missingInformation: cleanTextArray(value.missingInformation),
    sourcesUsed: cleanTextArray(value.sourcesUsed, 10)
  };
}

async function generateDebtMapping(context, overrides = {}) {
  const apiKey = overrides.apiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY není na serveru nastaven.');
  const fetchImpl = overrides.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);

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
          contents: [{
            role: 'user',
            parts: [{ text: buildDebtMappingPrompt(context) }]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            maxOutputTokens: 8192
          }
        }),
        signal: controller.signal
      }
    );
    const raw = await upstream.text();
    if (!upstream.ok) {
      const error = new Error(`Gemini API odpovědělo HTTP ${upstream.status}.`);
      error.statusCode = upstream.status === 429 ? 429 : 502;
      throw error;
    }
    return validateDebtMappingDocument(parseGeminiJson(JSON.parse(raw)));
  } finally {
    clearTimeout(timeout);
  }
}

async function handleDebtMappingRequest(request, response, overrides = {}) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Povolena je pouze metoda POST.' });
    return;
  }
  try {
    const input = await readJsonBody(request);
    const context = normalizeDebtMappingContext(input.context);
    if (!context.client.id || !context.client.fullName) {
      sendJson(response, 422, { error: 'Chybí jednoznačná identifikace klienta.' });
      return;
    }
    const document = await generateDebtMapping(context, overrides);
    sendJson(response, 200, {
      ok: true,
      model: GEMINI_MODEL,
      generatedAt: new Date().toISOString(),
      document
    });
  } catch (error) {
    const statusCode = error.statusCode
      || (error?.name === 'AbortError' ? 504 : 502);
    sendJson(response, statusCode, {
      error: error?.name === 'AbortError'
        ? 'Gemini neodpověděl v časovém limitu.'
        : error.message || 'Vytvoření mapování selhalo.'
    });
  }
}

export {
  GEMINI_MODEL,
  buildDebtMappingPrompt,
  generateDebtMapping,
  handleDebtMappingRequest,
  normalizeDebtMappingContext,
  validateDebtMappingDocument
};
