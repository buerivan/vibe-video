/**
 * components/particles —— 粒子聚散（聚成字 / 散成沙 / 星图）
 *
 * 配置:
 * {
 *   "mode": "gather"|"scatter",
 *   "text": "概 率",
 *   "count": 900,
 *   "color": "#E0A458",
 *   "spread": 13,             // 散开范围
 *   "size": 0.09
 * }
 *
 * gather：粒子从随机位置聚成文字；scatter：从文字炸开并淡出。
 * 文字目标点由 canvas 采样得到（一次性，之后是纯插值，确定性）。
 */
import { glowTexture, easeOut, clamp, C } from '/components/_lib/sprites.js';

function sampleText(text, count, view) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  // 字号按字数自适应，防止文字超出画布被裁（曾在此栽过：300px 字号画 3 个字直接裁掉两边）
  const px = Math.min(340, Math.floor((S * 0.78) / Math.max(1, text.length)));
  g.font = `bold ${px}px "Songti SC","STSong","SimSun","Noto Serif CJK SC","Source Han Serif SC",serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, S / 2, S / 2 + 8);
  const img = g.getImageData(0, 0, S, S).data;
  const pts = [];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (img[(y * S + x) * 4 + 3] > 128) pts.push([x / S - 0.5, 0.5 - y / S]);
    }
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const [u, v] = pts[Math.floor(Math.random() * pts.length)] || [0, 0];
    out.push([u * view.halfW * 1.05, v * view.halfH * 0.6, 0]);         // 收缩到竖屏安全区内（半宽约 5.3 世界）
  }
  return out;
}

export default {
  id: 'particles',
  create({ THREE, group, cfg, theme, view = { halfW: 5.33, halfH: 9.46, aspect: 0.5625 } }) {
    const color = cfg.color || theme.accent || '#E0A458';
    const count = Math.min(20000, cfg.count || 12000);
    const spread = cfg.spread || 13;
    const size = cfg.size || 0.1;
    const gather = (cfg.mode || 'gather') === 'gather';

    const targets = sampleText(cfg.text || "知 识", count, view);
    const starts = targets.map(() => {
      const r = spread * (0.35 + Math.random() * 0.65);
      const a = Math.random() * Math.PI * 2;
      return [Math.cos(a) * r, Math.sin(a) * r * 0.62, (Math.random() - 0.5) * spread * 0.5];
    });

    const pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: C(color), size, transparent: true, opacity: 0,
      map: glowTexture(64), blending: THREE.AdditiveBlending,
      depthWrite: false, sizeAttenuation: true,
    }));
    group.add(pts);

    return {
      update(p) {
        const e = easeOut(clamp(gather ? p / 0.62 : p / 0.55));
        const fade = gather ? clamp(p / 0.12) : 1 - clamp((p - 0.55) / 0.4);
        const attr = geo.attributes.position;
        for (let i = 0; i < count; i++) {
          const a = starts[i], b = targets[i];
          const k = gather ? e : 1 - e;
          // 加一点扰动，避免完全线性显得呆板
          const wob = Math.sin(i * 12.9898 + p * 6) * 0.05 * (1 - e);
          attr.array[i * 3] = a[0] + (b[0] - a[0]) * k + wob;
          attr.array[i * 3 + 1] = a[1] + (b[1] - a[1]) * k + wob;
          attr.array[i * 3 + 2] = a[2] + (b[2] - a[2]) * k;
        }
        attr.needsUpdate = true;
        pts.material.opacity = fade;
      },
    };
  },
};
