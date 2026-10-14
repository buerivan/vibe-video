/**
 * components/object-3d —— 3D 物体特写（典籍 / 器物 / 天体 / 骰子）
 *
 * 配置:
 * {
 *   "shape": "cube|sphere|torus|pyramid|book|cylinder",
 *   "color": "#E0A458",
 *   "wireframe": false,
 *   "spin": 0.5,              // 弧度/秒
 *   "scale": 1,
 *   "camera": { "fov":40, "position":[0,0,7], "lookAt":[0,0,0] }   // 由 config.json 的 shot.camera 覆盖
 * }
 *
 * 动画：p 0→0.22 缩放入场（回弹）→ 持续自转 + 轻微浮动
 */
import { glowTexture, shadowTexture, easeOut, clamp, C } from '/components/_lib/sprites.js';

const SHAPES = {
  cube: (T) => new T.BoxGeometry(2.6, 2.6, 2.6),
  sphere: (T) => new T.SphereGeometry(1.7, 48, 32),
  torus: (T) => new T.TorusGeometry(1.6, 0.52, 24, 72),
  pyramid: (T) => new T.ConeGeometry(1.9, 2.7, 4),
  cylinder: (T) => new T.CylinderGeometry(1.3, 1.3, 2.8, 40),
};

// 莫比乌斯环：单面单边曲面（shape:"mobius"）。three 基础几何没有现成莫比乌斯，
// 手写 BufferGeometry，参数方程:
//   x = (R + v·cos(u/2))·cos(u), y = (R + v·cos(u/2))·sin(u), z = v·sin(u/2)
function mobiusGeometry(T) {
  const R = 1.6, W = 0.55, SEG = 160, RING = 14;
  const pos = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    const u = (i / SEG) * Math.PI * 2;
    for (let j = 0; j <= RING; j++) {
      const v = (j / RING - 0.5) * 2 * W;
      const r = R + v * Math.cos(u / 2);
      pos.push(r * Math.cos(u), r * Math.sin(u), v * Math.sin(u / 2));
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < RING; j++) {
      const a = i * (RING + 1) + j, b = a + RING + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
SHAPES.mobius = (T) => mobiusGeometry(T);

export default {
  id: 'object-3d',
  create({ THREE, group, cfg, theme, view = { halfW: 5.33, halfH: 9.46, aspect: 0.5625 } }) {
    const color = cfg.color || theme.accent || '#E0A458';
    const dim = theme.orbit || '#2E4A5C';
    const light = (theme.mode || '') === 'light';
    const spin = cfg.spin ?? 0.5;
    // 横屏可见宽是竖屏的约 3 倍，物体要相应放大才不被浪费
    const base = (cfg.scale || 1) * (view.aspect > 1 ? 1.75 : 1);
    const wire = !!cfg.wireframe;

    // 受光材质：浅色走哑光（roughness 高、metalness 0），金属冷硬感与"轻松"相斥
    const std = (color, opts = {}) => new THREE.MeshStandardMaterial({
      color: C(color),
      roughness: opts.roughness ?? (light ? 0.7 : 0.44),
      metalness: opts.metalness ?? (light ? 0.0 : 0.45),
      transparent: true,
      opacity: opts.opacity ?? 0.95,
      ...opts.extra,
    });

    const holder = new THREE.Group();
    group.add(holder);

    let mesh;
    if (cfg.shape === 'book') {
      // "典籍"意象：书脊 + 两页
      const spine = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 3.2, 2.2),
        std(dim, { roughness: 0.5, metalness: 0.4, opacity: wire ? 0.5 : 0.9 }),
      );
      const pageGeo = new THREE.BoxGeometry(1.15, 3.0, 2.1);
      const pageMat = std(color, { roughness: 0.55, metalness: 0.25, opacity: 0.62, extra: { wireframe: wire } });
      const pL = new THREE.Mesh(pageGeo, pageMat);
      pL.position.set(-0.75, 0, 0);
      pL.rotation.z = 0.12;
      const pR = new THREE.Mesh(pageGeo, pageMat);
      pR.position.set(0.75, 0, 0);
      pR.rotation.z = -0.12;
      mesh = new THREE.Group();
      mesh.add(spine, pL, pR);
    } else {
      const geo = (SHAPES[cfg.shape] || SHAPES.cube)(THREE);
      const mob = cfg.shape === 'mobius';
      // 莫比乌斯是单面曲面，必须双面渲染，否则转过来一半消失
      mesh = new THREE.Mesh(geo, std(color, { opacity: 0.92, extra: { wireframe: wire, side: mob ? THREE.DoubleSide : THREE.FrontSide } }));
      if (!wire) {
        // 内嵌一个线框，增加"结构感"
        const inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: C(color), wireframe: true, transparent: true, opacity: 0.32,
        }));
        inner.scale.setScalar(1.03);
        mesh.add(inner);
      }
    }
    holder.add(mesh);

    // 底部层次：浅色用"接触阴影"（柔和的深色圆斑），深色用彩色环投影盘
    let disc;
    if (light) {
      disc = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 3.6),
        new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.22, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2 + 0.18;
      disc.position.y = -1.95;
    } else {
      disc = new THREE.Mesh(
        new THREE.RingGeometry(1.5, 2.1, 64),
        new THREE.MeshBasicMaterial({
          color: C(color), transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      disc.rotation.x = -Math.PI / 2 + 0.42;
      disc.position.y = -1.9;
    }
    group.add(disc);

    // 背光：浅色下去除加性辉光（白底上发灰发闷）；深色保留极弱辉光
    const haloOp = light ? 0 : 0.07;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: C(color), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: haloOp,
    }));
    halo.scale.set(4.2, 4.2, 1);
    halo.position.z = -1.5;
    group.add(halo);

    // 各材质基准透明度（供每帧按入场进度缩放）
    const mats = [];
    mesh.traverse((o) => {
      if (o.material && !Array.isArray(o.material)) {
        o.material.transparent = true;
        o.material.userData.base = o.material.opacity ?? 1;
        mats.push(o.material);
      }
    });

    return {
      update(p, tAbs) {
        const raw = clamp(p / 0.22);
        const inE = easeOut(raw);
        // 入场：从 0.55 起步，避免首帧纯黑屏
        const grow = 0.55 + 0.45 * inE;
        const back = 1 + 0.12 * Math.sin(raw * Math.PI) * (1 - inE);
        holder.scale.setScalar(base * grow * back);
        mesh.rotation.y = tAbs * spin + p * 1.2;
        mesh.rotation.x = Math.sin(tAbs * 0.35) * 0.18;
        holder.position.y = Math.sin(tAbs * 0.8) * 0.12;
        disc.material.opacity = (light ? 0.22 : 0.10) * inE;
        halo.material.opacity = haloOp * inE;
        mats.forEach((m) => { m.opacity = m.userData.base * (0.35 + 0.65 * inE); });
      },
    };
  },
};
