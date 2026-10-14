/**
 * 逐帧离屏渲染 —— 无头浏览器 + 确定性 seek(t)
 * 用法:
 *   node pipeline/shoot.js [选项]
 * 选项:
 *   --url  页面地址（默认 http://127.0.0.1:5173）
 *   --out  帧输出目录（默认 output/frames）
 *   --w --h 画布尺寸（默认 1080x1920 竖屏）
 *   --fps  帧率（默认 30）
 *   --dur  只渲前 N 秒（调试用；不填则渲全片）
 *   --from 从第 N 秒开始（配合 --dur 做分段并行）
 *
 * 关键：每帧都走 window.Viz.seek(t)，画面由 t 纯函数决定，
 *       所以不存在实时录屏的掉帧 / 时间漂移问题。
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

/* ---------- 参数 ---------- */
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const URL_ = arg('url', 'http://127.0.0.1:5173');
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'output', 'frames')));
const W = parseInt(arg('w', '1080'), 10);
const H = parseInt(arg('h', '1920'), 10);
const FPS = parseInt(arg('fps', '30'), 10);
const DUR = arg('dur', null) ? parseFloat(arg('dur')) : null;
const FROM = parseFloat(arg('from', '0'));

/* ---------- 找浏览器 ---------- */
function findBrowser() {
  const cands = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const p of cands) if (fs.existsSync(p)) return p;
  throw new Error('未找到 Chrome/Edge，请设 PUPPETEER_EXECUTABLE_PATH 环境变量指向浏览器可执行文件');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const exe = findBrowser();
  console.log(`[shoot] 浏览器: ${exe}`);
  console.log(`[shoot] 目标: ${URL_}  ${W}x${H} @ ${FPS}fps`);

  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: [
      '--hide-scrollbars',
      '--mute-audio',
      '--disable-lcd-text',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--disable-gpu-vsync',
      '--no-sandbox',
    ],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text()); });
  page.on('pageerror', (e) => console.log('[page error]', e.message));

  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction('window.__VizReady === true', { timeout: 60000 });

  const total = await page.evaluate(() => window.Viz.duration);
  const end = DUR != null ? Math.min(total, FROM + DUR) : total;
  const frames = Math.max(1, Math.round((end - FROM) * FPS));

  console.log(`[shoot] 全片时长 ${total.toFixed(2)}s，本次渲染 ${FROM}s → ${end.toFixed(2)}s，共 ${frames} 帧`);

  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    const t = FROM + i / FPS;
    await page.evaluate((tt) => window.Viz.seek(tt), t);
    const file = path.join(OUT, `frame_${String(i + 1).padStart(5, '0')}.png`);
    await page.screenshot({ path: file, type: 'png', captureBeyondViewport: false });

    if (i % 25 === 0 || i === frames - 1) {
      const done = i + 1;
      const el = (Date.now() - t0) / 1000;
      const eta = (el / done) * (frames - done);
      process.stdout.write(`\r[shoot] ${done}/${frames} 帧  用时 ${el.toFixed(0)}s  预计还需 ${eta.toFixed(0)}s   `);
    }
  }

  await browser.close();
  console.log(`\n[shoot] 完成 → ${OUT}`);
  console.log(`[shoot] 合成命令: node engine/encode.js --frames "${OUT}" --fps ${FPS}`);
})().catch((e) => { console.error('[shoot] 失败:', e); process.exit(1); });
