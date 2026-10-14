/**
 * components/trait-chips —— "一 traits 拉满"清单卡（替代分叉树）
 *
 * 分叉树的两个毛病（2026-10-14 许鹏反馈）：字太小、四根细线+小圆点太寒酸。
 * 本组件改用「根标签 + 清单卡」结构：
 *   顶部一枚圆角胶囊（根印象），下方一条竖脊长出，四张圆角清单卡依次点亮——
 *   卡内大字、卡底暖色填充，读起来像一张被打勾的评分表，正好扣"以偏概全"。
 *
 * 配置:
 * {
 *   "root": "他长得好看",
 *   "chips": ["聪明", "成功", "快乐", "可信"]
 * }
 *
 * 动画（p 纯函数）：根 0~0.16 回弹入场 → 竖脊 0.10~0.30 生长
 *   → 四卡在 0.28~0.94 均分点亮（每卡 pop 缩放 + 点亮变色）。
 */
import * as THREE from 'three';
import { textSprite, shadowTexture, growTube, easeOut, clamp, C } from '/components/_lib/sprites.js';

/** 圆角卡片精灵：整卡（底+边+字）画进一张 canvas，放大后边缘依旧干净 */
function cardSprite(text, { w, h, r, bg, border, color, px, serif = false }) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  // 圆角矩形
  g.beginPath();
  g.moveTo(r, 0);
  g.arcTo(w, 0, w, h, r);
  g.arcTo(w, h, 0, h, r);
  g.arcTo(0, h, 0, 0, r);
  g.arcTo(0, 0, w, 0, r);
  g.closePath();
  if (bg) { g.fillStyle = bg; g.fill(); }
  if (border) { g.strokeStyle = border; g.lineWidth = Math.max(4, h * 0.028); g.stroke(); }
  g.font = `${serif ? 'bold ' : 'bold '}${px}px ${serif
    ? '"Songti SC","STSong","SimSun","Noto Serif CJK SC","Source Han Serif SC",Georgia,serif'
    : '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC","Source Han Sans SC",sans-serif'}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.userData.aspect = w / h;
  sp.fitW = (worldW) => sp.scale.set(worldW, worldW / sp.userData.aspect, 1);
  return sp;
}

export default {
  id: 'trait-chips',
  create({ THREE, group, cfg, theme, view = { halfW: 5.33, halfH: 9.46 } }) {
    const light = (theme.mode || '') === 'light';
    const ink = theme.ink || '#26231F';
    const inkSoft = theme.inkSoft || '#6E675C';
    const accent = theme.accent || '#FF6B4A';
    const accentText = light ? '#' + C(accent).lerp(C(ink), 0.35).getHexString() : accent;
    const orbit = theme.orbit || '#C9BCA8';

    /* 几何（竖屏 halfW≈5.33）：卡高 = chipW*200/760，行距必须 ≥ 卡高+0.3 否则叠压；
       整栈上移给底部字幕让位 */
    const rootW = cfg.rootW ?? Math.min(view.halfW * 1.12, 6.0);
    const rootY = cfg.rootY ?? view.halfH * 0.55;
    const chipW = cfg.chipW ?? Math.min(view.halfW * 1.24, 6.6);
    const chipHWorld = chipW * (200 / 760);
    const gap = chipHWorld + 0.32;
    const yTop = cfg.chipTop ?? view.halfH * 0.36;
    const ys = cfg.chipYs ?? [0, 1, 2, 3].map((i) => yTop - i * gap);

    /* 根胶囊（点亮态：珊瑚底白字） */
    const rootLit = cardSprite(cfg.root || '', {
      w: 760, h: 200, r: 100,
      bg: accent, border: null, color: '#FFFDF8', px: 92,
    });
    rootLit.fitW(rootW);
    rootLit.position.set(0, rootY, 0.03);
    group.add(rootLit);

    /* 根接触阴影 */
    let disc = null;
    if (light) {
      disc = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2 + 0.12;
      disc.position.y = rootY - rootW / rootLit.userData.aspect / 2 - 0.3;
      disc.scale.set(rootW * 0.9, rootW * 0.4, 1);
      group.add(disc);
    }

    /* 竖脊：从根底部长到最后一卡；整体后移 z=-0.15 物理让位
       （renderOrder 对 sprite 混排不稳定，z 错位才是硬保证） */
    const spineEnd = ys[ys.length - 1];
    const spine = growTube(
      new THREE.Vector3(0, rootY - chipHWorld * 0.62, -0.15),
      new THREE.Vector3(0, spineEnd, -0.15),
      orbit, 0.075, 0.9,
    );
    spine.renderOrder = -2;
    group.add(spine);

    /* 四张清单卡：暗态/亮态双精灵交叉淡化 */
    const chips = (cfg.chips || []).map((txt, i) => {
      const dim = cardSprite(txt, {
        w: 760, h: 200, r: 44,
        bg: light ? '#F3EDE3' : '#1A2230', border: light ? '#E3D9C8' : '#2C3648',
        color: inkSoft, px: 88,
      });
      const lit = cardSprite(txt, {
        w: 760, h: 200, r: 44,
        bg: light ? '#FFE9E2' : '#3A2A20', border: accent,
        color: light ? ink : '#FFD9CC', px: 88,
      });
      const y = ys[i] ?? (ys[ys.length - 1] - i * chipHWorld * 1.6);
      dim.position.set(0, y, 0.02);
      lit.position.set(0, y, 0.04);
      dim.fitW(chipW); lit.fitW(chipW);
      dim.material.opacity = 0; lit.material.opacity = 0;
      group.add(dim, lit);
      return { dim, lit, y };
    });

    return {
      update(p) {
        const eRoot = easeOut(clamp(p / 0.16));
        rootLit.material.opacity = eRoot;
        // pop：0.85→1 回弹（fitW 已设 scale，这里乘系数）
        const rs = 0.85 + 0.15 * eRoot;
        rootLit.scale.set(rootW * rs, (rootW * rs) / rootLit.userData.aspect, 1);
        if (disc) disc.material.opacity = 0.16 * eRoot;

        spine.setProgress(clamp((p - 0.10) / 0.20));

        chips.forEach((ch, i) => {
          // 暗态卡随竖脊一起现形；点亮窗口起点 0.28 均匀排开，每卡 0.16 交叉淡化
          const start = 0.28 + i * 0.155;
          const eIn = easeOut(clamp((p - start) / 0.16));
          const dimOp = clamp((p - 0.24) / 0.1) * (1 - eIn); // 暗态先现，点亮后交叉到亮态
          ch.dim.material.opacity = dimOp * 0.95;
          ch.lit.material.opacity = eIn;
          const s = 0.9 + 0.1 * eIn;
          ch.lit.scale.set(chipW * s, (chipW * s) / ch.lit.userData.aspect, 1);
          ch.dim.scale.copy(ch.lit.scale);
        });
      },
    };
  },
};
