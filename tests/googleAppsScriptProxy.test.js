import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { handleGoogleAppsScriptProxy } from '../googleAppsScriptProxy.js';

function createRequest(method, url, body = '') {
  const request = Readable.from(body ? [body] : []);
  request.method = method;
  request.url = url;
  return request;
}

function createResponse() {
  let resolveEnd;
  const ended = new Promise((resolve) => {
    resolveEnd = resolve;
  });
  return {
    statusCode: 0,
    headers: {},
    body: '',
    ended,
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = String(body || '');
      resolveEnd();
    }
  };
}

test('proxy odmítne požadavek bez serverového tajného klíče', async () => {
  const request = createRequest('GET', '/api/google-sheets?action=listClients');
  const response = createResponse();

  await handleGoogleAppsScriptProxy(request, response, { appsScriptUrl: 'https://example.test/macros/s/test/exec' });

  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).ok, false);
});

test('GET proxy odstraní token klienta a použije serverový token', async () => {
  let requestedUrl = '';
  const request = createRequest('GET', '/api/google-sheets?action=listClients&token=attacker');
  const response = createResponse();

  await handleGoogleAppsScriptProxy(request, response, {
    appsScriptUrl: 'https://example.test/macros/s/test/exec',
    appsScriptToken: 'server-secret',
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  const upstreamUrl = new URL(requestedUrl);
  assert.equal(upstreamUrl.searchParams.get('action'), 'listClients');
  assert.equal(upstreamUrl.searchParams.get('token'), 'server-secret');
  assert.equal(response.statusCode, 200);
});

test('POST proxy přepíše token v těle serverovým tokenem', async () => {
  let forwardedBody = null;
  const request = createRequest('POST', '/api/google-sheets', JSON.stringify({ action: 'saveClient', token: 'attacker' }));
  const response = createResponse();

  await handleGoogleAppsScriptProxy(request, response, {
    appsScriptUrl: 'https://example.test/macros/s/test/exec',
    appsScriptToken: 'server-secret',
    fetchImpl: async (_url, options) => {
      forwardedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  assert.equal(forwardedBody.action, 'saveClient');
  assert.equal(forwardedBody.token, 'server-secret');
  assert.equal(response.statusCode, 200);
});
