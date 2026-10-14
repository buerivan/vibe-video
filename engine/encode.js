/**
 * 合成成片 —— ffmpeg 把帧序列 + 音频 + 字幕打成 MP4
 * 用法:
 *   node pipeline/encode.js [选项]
 * 选项:
 *   --frames 帧目录（默认 output/frames，读取 frame_%05d.png）
 *   --out    输出文件（默认 output/成片.mp4）
 *   --fps    帧率（默认 30）
 *   --audio  可选，音频文件（wav/mp3/m4a）
 *   --sub    可选，字幕文件（.srt 或 .ass）
 *   --crf    画质，默认 18（越小越清晰）
 *
 * ffmpeg 二进制优先用 ffmpeg-static，找不到就退回系统 PATH。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const FRAMES = path.resolve(arg('frames', path.join(__dirname, '..', 'output', 'frames')));
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'output', '成片.mp4')));
const FPS = arg('fps', '30');
const AUDIO = arg('audio', null);
const SUB = arg('sub', null);
const CRF = arg('crf', '18');

function findFfmpeg() {
  const cands = [
    path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
    path.join(__dirname, '..', '..', '汉字动画', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
  ];
  for (const p of cands) if (fs.existsSync(p)) return p;
  const which = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (which.status === 0) return 'ffmpeg';
  throw new Error('未找到 ffmpeg。可在本项目 npm i ffmpeg-static，或把 ffmpeg 加入 PATH');
}

const ffmpeg = findFfmpeg();
if (!fs.existsSync(FRAMES)) throw new Error('帧目录不存在: ' + FRAMES);
fs.mkdirSync(path.dirname(OUT), { recursive: true });

/* ---------- 组装参数 ---------- */
const args = ['-y', '-framerate', String(FPS), '-i', path.join(FRAMES, 'frame_%05d.png')];
if (AUDIO) args.push('-i', path.resolve(AUDIO));

const vf = SUB
  ? `subtitles='${path.resolve(SUB).replace(/\\/g, '/').replace(/:/g, '\\:')}'`
  : null;
if (vf) args.push('-vf', vf);

args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(CRF), '-preset', 'slow');
if (AUDIO) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
else args.push('-an');
args.push(OUT);

console.log(`[encode] ffmpeg: ${ffmpeg}`);
console.log(`[encode] ${FRAMES}  ->  ${OUT}${AUDIO ? '  (+音轨)' : ''}${SUB ? '  (+字幕)' : ''}`);

const r = spawnSync(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
if (r.status !== 0) {
  console.error('[encode] 失败:\n' + (r.stderr || '').split('\n').slice(-25).join('\n'));
  process.exit(1);
}
const kb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
console.log(`[encode] 完成 (${kb} MB) → ${OUT}`);
