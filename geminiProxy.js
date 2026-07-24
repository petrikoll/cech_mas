const ALLOWED_GEMINI_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite'
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request, maxBytes = 1_500_000) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      const error = new Error('AI požadavek je příliš velký.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
}

async function handleGeminiProxyRequest(request, response, overrides = {}) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: { message: 'Povolena je pouze metoda POST.' } });
    return;
  }

  const apiKey = overrides.apiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    sendJson(response, 503, {
      error: { message: 'Gemini API klíč není na serveru nastavený.' }
    });
    return;
  }

  let input;
  try {
    input = await readJsonBody(request);
  } catch (error) {
    sendJson(response, error.statusCode || 400, {
      error: { message: error.statusCode ? error.message : 'AI požadavek nemá platný JSON.' }
    });
    return;
  }

  const model = String(input.model || '').trim();
  if (!ALLOWED_GEMINI_MODELS.has(model)) {
    sendJson(response, 400, { error: { message: 'Požadovaný Gemini model není povolený.' } });
    return;
  }

  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    sendJson(response, 400, { error: { message: 'Chybí tělo Gemini požadavku.' } });
    return;
  }

  const fetchImpl = overrides.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const upstream = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(input.payload),
        signal: controller.signal
      }
    );
    const body = await upstream.text();
    response.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(body);
  } catch (error) {
    sendJson(response, error?.name === 'AbortError' ? 504 : 502, {
      error: {
        message: error?.name === 'AbortError'
          ? 'Gemini neodpověděl v časovém limitu.'
          : 'Spojení se službou Gemini selhalo.'
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

export {
  ALLOWED_GEMINI_MODELS,
  handleGeminiProxyRequest
};
