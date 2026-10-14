#!/usr/bin/env node
/**
 * qc/inspect.js —— 帧序列体检（Node 版，零 Python 依赖）
 * 用法: node engine/qc/inspect.js <帧目录> [--every N]
 *
 * 回答三个问题：
 *   1. 有内容吗（不是纯色/黑屏）？
 *   2. 在动吗（帧间有差异）？
 *   3. 构图对吗（主体在画布内、不贴边、不偏窄）？
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const args = process.argv.slice(2);
const dir = args[0] && !args[0].startsWith('--') ? args[0] : 'output/frames';
const everyIdx = args.indexOf('--every');
const every = everyIdx > -1 && args[everyIdx + 1] ? parseInt(args[everyIdx + 1], 10) : 5;

const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
if (!files.length) { console.error('没有找到帧: ' + dir); process.exit(1); }

function load(f) { return PNG.sync.read(fs.readFileSync(path.join(dir, f))); }

let prev = null;
const rows = [];
for (let i = 0; i < files.length; i++) {
  const png = load(files[i]);
  const d = png.data;
  let sr = 0, sg = 0, sb = 0, lit = 0, bright = 0;
  const n = png.width * png.height;
  for (let k = 0; k < n; k++) {
    const r = d[k * 4], g = d[k * 4 + 1], b = d[k * 4 + 2];
    sr += r; sg += g; sb += b;
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    if (lum > 30) lit++;
    if (lum > 70) bright++;
  }
  const mean = [sr / n, sg / n, sb / n];
  let diff = 0;
  if (prev) {
    const pd = prev.data;
    let acc = 0;
    for (let k = 0; k < n; k++) {
      acc += Math.abs(d[k * 4] - pd[k * 4]) + Math.abs(d[k * 4 + 1] - pd[k * 4 + 1]) + Math.abs(d[k * 4 + 2] - pd[k * 4 + 2]);
    }
    diff = acc / (n * 3);
  }
  // 统计值才进数组；prev 保留当前帧供下一帧做差（内存里同时只有 2 张图）
  rows.push({ f: files[i], mean, lit: lit / n, bright: bright / n, diff });
  prev = png;
}

console.log(`目录: ${dir}`);
console.log(`帧数: ${files.length}`);
const dims = load(files[0]);
console.log(`尺寸: ${dims.width}x${dims.height}`);
console.log('');
console.log('帧                  平均RGB                亮像素   与上帧差');
rows.forEach((r, i) => {
  if (i % every === 0 || i === rows.length - 1) {
    console.log(
      r.f.padEnd(20) +
      `(${r.mean[0].toFixed(1).padStart(5)},${r.mean[1].toFixed(1).padStart(5)},${r.mean[2].toFixed(1).padStart(5)})`.padEnd(22) +
      `${(r.lit * 100).toFixed(2).padStart(6)}%   ${r.diff.toFixed(3).padStart(7)}`,
    );
  }
});

const lits = rows.map((r) => r.lit);
const diffs = rows.slice(1).map((r) => r.diff);
const avg = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length);
console.log('');
console.log(`亮像素占比: ${(Math.min(...lits) * 100).toFixed(2)}% ~ ${(Math.max(...lits) * 100).toFixed(2)}%`);
console.log(`帧间差异  : 均值 ${avg.toFixed(3)}  最大 ${Math.max(...diffs).toFixed(3)}  最小 ${Math.min(...diffs).toFixed(3)}`);
console.log(`判定      : 有内容=${Math.max(...lits) > 0.005}  在运动=${avg > 0.001}`);

/* ---- 构图：重新读中间帧，用高亮像素（>70）找主体包围盒 ---- */
const midName = files[Math.floor(files.length / 2)];
const midPng = load(midName);
const { width: W, height: H, data } = midPng;
let x0 = W, x1 = -1, y0 = H, y1 = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4;
    const lum = (data[k] * 299 + data[k + 1] * 587 + data[k + 2] * 114) / 1000;
    if (lum > 70) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
}
console.log('');
if (x1 < 0) {
  console.log('构图: 未检测到高亮主体（阈值 70），请用 qc/ascii.js 目视确认');
} else {
  console.log(`构图（${midName}，高亮主体）:`);
  console.log(`  水平 ${x0} ~ ${x1}  宽占比 ${((x1 - x0) / W * 100).toFixed(1)}%`);
  console.log(`  垂直 ${y0} ~ ${y1}  高占比 ${((y1 - y0) / H * 100).toFixed(1)}%`);
  const warn = [];
  if (x0 <= 2 || x1 >= W - 3) warn.push('水平贴边/出血');
  if (y0 <= 2 || y1 >= H - 3) warn.push('垂直贴边/出血');
  if ((x1 - x0) / W < 0.45) warn.push('主体偏窄');
  if ((y1 - y0) / H < 0.25) warn.push('主体偏矮，竖屏浪费');
  console.log('  提示: ' + (warn.length ? warn.join('；') : '构图正常'));
}
process.exit(0);
