#!/usr/bin/env node
/**
 * crop_bottom.js —— 裁掉图片底部水印区（默认 8%）
 * 用法: node engine/qc/crop_bottom.js <图片目录或文件> [percent]
 * 原地覆盖。透明 PNG 保留 alpha。
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const target = process.argv[2];
const percent = parseFloat(process.argv[3] || '8');
if (!target) { console.error('用法: node engine/qc/crop_bottom.js <目录或文件> [percent]'); process.exit(1); }

const files = fs.statSync(target).isDirectory()
  ? fs.readdirSync(target).filter((f) => f.toLowerCase().endsWith('.png')).map((f) => path.join(target, f))
  : [target];

for (const p of files) {
  const png = PNG.sync.read(fs.readFileSync(p));
  const nh = Math.round(png.height * (1 - percent / 100));
  const out = new PNG({ width: png.width, height: nh });
  PNG.bitblt(png, out, 0, 0, png.width, nh, 0, 0);
  fs.writeFileSync(p, PNG.sync.write(out));
  console.log(`[crop] ${path.basename(p)}  ${png.height} -> ${nh}`);
}
console.log(`[crop] ${files.length} 张完成`);
