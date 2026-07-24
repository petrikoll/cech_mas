import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const whitelistPath = fileURLToPath(new URL('./elai-helper/data/whitelist-merged.json', import.meta.url));
const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const geminiApiBase = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';

let whitelistCache;

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
};

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  let total = 0;
  let settled = false;

  request.on('data', (chunk) => {
    if (settled) return;
    total += chunk.length;
    if (total > 12 * 1024 * 1024) {
      settled = true;
      reject(new Error('Request body too large'));
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (!settled) resolve(Buffer.concat(chunks));
  });
  request.on('error', (error) => {
    if (!settled) reject(error);
  });
});

const parseJsonSafely = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const normalizeText = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

const loadWhitelist = () => {
  if (whitelistCache) return whitelistCache;

  const config = JSON.parse(readFileSync(whitelistPath, 'utf8'));
  const sourceMap = new Map();
  for (const source of config.sources || []) {
    if (source?.id) sourceMap.set(source.id, source);
  }

  whitelistCache = {
    config,
    sourceMap,
    alwaysOn: new Set(config?.source_sets?.always_on_source_ids || [])
  };
  return whitelistCache;
};

const validateLegalPayload = (payload, whitelist) => {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Payload musi byt JSON objekt.' };
  }

  const question = String(payload.question || '').trim();
  if (!question) return { ok: false, error: 'Pole question je povinne.' };

  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  if (!sources.length) return { ok: false, error: 'Musis vybrat alespon jeden zdroj.' };

  for (const sourceId of sources) {
    if (!whitelist.sourceMap.has(sourceId)) {
      return { ok: false, error: `Zdroj ${sourceId} neni na whitelistu.` };
    }
  }

  for (const requiredId of whitelist.alwaysOn) {
    if (!sources.includes(requiredId)) {
      return { ok: false, error: `Chybi povinny zdroj ${requiredId} z always_on_source_ids.` };
    }
  }

  if (!payload.promptBlueprint || typeof payload.promptBlueprint !== 'object') {
    return { ok: false, error: 'Chybi promptBlueprint.' };
  }
  if (!Array.isArray(payload.promptBlueprint.modelInstruction)) {
    return { ok: false, error: 'promptBlueprint.modelInstruction musi byt pole.' };
  }

  return { ok: true };
};

const buildSystemInstruction = (selectedSources) => {
  const sourceLines = selectedSources
    .map((source) => {
      const lawCode = source.sbirka ? ` (${source.sbirka})` : '';
      const sourceUrl = source.source_url ? ` | ${source.source_url}` : '';
      return `- ${source.id}: ${source.nazev}${lawCode}${sourceUrl}`;
    })
    .join('\n');

  return [
    'Jsi pravni AI asistent pro dluhove poradenstvi v CR.',
    'Pouzij pouze whitelist zdroje uvedene nize.',
    'Pokud opora ve zdrojich chybi, uved: ve zdrojich nenalezeno.',
    'Nevymyslej paragrafy ani pravni zaver bez opory.',
    'Vrat pouze validni JSON bez markdownu.',
    'Schema:',
    '{',
    '  "odpoved": "string",',
    '  "pravniOpora": [{"zakon":"string","paragraf":"string","citace":"string"}],',
    '  "miraJistoty": 0.0,',
    '  "chybejiciVstupy": ["string"]',
    '}',
    'Whitelist zdroje:',
    sourceLines
  ].join('\n');
};

const buildUserPrompt = (payload) => [
  `Dotaz: ${payload.question}`,
  `Kontext: ${payload.context || 'neuveden'}`,
  `Typ vystupu: ${payload.outputType || 'structured_answer'}`,
  `Hloubka: ${payload.depth || 'balanced'}`
].join('\n');

const validateGeminiLegalResult = (result, selectedSources) => {
  if (!result || typeof result !== 'object') {
    return { ok: false, error: 'Gemini nevratil JSON objekt.' };
  }
  if (typeof result.odpoved !== 'string' || !result.odpoved.trim()) {
    return { ok: false, error: 'V odpovedi chybi pole odpoved.' };
  }
  if (!Array.isArray(result.pravniOpora) || !result.pravniOpora.length) {
    return { ok: false, error: 'V odpovedi chybi pole pravniOpora.' };
  }
  if (typeof result.miraJistoty !== 'number' || Number.isNaN(result.miraJistoty)) {
    return { ok: false, error: 'V odpovedi chybi validni miraJistoty.' };
  }
  if (!Array.isArray(result.chybejiciVstupy)) {
    return { ok: false, error: 'Pole chybejiciVstupy musi byt pole.' };
  }

  const allowedNames = selectedSources.map((source) => normalizeText(source.nazev));
  const allowedIds = selectedSources.map((source) => normalizeText(source.id));
  let hasWhitelistedCitation = false;

  for (const item of result.pravniOpora) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Polozka pravniOpora musi byt objekt.' };
    }
    if (!String(item.zakon || '').trim()) return { ok: false, error: 'V citaci chybi zakon.' };
    if (!String(item.paragraf || '').trim()) return { ok: false, error: 'V citaci chybi paragraf.' };
    if (!String(item.citace || '').trim()) return { ok: false, error: 'V citaci chybi text citace.' };

    const normalizedLaw = normalizeText(item.zakon);
    if (
      allowedNames.some((name) => normalizedLaw.includes(name))
      || allowedIds.some((id) => normalizedLaw.includes(id))
    ) {
      hasWhitelistedCitation = true;
    }
  }

  return hasWhitelistedCitation
    ? { ok: true }
    : { ok: false, error: 'Citace neodpovidaji vybranym whitelist zdrojum.' };
};

const callGeminiForLegalQuery = async (payload, selectedSources) => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY neni nastaven.');

  const apiUrl = `${geminiApiBase}/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        role: 'system',
        parts: [{ text: buildSystemInstruction(selectedSources) }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: buildUserPrompt(payload) }]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    })
  });

  const rawText = await response.text();
  if (!response.ok) throw new Error(`Gemini API HTTP ${response.status}: ${rawText}`);

  const envelope = parseJsonSafely(rawText);
  const modelText = envelope?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const modelJson = parseJsonSafely(modelText);
  if (!modelJson) throw new Error('Gemini nevratil validni JSON.');
  return modelJson;
};

const handleElaiLegalRequest = async (request, response) => {
  try {
    const whitelist = loadWhitelist();
    const raw = await readBody(request);
    const payload = parseJsonSafely(raw.toString('utf8'));
    if (!payload) {
      sendJson(response, 400, { error: 'Neplatny JSON body.' });
      return;
    }

    const validation = validateLegalPayload(payload, whitelist);
    if (!validation.ok) {
      sendJson(response, 422, { error: validation.error });
      return;
    }

    const selectedSources = payload.sources
      .map((id) => whitelist.sourceMap.get(id))
      .filter(Boolean);
    const result = await callGeminiForLegalQuery(payload, selectedSources);
    const resultValidation = validateGeminiLegalResult(result, selectedSources);
    if (!resultValidation.ok) {
      sendJson(response, 502, { error: resultValidation.error });
      return;
    }
    sendJson(response, 200, result);
  } catch (error) {
    console.error('E.L.A.I. legal query failed:', error);
    const statusCode = String(error?.message || '').includes('GEMINI_API_KEY neni nastaven')
      ? 503
      : 502;
    sendJson(response, statusCode, { error: `Legal query selhalo: ${error.message}` });
  }
};

export {
  handleElaiLegalRequest,
  loadWhitelist,
  validateGeminiLegalResult,
  validateLegalPayload
};
