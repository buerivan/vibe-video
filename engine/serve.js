/**
 * serve.js —— 多路径静态服务器（开源 repo 形态）
 * 用法: node engine/serve.js [--root scenes/<选题>] [端口]
 *
 * 路由（把仓库各目录合并成一个虚拟站点根）:
 *   /                      -> engine/runtime/index.html
 *   /vendor/**             -> 构建产物 three.module.js / three.core.js
 *   /components/**         -> 组件库
 *   /config.json           -> --root 指定场景目录下的 config.json
 *   /assets/**             -> 该场景目录下的 assets/
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

let root = null;
let port = 5173;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) root = path.resolve(REPO, args[++i]);
  else if (/^\d+$/.test(args[i])) port = parseInt(args[i], 10);
}
if (!root) {
  // 默认：examples 里第一个示例，否则 scenes 里第一个
  const ex = path.join(REPO, 'examples');
  const sc = path.join(REPO, 'scenes');
  for (const base of [sc, ex]) {
    if (fs.existsSync(base)) {
      const first = fs.readdirSync(base).find((d) => fs.existsSync(path.join(base, d, 'config.json')));
      if (first) { root = path.join(base, first); break; }
    }
  }
}
if (!root || !fs.existsSync(path.join(root, 'config.json'))) {
  console.error('[serve] 未找到场景。用法: node engine/serve.js --root scenes/<选题名>');
  process.exit(1);
}

const RUNTIME = path.join(REPO, 'engine', 'runtime');
const VENDOR = path.join(REPO, 'engine', 'runtime', 'vendor');
const COMPONENTS = path.join(REPO, 'components');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/favicon.ico') { res.writeHead(204).end(); return; }

  let file = null;
  if (rel === '/config.json') file = path.join(root, 'config.json');
  else if (rel === '/index.html') file = path.join(RUNTIME, 'index.html');
  else if (rel.startsWith('/vendor/')) file = path.join(VENDOR, rel.slice(8));
  else if (rel.startsWith('/components/')) file = path.join(COMPONENTS, rel.slice(12));
  else if (rel.startsWith('/assets/')) file = path.join(root, rel);
  else if (rel.startsWith('/scene/')) file = path.join(RUNTIME, rel.slice(7));

  if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 ' + rel); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 ' + rel); return; }
    // config.json 容错：AI 生成时容易带 /* */ 或 // 注释，JSON.parse 会炸，这里剥掉
    if (file.endsWith('config.json')) {
      buf = Buffer.from(
        buf.toString('utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:"'\\])\/\/[^\n\r]*/g, '$1'),
        'utf8',
      );
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[serve] http://127.0.0.1:${port}`);
  console.log(`[serve] 场景: ${path.relative(REPO, root)}`);
});
