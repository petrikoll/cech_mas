import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { handleGeminiProxyRequest } from '../geminiProxy.js';

function createRequest(method, body = '') {
  const request = Readable.from(body ? [body] : []);
  request.method = method;
  return request;
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = String(body || '');
    }
  };
}

test('Gemini proxy vyžaduje serverový API klíč', async () => {
  const request = createRequest('POST', JSON.stringify({
    model: 'gemini-2.5-flash',
    payload: { contents: [] }
  }));
  const response = createResponse();

  await handleGeminiProxyRequest(request, response, { apiKey: '' });

  assert.equal(response.statusCode, 503);
  assert.match(JSON.parse(response.body).error.message, /na serveru/);
});

test('Gemini proxy nepovolí neznámý model', async () => {
  const request = createRequest('POST', JSON.stringify({
    model: 'gemini-nepovoleny',
    payload: { contents: [] }
  }));
  const response = createResponse();

  await handleGeminiProxyRequest(request, response, { apiKey: 'server-secret' });

  assert.equal(response.statusCode, 400);
});

test('Gemini proxy drží klíč na serveru a předá pouze povolený požadavek', async () => {
  let forwardedUrl = '';
  let forwardedOptions = null;
  const request = createRequest('POST', JSON.stringify({
    model: 'gemini-2.5-flash',
    payload: { contents: [{ role: 'user', parts: [{ text: 'Test' }] }] }
  }));
  const response = createResponse();

  await handleGeminiProxyRequest(request, response, {
    apiKey: 'server-secret',
    fetchImpl: async (url, options) => {
      forwardedUrl = String(url);
      forwardedOptions = options;
      return new Response(JSON.stringify({ candidates: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  assert.equal(response.statusCode, 200);
  assert.match(forwardedUrl, /gemini-2\.5-flash:generateContent$/);
  assert.doesNotMatch(forwardedUrl, /server-secret/);
  assert.equal(forwardedOptions.headers['x-goog-api-key'], 'server-secret');
  assert.deepEqual(JSON.parse(forwardedOptions.body), {
    contents: [{ role: 'user', parts: [{ text: 'Test' }] }]
  });
});
