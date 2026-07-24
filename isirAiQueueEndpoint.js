import { enqueueIsirAiJob, getIsirAiJob } from './isirAiQueue.js';

const MAX_REQUEST_BYTES = 512 * 1024;

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
    if (size > MAX_REQUEST_BYTES) throw new Error('Požadavek je příliš velký.');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

async function handleIsirAiQueueRequest(request, response, url, options = {}) {
  try {
    if (request.method === 'POST') {
      const input = await readJsonBody(request);
      const job = enqueueIsirAiJob(input, options);
      sendJson(response, 202, { ok: true, job });
      return;
    }
    if (request.method === 'GET') {
      const job = getIsirAiJob(url.searchParams.get('id'));
      if (!job) {
        sendJson(response, 404, { ok: false, error: 'AI úloha nebyla nalezena.' });
        return;
      }
      sendJson(response, 200, { ok: true, job });
      return;
    }
    sendJson(response, 405, { ok: false, error: 'Povoleny jsou pouze metody GET a POST.' });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: String(error?.message || error || 'AI fronta selhala.') });
  }
}

export { handleIsirAiQueueRequest };
