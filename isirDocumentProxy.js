import { Readable } from 'node:stream';

const ISIR_DOCUMENT_HOST = 'isir.justice.cz';
const ISIR_DOCUMENT_PATH = '/isir/doc/dokument.pdf';
const UPSTREAM_TIMEOUT_MS = 45_000;

export function parseIsirDocumentUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname.toLowerCase() !== ISIR_DOCUMENT_HOST) return null;
  if (parsed.pathname.toLowerCase() !== ISIR_DOCUMENT_PATH) return null;
  if (!/^\d+$/.test(parsed.searchParams.get('id') || '')) return null;

  parsed.hash = '';
  return parsed;
}

function sendError(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(message);
}

export async function handleIsirDocumentRequest(request, response, requestUrl) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendError(response, 405, 'Tato metoda není podporována.');
    return;
  }

  const sourceUrl = parseIsirDocumentUrl(requestUrl.searchParams.get('url'));
  if (!sourceUrl) {
    sendError(response, 400, 'Neplatná adresa dokumentu ISIR.');
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamHeaders = {
      Accept: 'application/pdf',
      'User-Agent': 'Mozilla/5.0 (compatible; CECH-MAS-ISIR/1.0)'
    };
    if (request.headers.range) upstreamHeaders.Range = request.headers.range;

    const upstream = await fetch(sourceUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow',
      signal: controller.signal
    });

    if (!upstream.ok && upstream.status !== 206) {
      sendError(response, upstream.status, `Dokument ISIR se nepodařilo načíst (${upstream.status}).`);
      return;
    }

    const headers = {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="isir-document.pdf"',
      'Cache-Control': 'private, max-age=3600',
      'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
      'X-Content-Type-Options': 'nosniff'
    };

    for (const name of ['content-length', 'content-range', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name);
      if (value) headers[name] = value;
    }

    response.writeHead(upstream.status, headers);
    if (request.method === 'HEAD' || !upstream.body) {
      response.end();
      return;
    }

    Readable.fromWeb(upstream.body).pipe(response);
  } catch (error) {
    if (!response.headersSent) {
      sendError(response, error?.name === 'AbortError' ? 504 : 502, 'Dokument ISIR se nepodařilo načíst.');
    } else {
      response.destroy(error);
    }
  } finally {
    clearTimeout(timeout);
  }
}
