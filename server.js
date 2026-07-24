import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleDocxExportRequest } from './docxExport.js';
import { handleXlsxExportRequest } from './xlsxExport.js';
import { handleGoogleAppsScriptProxy } from './googleAppsScriptProxy.js';
import { handleGeminiProxyRequest } from './geminiProxy.js';
import { handleIsirRequest } from './isirService.js';
import { handleIsirAnalysisRequest } from './isirAnalysis.js';
import { handleIsirAiQueueRequest } from './isirAiQueueEndpoint.js';
import { handleIsirDocumentRequest } from './isirDocumentProxy.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);


const authUser = process.env.BASIC_AUTH_USER || 'admin';
const authPassword = process.env.BASIC_AUTH_PASSWORD || '';

if (!authPassword) {
  console.error('BASIC_AUTH_PASSWORD is required. Server startup was stopped to protect client data.');
  process.exit(1);
}

function safeCompare(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

function isAuthorized(request) {
  const header = request.headers.authorization || '';
  const [scheme, encodedCredentials] = header.split(' ');

  if (scheme !== 'Basic' || !encodedCredentials) {
    return false;
  }

  const decoded = Buffer.from(encodedCredentials, 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');

  if (separatorIndex === -1) {
    return false;
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return safeCompare(username, authUser) && safeCompare(password, authPassword);
}

function requireAuth(response) {
  response.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Vykaznictvi CECH MAS", charset="UTF-8"',
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end('Přístup vyžaduje přihlášení.');
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function sendFile(response, filePath) {
  const extension = extname(filePath).toLowerCase();
  response.writeHead(200, {
    'Content-Type': mimeTypes[extension] || 'application/octet-stream'
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer((request, response) => {
  if (!isAuthorized(request)) {
    requireAuth(response);
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const requestedPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const staticPath = join(distDir, requestedPath);

  const isDocxExport = url.pathname === '/api/export-record-docx' || url.pathname === '/api/export-plan-docx';
  if (request.method === 'POST' && isDocxExport) {
    void handleDocxExportRequest(request, response);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/export-table-xlsx') {
    void handleXlsxExportRequest(request, response);
    return;
  }

  if (url.pathname === '/api/google-sheets') {
    void handleGoogleAppsScriptProxy(request, response);
    return;
  }

  if (url.pathname === '/api/gemini') {
    void handleGeminiProxyRequest(request, response);
    return;
  }

  if (url.pathname === '/api/isir') {
    void handleIsirRequest(request, response);
    return;
  }

  if (url.pathname === '/api/isir-analysis') {
    void handleIsirAnalysisRequest(request, response);
    return;
  }

  if (url.pathname === '/api/isir-ai-jobs') {
    void handleIsirAiQueueRequest(request, response, url);
    return;
  }

  if (url.pathname === '/api/isir-document') {
    void handleIsirDocumentRequest(request, response, url);
    return;
  }

  if (staticPath.startsWith(distDir) && existsSync(staticPath) && statSync(staticPath).isFile()) {
    sendFile(response, staticPath);
    return;
  }

  const indexPath = join(distDir, 'index.html');
  if (existsSync(indexPath)) {
    sendFile(response, indexPath);
    return;
  }

  response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Production build is missing. Run npm run build first.');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
