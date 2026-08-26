#!/usr/bin/env node
/**
 * pi-vision-proxy.js
 *
 * Proxy HTTP local que permite ao Aperam Visualization buscar displays
 * do PI Vision sem ser bloqueado pelo CORS.
 *
 * Suporta Autenticacao Windows (NTLM) usando 'curl' localmente.
 */

'use strict';

const http = require('http');
const { URL } = require('url');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ENV_PATH = path.join(__dirname, '.env');
const DEFAULT_PI_VISION_BASE_URL = 'http://pimsweb/PIVision';

// Origens permitidas (Grafana local)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://10.247.140.156:3000',
];

// Le arquivo .env simples
function loadEnv() {
  const env = {};
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        env[match[1]] = match[2];
      }
    }
  }
  return env;
}

const startupEnv = loadEnv();
const PORT = process.env.PIVISION_PROXY_PORT || startupEnv.PIVISION_PROXY_PORT || 3001;
// O Grafana e acessado por outros computadores da rede. Escutar somente em
// loopback faria o navegador chamar <host-do-grafana>:3001 sem conseguir
// conectar. As origens HTTP continuam restritas por ALLOWED_ORIGINS.
const HOST = process.env.PIVISION_PROXY_HOST || startupEnv.PIVISION_PROXY_HOST || '0.0.0.0';

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return false;
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
}

function buildCredentials(env) {
  const username = (env.PI_VISION_USER || '').trim();
  const password = env.PI_VISION_PASSWORD || '';
  const domain = (env.PI_VISION_DOMAIN || '').trim();
  const qualifiedUsername = domain && username && !username.includes('\\') && !username.includes('@')
    ? `${domain}\\${username}`
    : username;
  return { username: qualifiedUsername, password };
}

function requestEndpoint(targetUrl, env, cookiePath) {
  return new Promise((resolve) => {
    const { username, password } = buildCredentials(env);
    const marker = '__PIMS_HTTP_RESULT__';
    const curlArgs = [
      '-sS',
      '--noproxy', '*',
      '--connect-timeout', '5',
      '--max-time', '20',
      '--ntlm',
      '--user', `${username}:${password}`,
      ...(cookiePath ? ['--cookie-jar', cookiePath, '--cookie', cookiePath] : []),
      '--header', 'Accept: application/json',
      '--write-out', `\n${marker}%{http_code}|%{content_type}`,
      targetUrl,
    ];

    execFile('curl', curlArgs, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
      const markerIndex = stdout.lastIndexOf(`\n${marker}`);
      if (markerIndex === -1) {
        resolve({ status: 502, contentType: 'application/json', body: '', transportError: error?.message || 'Resposta invalida do curl.' });
        return;
      }

      const result = stdout.slice(markerIndex + marker.length + 1).trim();
      const separatorIndex = result.indexOf('|');
      const status = Number(result.slice(0, separatorIndex)) || 502;
      const contentType = result.slice(separatorIndex + 1) || 'application/octet-stream';
      resolve({ status, contentType, body: stdout.slice(0, markerIndex), transportError: error?.message });
    });
  });
}

async function proxyDisplay(displayId, res) {
  const env = loadEnv();
  const { username, password } = buildCredentials(env);
  if (!username || !password) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Credenciais do PI Vision nao configuradas no proxy.' }));
    return;
  }

  let baseUrl;
  try {
    baseUrl = new URL(env.PI_VISION_BASE_URL || DEFAULT_PI_VISION_BASE_URL);
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'PI_VISION_BASE_URL invalida.' }));
    return;
  }
  baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, '');
  const sessionDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pims-vision-proxy-'));
  const cookiePath = path.join(sessionDirectory, 'cookies.txt');

  const paths = [
    `/api/displays/${displayId}`,
    `/Utility/Services/DisplayService.svc/displays/${displayId}`,
    `/api/v1/displays/${displayId}`,
    `/Displays/${displayId}/OpenEditDisplay`,
  ];
  const attempts = [];

  try {
    for (const endpointPath of paths) {
      const targetUrl = new URL(baseUrl.toString());
      targetUrl.pathname += endpointPath;
      console.log('[proxy] Buscando:', targetUrl.pathname);
      const result = await requestEndpoint(targetUrl.toString(), env, cookiePath);
      attempts.push({ endpoint: endpointPath, status: result.status });

      if (result.status >= 200 && result.status < 300) {
        try {
          const display = JSON.parse(result.body);
          await hydrateDisplayAttachments(display, baseUrl, env, cookiePath);
          await hydrateGraphicLibrary(display, baseUrl, env, cookiePath);
          res.writeHead(result.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(display));
          return;
        } catch {
          attempts[attempts.length - 1].status = 'resposta nao JSON';
        }
      }
    }
  } finally {
    fs.rmSync(sessionDirectory, { recursive: true, force: true });
  }

  const statuses = attempts.map((attempt) => attempt.status);
  const status = statuses.includes(401) ? 401 : statuses.includes(403) ? 403 : statuses.includes(404) ? 404 : 502;
  const details = status === 401
    ? 'Autenticacao Windows recusada. Configure PI_VISION_DOMAIN ou use PI_VISION_USER no formato DOMINIO\\usuario.'
    : status === 403
      ? `A conta configurada nao tem permissao para ler o Display #${displayId}.`
      : `Nenhuma rota compativel retornou JSON para o Display #${displayId}.`;
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Falha ao buscar Display no PI Vision.', details, attempts }));
}

async function hydrateDisplayAttachments(display, baseUrl, env, cookiePath) {
  const requestId = typeof display.RequestId === 'string' ? display.RequestId : '';
  const imageSymbols = Array.isArray(display.Symbols)
    ? display.Symbols.filter((symbol) => symbol?.SymbolType?.toLowerCase() === 'image')
    : [];
  if (!requestId || !/^[a-f0-9-]+$/i.test(requestId)) {
    return;
  }

  await Promise.all(imageSymbols.map(async (symbol) => {
    const attachmentId = symbol?.Configuration?.AttachmentId;
    if (!Number.isInteger(attachmentId) || attachmentId < 0) {
      return;
    }
    const targetUrl = new URL(baseUrl.toString());
    targetUrl.pathname += `/Data/${requestId}/Attachment/${attachmentId}`;
    const result = await requestEndpoint(targetUrl.toString(), env, cookiePath);
    if (result.status < 200 || result.status >= 300) {
      return;
    }
    try {
      const dataUrl = JSON.parse(result.body);
      if (typeof dataUrl === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) {
        symbol.Configuration.ImageData = dataUrl;
      }
    } catch {
      // Anexo invalido nao impede a importacao dos demais simbolos.
    }
  }));
}

async function hydrateGraphicLibrary(display, baseUrl, env, cookiePath) {
  const graphicSymbols = Array.isArray(display.Symbols)
    ? display.Symbols.filter((symbol) => symbol?.SymbolType?.toLowerCase() === 'graphic')
    : [];
  const uniqueGraphics = new Map();
  for (const symbol of graphicSymbols) {
    const directoryKey = symbol?.Configuration?.DirectoryKey;
    const fileKey = symbol?.Configuration?.FileKey;
    if (typeof directoryKey === 'string' && typeof fileKey === 'string') {
      uniqueGraphics.set(`${directoryKey}\u0000${fileKey}`, { directoryKey, fileKey });
    }
  }

  const sources = new Map();
  await Promise.all([...uniqueGraphics.entries()].map(async ([key, graphic]) => {
    const targetUrl = new URL(baseUrl.toString());
    targetUrl.pathname += '/Services/GraphicLibrary/Graphic';
    targetUrl.searchParams.set('directoryKey', graphic.directoryKey);
    targetUrl.searchParams.set('fileKey', graphic.fileKey);
    const result = await requestEndpoint(targetUrl.toString(), env, cookiePath);
    if (result.status < 200 || result.status >= 300) {
      return;
    }
    try {
      const definition = JSON.parse(result.body);
      if (typeof definition?.Source === 'string' && definition.Source.trim().startsWith('<svg')) {
        sources.set(key, definition.Source);
      }
    } catch {
      // O fallback local continua disponivel quando a biblioteca nao responde.
    }
  }));

  for (const symbol of graphicSymbols) {
    const cfg = symbol.Configuration;
    const source = sources.get(`${cfg?.DirectoryKey}\u0000${cfg?.FileKey}`);
    if (source) {
      cfg.GraphicSource = source;
    }
  }
}

const server = http.createServer((req, res) => {
  if (!setCorsHeaders(req, res)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origem nao permitida.' }));
    return;
  }

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

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', proxy: 'pi-vision-proxy-curl' }));
    return;
  }

  if (req.url && req.url.startsWith('/pivision')) {
    const urlObj = new URL('http://localhost' + req.url);
    const displayId = urlObj.searchParams.get('displayId');

    if (!displayId || !/^\d+$/.test(displayId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Parametro "displayId" invalido ou ausente.' }));
      return;
    }

    void proxyDisplay(displayId, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint nao encontrado.' }));
});

server.listen(PORT, HOST, () => {
  console.log(`PI Vision Proxy rodando em http://${HOST}:${PORT}`);
  console.log(`Verificando credenciais em: ${ENV_PATH}`);
});

server.on('error', (err) => {
  console.error(`Falha ao iniciar proxy na porta ${PORT}:`, err.message);
  process.exitCode = 1;
});
