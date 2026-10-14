/**
 * components/big-text —— 关键字大标题（金句 / 概念名 / 结论）
 *
 * 配置:
 * {
 *   "text": "心理抗拒",
 *   "color": "#F0B95F",        // 缺省 theme.accent
 *   "sub": "psychological reactance"   // 可选副标题小字
 * }
 *
 * 用途：需要"看清这几个字"的镜头。粒子（particles）适合氛围，
 * 但要清晰可读的关键字一律用本组件——粒子密了糊、疏了断，极难兼顾。
 */
import { textSprite, easeOut, clamp, C } from '/components/_lib/sprites.js';

export default {
  id: 'big-text',
  create({ THREE, group, cfg, theme, view }) {
    const light = (theme.mode || '') === 'light';
    const ink = theme.ink || '#26231F';
    const accent = theme.accent || '#FF6B4A';
    // 浅色下强调色（#FF6B4A）在奶油底对比度仅约 2.5:1，混 ink 35% 提成深色可读变体
    const accentText = light ? '#' + C(accent).lerp(C(ink), 0.35).getHexString() : accent;
    const userColor = cfg.color || null;
    const color = light ? (userColor || accentText) : (userColor || accent);
    const W = cfg.text.length > 4 ? 1100 : 800;

    const sp = textSprite(cfg.text, { color, serif: true, W, H: W * 0.26, bold: true, shadow: !light });
    // scale：整镜字号缩放（默认 1）。竖屏下 halfW*1.25 的默认字偏小，可传 1.3~1.5 放大
    const BW = view.halfW * (cfg.scale || 1) * (cfg.text.length > 4 ? 1.25 : 0.95);
    sp.fitWidth(BW);
    group.add(sp);

    let sub = null;
    if (cfg.sub) {
      sub = textSprite(cfg.sub, { color: theme.dim || (light ? '#6E675C' : '#A89578'), W: 700, H: 90, bold: true, shadow: !light });
      sub.position.set(0, -view.halfH * 0.14, 0);
      sub.fitWidth(view.halfW * (cfg.subScale || 0.75));
      sub.material.opacity = 0;
      group.add(sub);
    }

    return {
      update(p) {
        const inE = easeOut(clamp(p / 0.3));
        const out = clamp((p - 0.86) / 0.14);
        sp.material.opacity = inE * (1 - out);
        const s = 0.84 + 0.16 * inE;
        sp.fitWidth(BW * s);
        if (sub) {
          sub.material.opacity = clamp((p - 0.4) / 0.25) * (1 - out);
          sub.position.set(0, -view.halfH * 0.14 - 0.1 * (1 - inE), 0);
        }
      },
    };
  },
};
