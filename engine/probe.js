/**
 * 几何诊断 —— 把环和名牌投影到屏幕像素，检查有没有出画
 * 用法: node pipeline/probe.js
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

function findBrowser() {
  for (const p of [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)) if (fs.existsSync(p)) return p;
  throw new Error('未找到浏览器');
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--hide-scrollbars', '--no-sandbox'],
    defaultViewport: { width: 1080, height: 1920, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__VizReady === true');
  await page.evaluate(() => window.Viz.seek(20));
  const d = await page.evaluate(() => window.Viz.debug());
  await browser.close();

  console.log('viewport      ', d.viewport.join(' x '));
  console.log('canvas        ', d.canvas.join(' x '));
  console.log('aspect        ', d.aspect);
  console.log('相机位置      ', d.camPos.join(', '));
  console.log('环半径(世界)  ', d.ringRadius);
  console.log('');
  console.log('24节点 X 跨度 ', d.ringSpanX.join(' ~ '), '  画布宽', d.canvas[0]);
  console.log('24节点 Y 跨度 ', d.ringSpanY.join(' ~ '), '  画布高', d.canvas[1]);
  console.log('名牌 X 跨度   ', d.labelSpanX.join(' ~ '));
  console.log('名牌 Y 跨度   ', d.labelSpanY.join(' ~ '));
  console.log('');
  const [w, h] = d.canvas;
  const [x0, x1] = d.ringSpanX, [y0, y1] = d.ringSpanY;
  console.log(`环占画面宽    ${((x1 - x0) / w * 100).toFixed(1)}%    高 ${((y1 - y0) / h * 100).toFixed(1)}%`);
  const issues = [];
  if (x0 < 0 || x1 > w) issues.push('环水平出画');
  if (y0 < 0 || y1 > h) issues.push('环垂直出画');
  if ((x1 - x0) / w > 0.92) issues.push('环过宽，贴边');
  if ((x1 - x0) / w < 0.5) issues.push('环偏窄，竖屏浪费');
  console.log('判定          ', issues.length ? issues.join('；') : '构图正常');
  console.log('');
  console.log('前 6 个节点屏幕坐标:');
  d.nodes.slice(0, 6).forEach((n) => console.log(`  ${n.name}  (${n.sx}, ${n.sy})`));
})().catch((e) => { console.error(e); process.exit(1); });
