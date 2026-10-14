#!/usr/bin/env node
/**
 * qc/ascii.js —— 把单帧降采样成字符画（无图形界面时"目视"构图）
 * 用法: node engine/qc/ascii.js <png> [列数]
 */
const fs = require('fs');
const { PNG } = require('pngjs');

const file = process.argv[2];
const COLS = process.argv[3] ? parseInt(process.argv[3], 10) : 76;
if (!file) { console.error('用法: node engine/qc/ascii.js <png> [列数]'); process.exit(1); }

const png = PNG.sync.read(fs.readFileSync(file));
const { width: W, height: H } = png;
const ROWS = Math.max(8, Math.round(COLS * (H / W) * 0.5));

// 最近邻降采样
const ramp = ' .:-=+*#%@';
console.log(`${file}   ${W}x${H} -> ${COLS}x${ROWS}`);
console.log('+' + '-'.repeat(COLS) + '+');
for (let ry = 0; ry < ROWS; ry++) {
  let line = '';
  for (let rx = 0; rx < COLS; rx++) {
    const sx = Math.floor((rx + 0.5) * W / COLS);
    const sy = Math.floor((ry + 0.5) * H / ROWS);
    const k = (sy * W + sx) * 4;
    const r = png.data[k], g = png.data[k + 1], b = png.data[k + 2];
    const lum = (r * 299 + g * 587 + b * 114) / 1000;
    let ch = ramp[Math.min(ramp.length - 1, Math.floor(lum / 26))];
    if (ch !== ' ' && r - b > 18) ch = ch === '#' || ch === '%' || ch === '@' ? ch : 'o';
    line += ch;
  }
  console.log('|' + line + '|');
}
console.log('+' + '-'.repeat(COLS) + '+');
console.log('图例: 空格=背景  .:-= 暗  +*#%@ 亮   o = 暖色(金/橙)');
