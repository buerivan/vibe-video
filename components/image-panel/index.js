/**
 * components/image-panel —— 把生成的插画当贴图放进场景（浅色版主打"好看的素材"）
 *
 * 配置:
 * {
 *   "src": "assets/halo-01.png",   // 相对场景根（serve 根）的路径
 *   "w": 8,                         // 世界单位宽度，高度按图比例自动
 *   "entrance": "scale",           // "scale"（回弹放大）| "fade"（纯淡入）
 *   "shadow": true                 // 浅色下加柔和接触阴影接地
 * }
 *
 * 动画：p 0→0.25 淡入（+轻微放大回弹），之后极轻浮动。
 * 贴图异步加载，create() 返回 { ready, update }，由 scene.js 统一 await 后再开拍。
 */
import { shadowTexture, easeOut, clamp } from '/components/_lib/sprites.js';

export default {
  id: 'image-panel',
  create({ THREE, group, cfg, theme, view = { halfW: 5.33, halfH: 9.46, aspect: 0.5625 } }) {
    const src = cfg.src;
    const w = cfg.w || 8;
    const enter = cfg.entrance || 'scale';
    const light = (theme.mode || '') === 'light';

    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    group.add(mesh);

    // 接触阴影：浅色下用柔和的深色圆斑接地，避免插画"飘"在奶油底上
    let disc = null;
    if (light && cfg.shadow !== false) {
      disc = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.16, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2 + 0.12;
      disc.position.y = (cfg.y || 0) - 2.4;
      group.add(disc);
    }

    let loaded = false;
    const ready = new Promise((resolve) => {
      if (!src) { resolve(); return; }
      const loader = new THREE.TextureLoader();
      loader.load(
        src,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          mat.map = tex;
          mat.needsUpdate = true;
          const img = tex.image;
          const ar = (img && img.width && img.height) ? img.width / img.height : 1;
          const h = w / ar;
          mesh.geometry.dispose();
          mesh.geometry = new THREE.PlaneGeometry(w, h);
          if (disc) disc.scale.set(w * 1.18, w * 0.55, 1);
          loaded = true;
          resolve();
        },
        undefined,
        (err) => { console.error('[image-panel] 贴图加载失败:', src, err); resolve(); },
      );
    });

    return {
      ready,
      update(p, tAbs) {
        const raw = clamp(p / 0.25);
        const inE = easeOut(raw);
        mat.opacity = loaded ? inE : 0;
        const s = enter === 'scale' ? (0.92 + 0.08 * inE) : 1;
        mesh.scale.setScalar(s);
        mesh.position.y = (cfg.y || 0) + Math.sin(tAbs * 0.6) * 0.08;
        if (disc) disc.material.opacity = 0.16 * inE;
      },
    };
  },
};
