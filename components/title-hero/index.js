/**
 * components/title-hero —— 首页封面镜：插画 + 大标题 + 共鸣钩子
 *
 * 配置:
 * {
 *   "src": "assets/hero.png",     // 插画（相对场景根）
 *   "title": "晕轮效应",           // 主标题（衬线粗、accent 色，比 big-text 大一档）
 *   "hook": "看脸的时代，可能是一种本能。",  // 共鸣钩子（ink 色）
 *   "imgW": 6.2, "imgY": 2.4,     // 插画宽/纵向位置
 *   "titleY": -2.4, "hookY": -4.0 // 文字纵向位置
 * }
 *
 * 入场：插画回弹放大 → 标题上浮 → 钩子淡入。贴图异步由 scene.js 统一 await。
 */
import { textSprite, shadowTexture, easeOut, clamp, C } from '/components/_lib/sprites.js';

export default {
  id: 'title-hero',
  create({ THREE, group, cfg, theme, view = { halfW: 5.33, halfH: 9.46 } }) {
    const light = (theme.mode || '') === 'light';
    const ink = theme.ink || '#26231F';
    const inkSoft = theme.inkSoft || '#6E675C';
    const accent = theme.accent || '#FF6B4A';
    // 大字号标题也做 accent 混 ink，保证奶油底上可读
    const accentText = light ? '#' + C(accent).lerp(C(ink), 0.30).getHexString() : accent;

    /* 插画 */
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    const imgY = cfg.imgY ?? 2.4;
    mesh.position.y = imgY;
    group.add(mesh);

    /* 接触阴影 */
    let disc = null;
    if (light && cfg.shadow !== false) {
      disc = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2 + 0.12;
      disc.position.y = (cfg.shadowY ?? imgY - 3.4);
      group.add(disc);
    }

    /* 主标题：本组件的核心诉求就是"够大" */
    const title = textSprite(cfg.title || '', {
      color: cfg.titleColor || accentText, serif: true, bold: true, shadow: false,
      H: 240, px: 176,
    });
    const titleW = cfg.titleW ?? Math.min(view.halfW * 1.55, 8.4);
    title.fitWidth(titleW);
    const titleY = cfg.titleY ?? -2.6;
    title.position.y = titleY + 0.55;
    title.material.opacity = 0;
    group.add(title);

    /* 共鸣钩子 */
    let hook = null;
    if (cfg.hook) {
      hook = textSprite(cfg.hook, {
        color: ink, bold: true, shadow: false,
        H: 120, px: 62,
      });
      hook.fitWidth(cfg.hookW ?? Math.min(view.halfW * 1.42, 7.6));
      const hookY = cfg.hookY ?? (titleY - 1.9);
      hook.position.y = hookY;
      hook.material.opacity = 0;
      group.add(hook);
    }

    /* 问号浮动 sprite（可选）：气泡里的问号独立动效 */
    let qMesh = null;
    let qTexPromise = Promise.resolve();
    if (cfg.qSrc) {
      const qMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
      qMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), qMat);
      qMesh.position.set(cfg.qX ?? 0, cfg.qY ?? 0, cfg.qZ ?? 0.05);
      group.add(qMesh);
      const qW = cfg.qW ?? 0.4;
      qTexPromise = new Promise((resolve) => {
        new THREE.TextureLoader().load(
          cfg.qSrc,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 8;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            qMat.map = tex;
            qMat.needsUpdate = true;
            const img = tex.image;
            const ar = (img && img.width && img.height) ? img.width / img.height : 1;
            qMesh.geometry.dispose();
            qMesh.geometry = new THREE.PlaneGeometry(qW, qW / ar);
            qMesh.userData.w = qW;
            resolve();
          },
          undefined,
          (err) => { console.error('[title-hero] 问号贴图加载失败:', cfg.qSrc, err); resolve(); },
        );
      });
    }

    let loaded = false;
    const ready = Promise.all([
      new Promise((resolve) => {
        if (!cfg.src) { loaded = true; resolve(); return; }
        new THREE.TextureLoader().load(
          cfg.src,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 8;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            mat.map = tex;
            mat.needsUpdate = true;
            const img = tex.image;
            const ar = (img && img.width && img.height) ? img.width / img.height : 1;
            const w = cfg.imgW ?? 6.2;
            mesh.geometry.dispose();
            mesh.geometry = new THREE.PlaneGeometry(w, w / ar);
            if (disc) disc.scale.set(w * 1.1, w * 0.5, 1);
            loaded = true;
            resolve();
          },
          undefined,
          (err) => { console.error('[title-hero] 贴图加载失败:', cfg.src, err); loaded = true; resolve(); },
        );
      }),
      qTexPromise,
    ]);

    return {
      ready,
      update(p, tAbs) {
        // 三段入场：插画 0~0.22 → 标题 0.14~0.42 → 钩子 0.34~0.6
        const eImg = easeOut(clamp(p / 0.22));
        const eTit = easeOut(clamp((p - 0.14) / 0.28));
        const eHook = easeOut(clamp((p - 0.34) / 0.26));
        mat.opacity = loaded ? eImg : 0;
        // 入场放大 + 持续呼吸（幅度小，不晕）
        const breathe = 1 + Math.sin(tAbs * 1.1) * 0.006;
        mesh.scale.setScalar((0.92 + 0.08 * eImg) * breathe);
        mesh.position.y = imgY + Math.sin(tAbs * 0.6) * 0.08;
        if (disc) disc.material.opacity = 0.15 * eImg;
        // 问号：慢速上下浮动 + 轻微摆动，节奏与插画错开
        if (qMesh && qMesh.material.map) {
          const qW = qMesh.userData.w || 0.4;
          qMesh.material.opacity = eImg;
          qMesh.position.y = (cfg.qY ?? 0) + Math.sin(tAbs * 1.4 + 0.8) * 0.06;
          qMesh.position.x = (cfg.qX ?? 0) + Math.sin(tAbs * 0.9) * 0.02;
          qMesh.rotation.z = Math.sin(tAbs * 1.1) * 0.08;
          qMesh.scale.setScalar(1 + Math.sin(tAbs * 1.7) * 0.04);
        }
        title.material.opacity = eTit;
        title.position.y = (cfg.titleY ?? -2.6) + 0.55 * (1 - eTit);
        if (hook) hook.material.opacity = eHook * 0.92;
      },
    };
  },
};
