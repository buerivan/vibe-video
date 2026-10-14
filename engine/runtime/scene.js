/**
 * scene.js —— 场景装配运行时（确定性帧驱动）
 * ------------------------------------------------------------------
 * 读 /config.json，把每一"镜"装配成对应组件的实例，
 * 对外只暴露 window.Viz = { duration, fps, seek(t) }。
 *
 * 画面是 t 的纯函数：网页实时播放与无头逐帧渲染逐像素一致。
 *
 * config.json 结构：
 * {
 *   "width":1080, "height":1920, "fps":30,
 *   "theme": { ...一色一义调色板... },
 *   "camera": { "fov":40, "position":[0,0,26], "lookAt":[0,0,0] },
 *   "badge": "#vibe知识大赏 · 本片由代码渲染生成",
 *   "badgeSeconds": 4,
 *   "shots": [
 *     { "component":"timeline", "dur":8, "caption":"字幕一句",
 *       "camera": {...可选覆盖},
 *       "config": { ...该组件的参数... } }
 *   ]
 * }
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const cfg = await (await fetch('/config.json')).json();
const W = cfg.width || 1080;
const H = cfg.height || 1920;
const FPS = cfg.fps || 30;
const theme = cfg.theme || {};
const MODE = theme.mode === 'light' ? 'light' : 'dark';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/* ---------- 时间轴 ---------- */
let acc = 0;
const shots = (cfg.shots || []).map((s) => ({ ...s, start: acc, dur: s.dur, end: (acc += s.dur) }));
const T_TOTAL = acc;
if (!shots.length) throw new Error('config.json 里没有 shots');

/* ---------- 渲染器 ---------- */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setClearColor(new THREE.Color(theme.bg || (MODE === 'light' ? '#FAF7F1' : '#0A0E14')), 1);

const scene = new THREE.Scene();
/* ---------- 环境反射（程序化生成，不依赖外部 HDR 文件） ----------
   没有它，MeshStandardMaterial 的 metalness 就是一片死黑——
   金属感全靠"反射到东西"，而程序化环境就是给它的反射源。 */
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = MODE === 'light' ? 0.35 : 0.20;

/* ---------- 布光 ---------- */
let keyLight, rimLight, fillLight;
if (MODE === 'light') {
  // 浅色：柔和半球天光为主，弱侧光只做"定性"，不做强对比；去掉边缘光（浅色下勾边=脏）
  fillLight = new THREE.HemisphereLight(0xFFFFFF, 0xEDE4D6, 1.05);
  scene.add(fillLight);
  keyLight = new THREE.DirectionalLight(0xFFFFFF, 0.55);
  keyLight.position.set(6, 9, 8);
  scene.add(keyLight);
  const front = new THREE.DirectionalLight(0xFFFFFF, 0.25);
  front.position.set(0, 2, 10);
  scene.add(front);
} else {
  // 深色：主光定形、边缘光勾金边、弱环境兜底
  keyLight = new THREE.DirectionalLight(0xFFF0DC, 0.85);
  keyLight.position.set(6, 9, 8);
  scene.add(keyLight);
  rimLight = new THREE.DirectionalLight(0xF0B95F, 1.15);
  rimLight.position.set(-7, 4, -8);
  scene.add(rimLight);
  fillLight = new THREE.HemisphereLight(0x8A7550, 0x1A130C, 0.28);
  scene.add(fillLight);
}

const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 500);

/* ---------- 背景：径向渐变 ---------- */
function radialBg(hex, mode) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const base = new THREE.Color(hex);
  const grd = g.createRadialGradient(64, 58, 0, 64, 58, 86);
  if (mode === 'light') {
    // 浅色：中心极轻微提亮、四周极轻微压暖，制造"空气感"但不压暗（无暗角）
    const lit = base.clone().lerp(new THREE.Color('#ffffff'), 0.04);
    const edge = base.clone().multiplyScalar(0.965);
    grd.addColorStop(0, `#${lit.getHexString()}`);
    grd.addColorStop(0.6, `#${base.getHexString()}`);
    grd.addColorStop(1, `#${edge.getHexString()}`);
  } else {
    // 深色：中心微亮 → 四周沉下去
    const lit = base.clone().lerp(new THREE.Color('#ffffff'), 0.10);
    const dark = base.clone().multiplyScalar(0.42);
    grd.addColorStop(0, `#${lit.getHexString()}`);
    grd.addColorStop(0.5, `#${base.getHexString()}`);
    grd.addColorStop(1, `#${dark.getHexString()}`);
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
scene.background = radialBg(theme.bg || (MODE === 'light' ? '#FAF7F1' : '#241C14'), MODE);

/* ---------- 后处理：Bloom 让发光元素真正"发光"（浅色下是毒药，停用） ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (MODE !== 'light') {
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
    0.26,   // strength：别贪，过了就把主体轮廓淹在光晕里
    0.42,   // radius
    0.86,   // threshold：只让真正高亮的部分溢光
  );
  composer.addPass(bloom);
}
composer.addPass(new OutputPass());

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();
if (MODE === 'light') {
  const vig = document.getElementById('vignette');
  if (vig) vig.style.display = 'none';
}

const easeInOut = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * 相机：支持固定机位 { fov, position, lookAt }，
 * 也支持运动机位 { from:{...}, to:{...} } —— 按镜内进度 p 缓动插值。
 * 缓动推进（dolly in）是最稳的"电影感"来源：画面在动，但观众察觉不到"在动"。
 */
function applyCamera(c, p = 0) {
  const k = c || cfg.camera || {};
  if (k.from && k.to) {
    const e = easeInOut(p);
    const f = k.from, t = k.to;
    const p0 = f.position || [0, 0, 26], p1 = t.position || p0;
    const l0 = f.lookAt || [0, 0, 0], l1 = t.lookAt || l0;
    camera.fov = (f.fov || 40) + ((t.fov || f.fov || 40) - (f.fov || 40)) * e;
    camera.position.set(...lerp3(p0, p1, e));
    camera.lookAt(...lerp3(l0, l1, e));
  } else {
    camera.fov = k.fov || 40;
    camera.position.set(...(k.position || [0, 0, 26]));
    camera.lookAt(...(k.lookAt || [0, 0, 0]));
  }
  camera.updateProjectionMatrix();
}

/**
 * 当前相机在原点平面上可见的半宽 / 半高（世界单位）。
 * 组件的所有尺寸都按这个比例表达——竖屏 9:16 与横屏 16:9 才能共用同一套代码。
 * （竖屏默认半宽约 5.3，横屏约 16.8；写死世界尺寸的组件换比例必出血或缩成一团）
 */
function viewInfo(c) {
  const k = c || cfg.camera || {};
  const pos = new THREE.Vector3(...(k.position || [0, 0, 26]));
  const look = new THREE.Vector3(...(k.lookAt || [0, 0, 0]));
  const dist = pos.distanceTo(look) || 1;
  const halfH = Math.tan(((k.fov || 40) * Math.PI) / 180 / 2) * dist;
  return { halfW: halfH * camera.aspect, halfH, aspect: camera.aspect };
}

/* ---------- 装配每一镜 ---------- */
const mounted = [];
const readyPromises = [];
for (const shot of shots) {
  let mod;
  try {
    mod = await import(`/components/${shot.component}/index.js`);
  } catch (e) {
    throw new Error(`组件加载失败: ${shot.component} -> ${e.message}`);
  }
  if (!mod.default || typeof mod.default.create !== 'function') {
    throw new Error(`组件 ${shot.component} 没有导出 create()`);
  }
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const api = mod.default.create({
    THREE, group, cfg: shot.config || {}, theme, shot, view: viewInfo(shot.camera || cfg.camera),
  });
  if (typeof api.update !== 'function') throw new Error(`组件 ${shot.component} 的 create() 没返回 update()`);
  if (api.ready && typeof api.ready.then === 'function') readyPromises.push(api.ready);
  mounted.push({ shot, group, api });
}

await Promise.all(readyPromises);

/* ---------- HUD ---------- */
const capEl = document.getElementById('caption');
const badgeEl = document.getElementById('badge');
if (cfg.badge) badgeEl.textContent = cfg.badge;
if (MODE === 'light') {
  capEl.style.color = theme.ink || '#26231F';
  capEl.style.fontFamily = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",system-ui,sans-serif';
  capEl.style.textShadow = '0 1px 3px rgba(38,35,31,0.18)';
  capEl.style.letterSpacing = '0.04em';
  badgeEl.style.color = theme.inkSoft || '#6E675C';
}
let lastShot = -1;

/* ---------- 核心：把一个时刻画出来 ---------- */
function renderFrame(tRaw) {
  const t = clamp(tRaw, 0, T_TOTAL - 1e-6);

  let idx = shots.findIndex((s) => t >= s.start && t < s.end);
  if (idx < 0) idx = shots.length - 1;
  const shot = shots[idx];
  const p = clamp((t - shot.start) / shot.dur);

  mounted.forEach((m, i) => { m.group.visible = i === idx; });
  applyCamera(shot.camera || cfg.camera, p);
  mounted[idx].api.update(p, t);

  // 字幕：前 12% 淡入，后 15% 淡出
  if (shot.caption && idx !== lastShot) {
    capEl.textContent = shot.caption;
    lastShot = idx;
  }
  capEl.style.opacity = shot.caption
    ? String(clamp(Math.min(p / 0.12, (1 - p) / 0.15)))
    : '0';

  // 片尾署名
  const badgeFrom = T_TOTAL - (cfg.badgeSeconds || 4);
  badgeEl.style.opacity = String(clamp((t - badgeFrom) / 1.2));

  composer.render();
}

/* ---------- 网页播放模式 ---------- */
let tNow = 0;
let last = performance.now();
let manual = false;
function loop(now) {
  if (manual) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tNow += dt;
  if (tNow > T_TOTAL) tNow = 0;
  renderFrame(tNow);
  requestAnimationFrame(loop);
}
renderFrame(0);
requestAnimationFrame(loop);

/* ---------- 对外接口 ---------- */
window.Viz = {
  duration: T_TOTAL,
  fps: FPS,
  shots: shots.map((s) => ({ component: s.component, start: +s.start.toFixed(3), dur: s.dur })),
  seek(t) { manual = true; renderFrame(t); },
  play() { manual = false; last = performance.now(); requestAnimationFrame(loop); },
  /* 枚举所有几何体，返回 position 属性含 NaN 的（供 qc 定位渲染异常） */
  findNaN() {
    const bad = [];
    scene.traverse((o) => {
      const g = o.geometry;
      if (!g || !g.attributes || !g.attributes.position) return;
      const a = g.attributes.position.array;
      for (let i = 0; i < a.length; i++) {
        if (!Number.isFinite(a[i])) {
          bad.push({
            type: o.type,
            name: o.name || '',
            parent: o.parent ? o.parent.type : '',
            firstNaN: i,
            sample: [a[i - 1], a[i], a[i + 1]],
          });
          break;
        }
      }
    });
    return bad;
  },
  debug() {
    return {
      viewport: [window.innerWidth, window.innerHeight],
      canvas: [renderer.domElement.width, renderer.domElement.height],
      duration: T_TOTAL,
      shotCount: shots.length,
    };
  },
};
window.__VizReady = true;
