/**
 * components/branch-tree —— 分叉树（推演 / 概率 / 分歧 / 分类谱系）
 *
 * 配置:
 * {
 *   "nodes": [ { "x":0, "y":3, "label":"问题", "kind":"root"|"node"|"end", "tag":"50:20" } ],
 *   "edges": [ { "from":0, "to":1 } ],
 *   "highlightEdges": [2, 3],             // 要高亮的边（结论路径）
 *   "accent": "#E0A458"
 * }
 *
 * 坐标约定：x ∈ [-9, 9]，y ∈ [-5, 5]，y 向上。
 * 动画：边按顺序"生长"（0→70%），节点被连到后亮起，末端标签最后淡入。
 */
import { textSprite, glowTexture, growLine, growTube, easeOut, clamp, C } from '/components/_lib/sprites.js';

export default {
  id: 'branch-tree',
  create({ THREE, group, cfg, theme, view = { halfW: 5.33, halfH: 9.46, aspect: 0.5625 } }) {
    const accent = cfg.accent || theme.accent || '#E0A458';
    const ink = theme.ink || '#E8EDF2';
    const dim = theme.dim || '#7C8B99';
    const light = (theme.mode || '') === 'light';
    // 浅色下珊瑚橙小字对比度不足（约 2.5:1），末端文字用"accent 混入 ink 35%"的深珊瑚；
    // 形状/线条仍用原 accent，不动调色板语义
    const accentText = light
      ? '#' + C(accent).lerp(C(ink), 0.35).getHexString()
      : accent;

    const nodes = cfg.nodes || [];
    const edges = cfg.edges || [];
    const hl = new Set(cfg.highlightEdges || []);
    // config 里的 x/y 按竖屏基准写；横屏把 x 拉开（XS=halfW/5.33），y 不变
    const XS = view.halfW / 5.33;
    const V = (i) => new THREE.Vector3(nodes[i].x * XS, nodes[i].y, 0);

    /* --- 边：浅色用粗管（WebGL 细线无效），深色用细线 --- */
    const lineCol = (hot) => hot ? accent : (light ? (theme.orbit || '#C9BCA8') : (theme.dim || '#7C8B99'));
    const lines = edges.map((e, i) => {
      const hot = hl.has(i);
      const line = light
        ? growTube(V(e.from), V(e.to), lineCol(hot), hot ? 0.09 : 0.07, hot ? 0.95 : 0.85)
        : growLine(V(e.from), V(e.to), lineCol(hot), hot ? 0.95 : 0.7, 48);
      group.add(line);
      return { line, hot };
    });

    /* --- 节点 --- */
    const dots = nodes.map((nd, i) => {
      const isEnd = nd.kind === 'end';
      const isRoot = nd.kind === 'root';
      const r = isRoot ? 0.26 : isEnd ? 0.2 : 0.14;
      const col = isEnd ? accent : ink;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(r, 24, 18),
        new THREE.MeshStandardMaterial({
          color: C(col), roughness: light ? 0.7 : 0.3, metalness: light ? 0.0 : 0.7, transparent: true, opacity: 0.2,
        }),
      );
      dot.position.copy(V(i));
      group.add(dot);

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: C(col), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
      }));
      halo.position.copy(V(i));
      halo.scale.set(r * 7, r * 7, 1);
      group.add(halo);

      const label = nd.label ? textSprite(nd.label, {
        color: isEnd ? accentText : ink,
        W: 620, H: 130,
        shadow: !light,
        bold: light,
      }) : null;
      if (label) {
        label.position.set(V(i).x, V(i).y + (isRoot ? view.halfH * 0.065 : isEnd ? view.halfH * 0.053 : -view.halfH * 0.048), 0);
        label.fitWidth(view.halfW * 0.4);
        label.material.opacity = 0;
        group.add(label);
      }
      const tag = nd.tag ? textSprite(nd.tag, { color: dim, W: 320, H: 88, serif: true, shadow: !light }) : null;
      if (tag) {
        tag.position.set(V(i).x, V(i).y - (isEnd ? view.halfH * 0.055 : -view.halfH * 0.082), 0);
        tag.fitWidth(view.halfW * 0.3);
        tag.material.opacity = 0;
        group.add(tag);
      }
      return { dot, halo, label, tag, isEnd, isRoot };
    });

    /* --- 边生长顺序：拓扑序（同一节点的多条出边必须全部入列，
          否则 findIndex 只会取到第一条，第二条永远不显示） --- */
    const indeg = nodes.map(() => 0);
    edges.forEach((e) => { indeg[e.to]++; });
    const edgeOrder = [];
    const seen = new Set(nodes.map((_, i) => i).filter((i) => indeg[i] === 0));
    const queue = [...seen];
    while (queue.length) {
      const u = queue.shift();
      edges.forEach((e, ei) => {
        if (e.from !== u) return;
        edgeOrder.push(ei);
        if (!seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
      });
    }

    const growEnd = 0.68;
    const nE = Math.max(1, edgeOrder.length);

    return {
      update(p) {
        // 边依次生长
        lines.forEach((l, i) => {
          const rank = edgeOrder.indexOf(i);
          if (rank < 0) { l.line.setProgress(0); return; }
          const local = clamp((p - (rank / nE) * growEnd) / (growEnd / nE));
          l.line.setProgress(easeOut(local));
        });

        // 节点：最后一条入边开始画时亮起（不是画完之后，否则末端节点大半时间不亮）
        dots.forEach((d, i) => {
          const inEdges = edges.map((e, ei) => (e.to === i ? ei : -1)).filter((x) => x >= 0);
          let lit = 0;
          if (inEdges.length === 0) lit = clamp(p / 0.12);                 // 根节点
          else {
            const ranks = inEdges.map((ei) => edgeOrder.indexOf(ei)).filter((r) => r >= 0);
            if (ranks.length) {
              const done = clamp((p - (Math.max(...ranks) / nE) * growEnd) / 0.12);
              lit = easeOut(done);
            }
          }
          const age = p - 0.2;
          const breath = d.isEnd && age > 0 ? 0.25 + 0.25 * Math.sin(age * 6) : 0;
          d.dot.material.opacity = (0.2 + 0.8 * lit) * (d.isEnd ? 1 : 0.85);
          d.halo.material.opacity = light ? 0 : lit * (d.isEnd ? 0.4 + breath : 0.1);
          if (d.label) d.label.material.opacity = lit * (d.isEnd ? 1 : (light ? 0.92 : 0.75));
          if (d.tag) d.tag.material.opacity = lit * 0.8;
        });
      },
    };
  },
};
