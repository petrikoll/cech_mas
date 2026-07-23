import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleDocxExportRequest } from './docxExport.js';
import { handleGoogleAppsScriptProxy } from './googleAppsScriptProxy.js';

const docxExportPlugin = () => ({
  name: 'docx-export-api',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = String(request.url || '').split('?')[0];
      const isExport = pathname === '/api/export-record-docx' || pathname === '/api/export-plan-docx';
      if (request.method !== 'POST' || !isExport) {
        next();
        return;
      }
      void handleDocxExportRequest(request, response);
    });
  }
});

const googleSheetsProxyPlugin = (proxyConfig) => ({
  name: 'google-sheets-proxy-api',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const pathname = String(request.url || '').split('?')[0];
      if (pathname !== '/api/google-sheets') {
        next();
        return;
      }
      void handleGoogleAppsScriptProxy(request, response, proxyConfig);
    });
  }
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      react(),
      docxExportPlugin(),
      googleSheetsProxyPlugin({
        appsScriptUrl: env.GOOGLE_APPS_SCRIPT_URL || env.VITE_CLIENTS_API_URL,
        appsScriptToken: env.GOOGLE_APPS_SCRIPT_TOKEN || env.VITE_CLIENTS_API_TOKEN
      })
    ],
    server: {
      host: '127.0.0.1',
      port: 5174,
      watch: {
        ignored: ['**/.tmp-chrome-screens*/**', '**/navod-screenshoty*/**']
      }
    }
  };
});
