/**
 * components/split-compare —— 双栏对比（两说并置 / 前后对照 / 正误分屏）
 *
 * 配置:
 * {
 *   "left":  { "title":"他们说", "items":["没有原件，所以是伪造的","文物太新，肯定是假的"] },
 *   "right": { "title":"我们信", "items":["版本、引文、出土简牍","干千年，湿万年"] },
 *   "divider": "VS",                       // 中间字，可省略
 *   "verdict": "无征不信，孤证不立",
 *   "leftColor": "#C7522A", "rightColor": "#E8EDF2"
 * }
 *
 * 动画：两栏自两侧滑入 → 条目逐行淡入 → 中间分隔字弹出 → verdict 最后落定
 */
import { textSprite, rectLines, panel, easeOut, clamp, C } from '/components/_lib/sprites.js';

export default {
  id: 'split-compare',
  create({ THREE, group, cfg, theme, view = { halfW: 5.33, halfH: 9.46, aspect: 0.5625 } }) {
    const ink = theme.ink || '#E8EDF2';
    const dim = theme.dim || '#7C8B99';
    const leftColor = cfg.leftColor || '#C7522A';
    const rightColor = cfg.rightColor || ink;
    const accent = cfg.accent || theme.accent || '#E0A458';
    const light = (theme.mode || '') === 'light';
    // 浅色下强调色对比度不足，混 ink 35% 提成深色可读变体；列标题色也按比例压深
    const accentText = light ? '#' + C(accent).lerp(C(ink), 0.35).getHexString() : accent;

    // 竖屏要撑满可见宽，横屏则收窄（横向空间大，但字幕与留白也要占）
    const wide = view.aspect > 1;
    const PW = view.halfW * (wide ? 0.42 : 0.86);
    const PH = view.halfH * (wide ? 0.62 : 0.68);
    const LX = view.halfW * (wide ? -0.24 : -0.49);
    const RX = view.halfW * (wide ? 0.24 : 0.49);

    const cols = [];
    [{ side: 'left', x: LX, col: leftColor }, { side: 'right', x: RX, col: rightColor }].forEach(({ side, x, col }) => {
      const data = cfg[side] || { title: '', items: [] };
      const g = new THREE.Group();
      g.position.set(side === 'left' ? -16 : 16, 0, 0);      // 起始位置在画面外
      group.add(g);

      g.add(rectLines(PW, PH, col, 0.75));
      g.add(panel(PW, PH, col, 0.07));

      const titleColor = light ? '#' + C(col).lerp(C(ink), 0.35).getHexString() : col;
      const title = textSprite(data.title || '', { color: titleColor, serif: true, W: 420, H: 110, bold: true, shadow: !light });
      title.position.set(0, PH / 2 - 0.72, 0.1);
      title.fitWidth(view.halfW * (view.aspect > 1 ? 0.34 : 0.5));
      title.material.opacity = 0;
      g.add(title);

      const items = (data.items || []).map((txt, i) => {
        const it = textSprite(txt, { color: ink, W: 760, H: 96, bold: true, shadow: !light });
        it.position.set(0, PH / 2 - view.halfH * 0.19 - i * view.halfH * 0.115, 0.1);
        it.fitWidth(view.halfW * (view.aspect > 1 ? 0.5 : 0.72));
        it.material.opacity = 0;
        g.add(it);
        return it;
      });
      cols.push({ g, x, title, items, col });
    });

    // 中间分隔线 + 字
    const mid = cfg.divider ? textSprite(cfg.divider, { color: dim, serif: true, W: 260, H: 100, bold: true, shadow: !light }) : null;
    if (mid) {
      mid.position.set(0, 0.2, 0.2);
      mid.fitWidth(view.halfW * (view.aspect > 1 ? 0.2 : 0.3));
      mid.material.opacity = 0;
      group.add(mid);
    }
    const divider = rectLines(0.02, PH * 0.9, dim, 0.5);
    divider.position.set(0, 0, -0.1);
    group.add(divider);

    const VBW = view.halfW * (view.aspect > 1 ? 0.78 : 1.16);   // 提到外层作用域，update 闭包要用
    const verdict = cfg.verdict
      ? textSprite(cfg.verdict, { color: accentText, serif: true, W: 900, H: 120, bold: true, shadow: !light })
      : null;
    if (verdict) {
      verdict.position.set(0, -PH / 2 - 1.35, 0.1);
      verdict.fitWidth(VBW);
      verdict.material.opacity = 0;
      group.add(verdict);
    }

    return {
      update(p) {
        // 栏滑入 0→0.3
        const slide = easeOut(clamp(p / 0.3));
        cols.forEach((c) => { c.g.position.x = c.x * slide; });

        // 标题
        cols.forEach((c) => { c.title.material.opacity = clamp((p - 0.2) / 0.2); });

        // 条目逐行
        cols.forEach((c) => {
          c.items.forEach((it, i) => {
            it.material.opacity = clamp((p - (0.36 + i * 0.13)) / 0.18);
          });
        });

        if (mid) mid.material.opacity = clamp((p - 0.55) / 0.2);
        divider.material.opacity = 0.5 * clamp((p - 0.5) / 0.2);
        if (verdict) {
          const v = clamp((p - 0.78) / 0.2);
          verdict.material.opacity = v;
          const s = 0.9 + 0.1 * easeOut(v);
          verdict.fitWidth(VBW * s);
        }
      },
    };
  },
};
