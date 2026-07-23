const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
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

function getProxyConfig(overrides = {}) {
  return {
    appsScriptUrl: overrides.appsScriptUrl || process.env.GOOGLE_APPS_SCRIPT_URL || process.env.VITE_CLIENTS_API_URL || '',
    appsScriptToken: overrides.appsScriptToken || process.env.GOOGLE_APPS_SCRIPT_TOKEN || process.env.VITE_CLIENTS_API_TOKEN || ''
  };
}

async function handleGoogleAppsScriptProxy(request, response, overrides = {}) {
  const { appsScriptUrl, appsScriptToken } = getProxyConfig(overrides);
  const fetchImpl = overrides.fetchImpl || fetch;
  if (!appsScriptUrl || !appsScriptToken) {
    sendJson(response, 503, { ok: false, error: 'Propojení s Google Sheets není bezpečně nakonfigurované.' });
    return;
  }

  if (!['GET', 'POST'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, POST' });
    response.end();
    return;
  }

  try {
    const incomingUrl = new URL(request.url || '/', 'http://localhost');
    const upstreamUrl = new URL(appsScriptUrl);
    incomingUrl.searchParams.forEach((value, key) => {
      if (key !== 'token') upstreamUrl.searchParams.set(key, value);
    });

    const fetchOptions = { method: request.method, redirect: 'follow' };
    if (request.method === 'GET') {
      upstreamUrl.searchParams.set('token', appsScriptToken);
    } else {
      const rawBody = await readRequestBody(request);
      const payload = rawBody ? JSON.parse(rawBody) : {};
      fetchOptions.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      fetchOptions.body = JSON.stringify({ ...payload, token: appsScriptToken });
    }

    const upstreamResponse = await fetchImpl(upstreamUrl, fetchOptions);
    const responseBody = await upstreamResponse.text();
    response.writeHead(upstreamResponse.status, {
      'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(responseBody);
  } catch (error) {
    console.error('Google Apps Script proxy error:', error);
    sendJson(response, 502, { ok: false, error: 'Spojení s Google Sheets selhalo.' });
  }
}

export { handleGoogleAppsScriptProxy };
