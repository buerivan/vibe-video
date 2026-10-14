/**
 * components/timeline —— 时间轴（历史事件推进 / 纪年 / 人物生卒）
 *
 * 配置:
 * {
 *   "spanYears": [1600, 2000],          // 轴的范围，缺省按事件自动
 *   "events": [
 *     { "year": "1685", "label": "哈杜安：古希腊史是修士伪造的", "side": -1 }
 *   ],
 *   "highlight": [1],                   // 需要强调的事件下标
 *   "accent": "#E0A458"                 // 强调色，缺省用 theme.accent
 * }
 *
 * 动画：轴线自左展开 → 事件按年份顺序依次点亮（节点弹出 + 标签淡入）
 */
import { textSprite, glowTexture, growLine, easeOut, clamp, C } from '/components/_lib/sprites.js';

export default {
  id: 'timeline',
  create({ THREE, group, cfg, theme, view = { halfW: 5.33, halfH: 9.46, aspect: 0.5625 } }) {
    const accent = cfg.accent || theme.accent || '#E0A458';
    const ink = theme.ink || '#E8EDF2';
    const dim = theme.dim || '#7C8B99';
    const light = (theme.mode || '') === 'light';
    // 浅色下强调色对比度不足，混 ink 35% 提成深色可读变体；浅色停用加性光晕（白光在浅底=糊成亮斑）
    const accentText = light ? '#' + C(accent).lerp(C(ink), 0.35).getHexString() : accent;

    const events = (cfg.events || []).map((e) => ({ side: 1, ...e }));
    const years = events.map((e) => parseFloat(String(e.year).match(/-?\d+(\.\d+)?/)?.[0] || 0));
    const span = cfg.spanYears || [Math.min(...years) - 20, Math.max(...years) + 20];
    const lo = span[0], hi = span[1];
    // 轴宽按竖屏可见宽度设计：默认相机 z=26 / fov=40 时水平可见约 10.7 世界单位
    const AXIS_HALF = cfg.axisHalf || view.halfW * 0.86;
    const X = (yr) => -AXIS_HALF + ((yr - lo) / (hi - lo)) * (AXIS_HALF * 2);
    const AXIS_Y = cfg.axisY || 0;
    const SIDE_Y = cfg.sideY || view.halfH * 0.36;

    /* --- 主轴 --- */
    const axis = growLine(
      new THREE.Vector3(-AXIS_HALF - 0.4, AXIS_Y, 0),
      new THREE.Vector3(AXIS_HALF + 0.4, AXIS_Y, 0),
      theme.orbit || '#2E4A5C', 0.9, 96,
    );
    group.add(axis);

    /* --- 年份刻度 --- */
    const tickGroup = new THREE.Group();
    group.add(tickGroup);
    const tickStep = cfg.tickStep || Math.max(10, Math.round((hi - lo) / 5 / 10) * 10);
    for (let yr = Math.ceil(lo / tickStep) * tickStep; yr <= hi; yr += tickStep) {
      const x = X(yr);
      tickGroup.add(growLine(new THREE.Vector3(x, AXIS_Y, 0), new THREE.Vector3(x, AXIS_Y - 0.3, 0),
        theme.orbit || '#2E4A5C', 0.6, 4));
      const t = textSprite(String(yr), { color: dim, W: 256, H: 72, bold: true, shadow: !light });
      t.position.set(x, AXIS_Y - 0.8, 0);
      t.fitWidth(view.halfW * 0.20);
      tickGroup.add(t);
    }

    /* --- 事件 --- */
    const order = events.map((e, i) => i).sort((a, b) => years[a] - years[b]);
    const evs = order.map((i, rank) => {
      const e = events[i];
      const x = X(years[i]);
      const y = AXIS_Y + e.side * SIDE_Y;
      const col = (cfg.highlight || []).includes(i) ? accentText : ink;

      // 引线
      const stem = growLine(new THREE.Vector3(x, AXIS_Y, 0), new THREE.Vector3(x, y, 0),
        (cfg.highlight || []).includes(i) ? accent : theme.orbit || '#2E4A5C', 0.75, 20);
      group.add(stem);

      // 节点
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 20, 14),
        new THREE.MeshBasicMaterial({ color: C(col), transparent: true, opacity: 0.25 }),
      );
      dot.position.set(x, AXIS_Y, 0);
      group.add(dot);

      // 光晕
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: C(col), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
      }));
      halo.position.set(x, AXIS_Y, 0);
      halo.scale.set(1.6, 1.6, 1);
      group.add(halo);

      // 标签（长文本用更宽画布；字号由 textSprite 按画布高度自动定）
      const txt = String(e.label || '');
      const label = textSprite(txt, { color: col, W: 700, H: 150, bold: true, shadow: !light });
      label.position.set(x, y + (e.side > 0 ? view.halfH * 0.048 : -view.halfH * 0.048), 0);
      label.fitWidth(view.halfW * 0.52);
      label.material.opacity = 0;
      group.add(label);

      return { e, rank, dot, halo, stem, label, x, y };
    });

    const n = evs.length;
    const appearEnd = 0.62;                 // 前 62% 时间用于依次出现

    return {
      update(p, tAbs) {
        // 轴 0→18%
        axis.setProgress(clamp(p / 0.18));
        tickGroup.children.forEach((c) => { if (c.material) c.material.opacity = (c.isLine ? 0.6 : 0.85) * clamp((p - 0.12) / 0.15); });

        evs.forEach((ev, i) => {
          const local = clamp((p - 0.18 - (i / Math.max(1, n)) * appearEnd) / 0.16);
          const lit = easeOut(local);
          const isHl = (cfg.highlight || []).includes(events.indexOf(ev.e));

          ev.stem.setProgress(lit);
          ev.dot.material.opacity = (0.25 + 0.75 * lit) * (isHl ? 1 : 0.9);
          ev.dot.scale.setScalar(0.7 + 0.5 * lit);
          // 当前刚出现的事件呼吸
          const age = p - (0.18 + (i / Math.max(1, n)) * appearEnd);
          const breath = age > 0 && age < 0.9 ? 0.4 + 0.4 * Math.sin(age * 9) : 0;
          const haloOp = light ? 0 : (isHl ? 0.45 + breath : 0.12);
          ev.halo.material.opacity = lit * haloOp;
          ev.label.material.opacity = lit * (isHl ? 1 : 0.8);
        });
      },
    };
  },
};
