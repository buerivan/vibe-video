/**
 * components/dice-3d —— 六面一点骰子（晕轮效应隐喻镜）
 *
 * 隐喻（许鹏 2026-10-14 提案）：骰子六个面都是同一个点——
 * 三视图最多看到三个面，但每个面都是那"一点"：
 * 印象成型后，你换哪个角度看人，看到的都是同一个印象。
 *
 * 配置:
 * {
 *   "color": "#FFFDF6",   // 骰身
 *   "pip": "#FF6B4A",     // 点
 *   "size": 3.2,          // 边长（世界单位）
 *   "spin": 1.35          // 全镜自转弧度
 * }
 *
 * 动画：静置倾斜（同时露出顶/前/右三个面）+ 慢速自转 + 轻浮动，p 纯函数。
 */
import { shadowTexture, easeOut, clamp } from '/components/_lib/sprites.js';

export default {
  id: 'dice-3d',
  create({ THREE, group, cfg, theme, view = { halfW: 5.33, halfH: 9.46 } }) {
    const light = (theme.mode || '') === 'light';
    const bodyColor = cfg.color || '#FFFDF6';
    const pipColor = cfg.pip || theme.accent || '#FF6B4A';
    const S = cfg.size || 3.2;

    const dice = new THREE.Group();
    group.add(dice);

    /* 骰身：六面同材质（哑光，浅色下 metalness 0） */
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor, roughness: light ? 0.62 : 0.44, metalness: 0,
    });
    dice.add(new THREE.Mesh(new THREE.BoxGeometry(S, S, S), Array(6).fill(bodyMat)));

    /* 六个面各贴一枚点：CircleGeometry 沿法线外移一点，六面同点 */
    const pipGeo = new THREE.CircleGeometry(S * 0.11, 32);
    const pipMat = new THREE.MeshBasicMaterial({ color: pipColor });
    const faces = [
      { pos: [0, 0, S / 2 + 0.012], rot: [0, 0, 0] },
      { pos: [0, 0, -S / 2 - 0.012], rot: [0, Math.PI, 0] },
      { pos: [S / 2 + 0.012, 0, 0], rot: [0, Math.PI / 2, 0] },
      { pos: [-S / 2 - 0.012, 0, 0], rot: [0, -Math.PI / 2, 0] },
      { pos: [0, S / 2 + 0.012, 0], rot: [-Math.PI / 2, 0, 0] },
      { pos: [0, -S / 2 - 0.012, 0], rot: [Math.PI / 2, 0, 0] },
    ];
    for (const f of faces) {
      const pip = new THREE.Mesh(pipGeo, pipMat);
      pip.position.set(...f.pos);
      pip.rotation.set(...f.rot);
      dice.add(pip);
    }

    /* 接触阴影 */
    let disc = null;
    if (light) {
      disc = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2 + 0.1;
      disc.position.y = -S * 0.95;
      disc.scale.set(S * 1.7, S * 0.75, 1);
      group.add(disc);
    }

    return {
      update(p, tAbs) {
        const inE = easeOut(clamp(p / 0.2));
        // 静置角先保证三个面同时可见（顶/前/右），再慢速自转
        dice.rotation.x = 0.42 + Math.sin(tAbs * 0.4) * 0.03;
        dice.rotation.y = -0.62 + p * (cfg.spin ?? 1.35);
        dice.position.y = Math.sin(tAbs * 0.7) * 0.1;
        dice.scale.setScalar(0.9 + 0.1 * inE);
        if (disc) disc.material.opacity = 0.2 * inE;
      },
    };
  },
};
