/**
 * _lib/sprites.js —— 组件共享工具箱
 * 所有组件从这里取文字精灵、辉光纹理、缓动函数，保证全片视觉一致。
 */
import * as THREE from 'three';

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const easeOut = (v) => 1 - Math.pow(1 - clamp(v), 3);
export const easeIn = (v) => clamp(v) * clamp(v);
export const easeInOut = (v) => { const x = clamp(v); return x * x * (3 - 2 * x); };
export const C = (hex) => new THREE.Color(hex);

const SERIF = '"Songti SC","STSong","SimSun","Noto Serif CJK SC","Source Han Serif SC",Georgia,serif';
const SANS = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Source Han Sans SC",sans-serif';

/** 径向辉光纹理（粒子/光晕通用） */
export function glowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.28, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 接触阴影纹理（深色径向，物体下方柔影，浅色模式用它替代辉光做层次） */
export function shadowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(38,35,31,0.55)');
  grd.addColorStop(0.5, 'rgba(38,35,31,0.22)');
  grd.addColorStop(1, 'rgba(38,35,31,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 文字精灵。返回 sprite；用 setText() 改字，用 setOpacity() 改透明度。
 * aspect = 宽/高，默认 4:1（双字名）
 */
export function textSprite(text, opts = {}) {
  const {
    color = '#E8EDF2', serif = false,
    shadow = true,
    bold = false,   // 浅色模式下深色细字会"发灰"，标签应加粗
  } = opts;
  const H = opts.H || 128;
  // 字号默认按画布高度的 60% 取，保证"缩放到世界尺寸后字仍然看得清"。
  const px = opts.px ?? Math.round(H * 0.6);
  // 画布宽度按文字长度自适应——写死 W 会让长文本溢出画布被裁
  // （timeline 的"布雷姆《心理抗拒理论》"曾被裁掉半个"雷"字）。
  const needW = Math.ceil(String(text).length * px * 1.08) + 32;
  const W = Math.max(opts.W || 512, needW);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, opacity: 1,
  }));
  sp.userData = { ctx, tex, W, H, px, color, serif, shadow, bold, aspect: W / H };

  function draw(t) {
    const { ctx: g, W: w, H: h, px: p, color: col, serif: sf, shadow: sh, bold: bd } = sp.userData;
    g.clearRect(0, 0, w, h);
    g.font = `${(sf || bd) ? 'bold ' : ''}${p}px ${sf ? SERIF : SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (sh) { g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 16; }
    g.fillStyle = col;
    g.fillText(t, w / 2, h / 2 + 2);
    sp.userData.tex.needsUpdate = true;
  }
  draw(text);
  sp.setText = draw;
  sp.setOpacity = (o) => { sp.material.opacity = o; };
  // 按"世界宽度"设置尺寸，高度随画布宽高比自动算，文字永不变形
  sp.fitWidth = (worldW) => sp.scale.set(worldW, worldW / sp.userData.aspect, 1);
  sp.fitWidth(2);
  return sp;
}

/** 线框矩形（用于卡片/面板） */
export function rectLines(w, h, color, opacity = 0.7) {
  const pts = [
    new THREE.Vector3(-w / 2, h / 2, 0), new THREE.Vector3(w / 2, h / 2, 0),
    new THREE.Vector3(w / 2, -h / 2, 0), new THREE.Vector3(-w / 2, -h / 2, 0),
    new THREE.Vector3(-w / 2, h / 2, 0),
  ];
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: C(color), transparent: true, opacity }),
  );
  return line;
}

/** 实心矩形（半透明面板） */
export function panel(w, h, color, opacity = 0.08) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: C(color), transparent: true, opacity, depthWrite: false }),
  );
  return m;
}

/** 一条会"生长"的线：setProgress(0..1) 控制画到百分之几 */
export function growLine(from, to, color, opacity = 0.9, segments = 64) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const k = i / segments;
    pts.push(new THREE.Vector3().lerpVectors(from, to, k));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: C(color), transparent: true, opacity,
  }));
  line.setProgress = (p) => {
    const n = Math.max(2, Math.round(segments * clamp(p)) + 1);
    geo.setDrawRange(0, n);
  };
  line.setProgress(0);
  return line;
}

/**
 * 一条会"生长"的粗管（圆形截面圆柱体，端点圆润）—— WebGL 的 LineBasicMaterial
 * 忽略 linewidth，要"粗线"只能用实体几何。接口与 growLine 对齐：返回带 setProgress 的对象。
 * setProgress(p) 沿 from→to 方向把管长从 0 拉到全长，圆头自然出现在生长端。
 */
export function growTube(from, to, color, radius = 0.07, opacity = 0.95) {
  const f = from.clone();
  const t = to.clone();
  const dir = new THREE.Vector3().subVectors(t, f);
  const len = dir.length() || 1e-3;
  const dirN = dir.clone().normalize();
  const geo = new THREE.CylinderGeometry(radius, radius, 1, 16, 1, false);
  const mat = new THREE.MeshBasicMaterial({ color: C(color), transparent: true, opacity });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirN));
  mesh.setProgress = (p) => {
    const cur = len * clamp(p);
    mesh.scale.set(1, Math.max(cur, 1e-4), 1);
    mesh.position.copy(f).addScaledVector(dirN, cur / 2);
    mesh.visible = p > 0.0001;
  };
  mesh.setProgress(0);
  return mesh;
}
