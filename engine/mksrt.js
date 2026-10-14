#!/usr/bin/env node
/**
 * mksrt.js —— 由 config.json 生成 SRT 字幕（旁白先行 + 估算时间轴）
 * 用法: node engine/mksrt.js --config <config.json> --out <out.srt>
 *
 * 一镜一条字幕；长句按每行 ~18 字拆行（剪映/抖音观看舒适宽度）。
 * 时间轴是"估算"的（260 字/分钟）；若剪映朗读后实际时长不符，
 * 按 docs/workflow.md 的二程对齐流程回传修正。
 */
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const cfgPath = path.resolve(arg('config', ''));
const OUT = path.resolve(arg('out', 'output/subtitles.srt'));
if (!cfgPath || !fs.existsSync(cfgPath)) {
  console.error('用法: node engine/mksrt.js --config <config.json> --out <out.srt>');
  process.exit(1);
}

let cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));

const fmt = (s) => {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const mil = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${sec},${mil}`;
};

const wrap = (text, per = 18) => {
  const out = [];
  let line = '';
  const chars = Array.from(String(text));
  for (let i = 0; i < chars.length; i++) {
    line += chars[i];
    if (line.length >= per) {
      // 断行回避：句读标点不落到下一行行首（". "孤行很难看）
      let j = i;
      while (j + 1 < chars.length && '。！？，、；：）」』”'.includes(chars[j + 1])) {
        line += chars[j + 1];
        j++;
      }
      i = j;
      out.push(line); line = '';
    }
  }
  if (line) out.push(line);
  return out.slice(0, 3).join('\n');          // 最多 3 行，超出截断
};

let acc = 0;
const blocks = [];
for (const shot of cfg.shots || []) {
  const start = acc;
  acc += shot.dur;
  if (!shot.caption) continue;
  blocks.push(
    `${blocks.length + 1}\n` +
    `${fmt(start + 0.15)} --> ${fmt(start + shot.dur - 0.1)}\n` +
    `${wrap(shot.caption)}\n`,
  );
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, blocks.join('\n') + '\n', 'utf8');
console.log(`[srt] ${blocks.length} 条字幕 → ${OUT}`);
console.log(`[srt] 总时长 ${acc.toFixed(1)}s（估算时间轴，260 字/分钟）`);
