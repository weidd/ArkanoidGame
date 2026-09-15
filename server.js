'use strict';
/*
 * 照片打磚塊 — 極簡伺服器（零相依）
 *
 * 路由：
 *   GET  /                  建立遊戲頁面
 *   POST /api/games         建立遊戲（JSON: { brick, bg, cols }，圖片為 data URL）→ { id, url }
 *   GET  /api/games/:id     取得遊戲設定
 *   GET  /p/:id             遊玩頁面（分享連結）
 *   GET  /healthz           健康檢查
 *   其他                     public/ 底下的靜態檔案
 *
 * 遊戲資料以 JSON 檔存在 DATA_DIR（預設 ./data/games），不需要資料庫。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data', 'games');
const MAX_BODY = 8 * 1024 * 1024; // 整個請求上限 8 MB
const MAX_IMAGE = 3 * 1024 * 1024; // 單張圖片（data URL）上限 3 MB

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const ID_RE = /^[A-Za-z0-9]{6,32}$/;
const DATA_URL_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

fs.mkdirSync(DATA_DIR, { recursive: true });

function sendJson(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  }, extraHeaders || {}));
  res.end(body);
}

function sendText(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function notFound(res) {
  sendText(res, 404, 'Not found');
}

function sendFile(res, file, head) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (head) return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function serveStatic(res, rel, head) {
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return notFound(res);
  sendFile(res, file, head);
}

function newId() {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return s;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function createGame(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req, MAX_BODY));
  } catch (e) {
    return sendJson(res, e.status || 400, { error: e.status === 413 ? '圖片太大了' : '無效的請求' });
  }
  const brick = body && body.brick;
  const bg = body && body.bg;
  const cols = parseInt(body && body.cols, 10);
  if (typeof brick !== 'string' || typeof bg !== 'string' ||
      brick.length > MAX_IMAGE || bg.length > MAX_IMAGE) {
    return sendJson(res, 413, { error: '圖片太大了' });
  }
  if (!DATA_URL_RE.test(brick) || !DATA_URL_RE.test(bg)) {
    return sendJson(res, 400, { error: '圖片格式不正確' });
  }
  const game = {
    brick,
    bg,
    cols: Number.isFinite(cols) ? Math.min(14, Math.max(4, cols)) : 8,
    createdAt: new Date().toISOString(),
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId();
    try {
      await fs.promises.writeFile(path.join(DATA_DIR, id + '.json'), JSON.stringify(game), { flag: 'wx' });
      return sendJson(res, 201, { id, url: '/p/' + id });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
  sendJson(res, 500, { error: '無法建立遊戲，請再試一次' });
}

async function getGame(res, id) {
  if (!ID_RE.test(id)) return sendJson(res, 404, { error: '找不到遊戲' });
  try {
    const data = await fs.promises.readFile(path.join(DATA_DIR, id + '.json'), 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(data),
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') return sendJson(res, 404, { error: '找不到遊戲' });
    throw e;
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch (e) {
    return notFound(res);
  }
  const method = req.method;

  if (p === '/api/games') {
    if (method === 'POST') return createGame(req, res);
    res.writeHead(405, { Allow: 'POST' });
    return res.end();
  }
  let m = p.match(/^\/api\/games\/([^/]+)$/);
  if (m) {
    if (method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); return res.end(); }
    return getGame(res, m[1]);
  }

  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  const head = method === 'HEAD';

  if (p === '/healthz') return sendText(res, 200, 'ok');
  if (p === '/') return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), head);
  if (/^\/p\/[A-Za-z0-9]+\/?$/.test(p)) return sendFile(res, path.join(PUBLIC_DIR, 'play.html'), head);
  // 遊玩頁面用相對路徑載入資源（為了也能放在靜態主機），/p/style.css 之類的請求轉到 public/
  if (p.startsWith('/p/')) return serveStatic(res, path.basename(p), head);
  return serveStatic(res, p.slice(1), head);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: '伺服器錯誤' });
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`照片打磚塊 伺服器啟動：http://localhost:${PORT}  （資料目錄：${DATA_DIR}）`);
});
