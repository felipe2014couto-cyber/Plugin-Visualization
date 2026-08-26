#!/usr/bin/env node
/**
 * pi-vision-proxy.js
 *
 * Proxy HTTP local que permite ao Aperam Visualization buscar displays
 * do PI Vision sem ser bloqueado pelo CORS do navegador.
 *
 * Como funciona:
 *   O navegador nao pode chamar http://pimsweb diretamente de outra origem.
 *   Este proxy roda no mesmo servidor do Grafana e faz a chamada server-side,
 *   sem restricoes de CORS, depois devolve a resposta com os headers corretos.
 *
 * Uso:
 *   node pi-vision-proxy.js
 *   # ou para rodar em background:
 *   nohup node pi-vision-proxy.js &
 *
 * Porta padrao: 3001
 * Endpoint: GET http://localhost:3001/pivision?url=<URL_DA_API>
 *
 * Exemplo:
 *   http://localhost:3001/pivision?url=http://pimsweb/PIVision/api/displays/48494
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PIVISION_PROXY_PORT || 3001;

// Origens permitidas (Grafana local)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.247.140.156:3000',
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function proxyRequest(targetUrl, res) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'URL invalida: ' + targetUrl }));
    return;
  }

  const lib = parsed.protocol === 'https:' ? https : http;

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    // Permite certificados self-signed (comum em redes corporativas)
    rejectUnauthorized: false,
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, {
      'Content-Type': proxyRes.headers['content-type'] || 'application/json',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy] Erro ao conectar com PI Vision:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Nao foi possivel conectar ao servidor PI Vision: ' + err.message,
      }));
    }
  });

  proxyReq.setTimeout(15000, () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Timeout ao conectar com PI Vision.' }));
    }
  });

  proxyReq.end();
}

const server = http.createServer((req, res) => {
  setCorsHeaders(req, res);

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Metodo nao permitido.' }));
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', proxy: 'pi-vision-proxy' }));
    return;
  }

  // Endpoint principal: GET /pivision?url=<URL>
  if (req.url && req.url.startsWith('/pivision')) {
    const urlObj = new URL('http://localhost' + req.url);
    const targetUrl = urlObj.searchParams.get('url');

    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Parametro "url" ausente.' }));
      return;
    }

    console.log('[proxy] Buscando:', targetUrl);
    proxyRequest(targetUrl, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint nao encontrado.' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PI Vision Proxy rodando em http://0.0.0.0:${PORT}`);
  console.log('Endpoint: GET /pivision?url=<URL_DA_API_DO_PI_VISION>');
  console.log('Health:   GET /health');
  console.log('\nPressione Ctrl+C para parar.');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Porta ${PORT} ja em uso. Use: PIVISION_PROXY_PORT=3002 node pi-vision-proxy.js`);
  } else {
    console.error('Erro no servidor proxy:', err.message);
  }
  process.exit(1);
});
