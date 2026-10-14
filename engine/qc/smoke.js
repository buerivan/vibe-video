#!/usr/bin/env node
/**
 * smoke.js —— 渲染前冒烟测试：逐时间点 seek + 截图 + 收集页面错误
 * 用法: node engine/qc/smoke.js --url http://127.0.0.1:5211 --out output/smoke_xx --times 0.5,4,10.5
 * 有页面错误时 exit 2。
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

function arg(n, d) {
  const i = process.argv.indexOf('--' + n);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
}
const URL_ = arg('url', 'http://127.0.0.1:5173');
const OUT = path.resolve(arg('out', 'output/smoke'));
const times = (arg('times', '') || '').split(',').map(Number).filter((x) => !isNaN(x));

function findBrowser() {
  const cands = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const p of cands) if (fs.existsSync(p)) return p;
  throw new Error('未找到 Chrome/Edge');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--hide-scrollbars', '--mute-audio', '--no-sandbox', '--force-color-profile=srgb'],
    defaultViewport: { width: 1080, height: 1920, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction('window.__VizReady === true', { timeout: 60000 });
  const total = await page.evaluate(() => window.Viz.duration);
  console.log('[smoke] 全片时长', total);

  for (const t of times) {
    await page.evaluate((tt) => window.Viz.seek(tt), t);
    await new Promise((r) => setTimeout(r, 150));
    const f = path.join(OUT, `smoke_t${String(t).replace('.', '_')}.png`);
    await page.screenshot({ path: f, type: 'png', captureBeyondViewport: false });
    console.log('[smoke] 截图 t=' + t);
  }
  await browser.close();
  if (errors.length) {
    console.log('[smoke] 页面错误:');
    errors.forEach((e) => console.log(' -', e));
    process.exit(2);
  }
  console.log('[smoke] 无页面错误');
})().catch((e) => { console.error('[smoke] 失败:', e); process.exit(1); });
