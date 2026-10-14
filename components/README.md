# 组件库

五个组件 + 一个共享库。每个组件都是 `create({ THREE, group, cfg, theme }) → { update(p, tAbs) }`。

**硬约束**
- `update(p, tAbs)` 必须是 `p` 的纯函数：不得依赖历史帧、不得用 `Math.random()` 驱动动画（随机只能在 create 时用一次）
- 坐标安全区：`x ∈ [-5, 5]`、`y ∈ [-9, 9]`（默认相机 z=26 / fov=40 下水平可见约 10.7、垂直约 18.9 世界单位）；**超出即出血**
- 从 `/components/_lib/sprites.js` 取 `textSprite / growLine / rectLines / panel / glowTexture / 缓动`

## 参数速查

| 组件 | 关键配置 |
|---|---|
| `timeline` | `spanYears`、`events[].year/label/side`、`highlight[]`、`axisHalf`(默认4.8)、`sideY`(默认3.5) |
| `branch-tree` | `nodes[].x/y/label/kind(root/node/end)/tag`、`edges[].from/to`、`highlightEdges[]` |
| `object-3d` | `shape`(cube/sphere/torus/pyramid/book/cylinder)、`color`、`spin`、`scale`、`wireframe`；**必须给 shot.camera（默认 z=11.5）** |
| `particles` | `mode`(gather/scatter)、`text`、`count`(默认1400)、`size`(默认0.14)、`spread` |
| `split-compare` | `left/right{title,items}`、`divider`、`verdict`、`leftColor`、`rightColor` |

## 双比例适配（竖屏 9:16 / 横屏 16:9）

组件尺寸**必须**按 `view.halfW / view.halfH`（当前相机可见半宽/半高，世界单位）比例表达，不能写死世界尺寸——横屏可见宽约是竖屏的 3 倍（16.8 vs 5.33），写死的组件换比例必出血或缩成一团。

`create({ THREE, group, cfg, theme, view })` 里 `view = { halfW, halfH, aspect }`，由 scene.js 按该镜相机自动算好传入。常见换算：
- 主轴/横幅宽：`view.halfW * 0.86`
- 纵向分层：`view.halfH * 0.36`
- 文字宽：`view.halfW * 0.4 ~ 0.52`
- 横屏分支：`const wide = view.aspect > 1`
- `branch-tree` 的 `nodes[].x/y` 按竖屏基准写即可，组件内部乘 `XS = view.halfW / 5.33` 横向拉开

## 画质层（引擎统一处理，组件不用管）

- **背景**：scene.js 用 canvas 生成径向渐变纹理做 `scene.background`（中心微亮 → 四周沉下去），不是纯色
- **Bloom**：EffectComposer + UnrealBloomPass（strength 0.26 / radius 0.42 / threshold 0.78）。**参数别贪**——strength 上到 0.4+ 会把主体轮廓淹在光晕里
- **暗角**：`#vignette` 层用 CSS radial-gradient 压四角，把视线收到中央
- **注意**：组件自带的辉光 sprite 与 Bloom 会叠加，所以 sprite 的 opacity 要压到 0.1 以下（object-3d 的 halo 已从 0.14 调到 0.07）

## 已知坑（都实际踩过，改组件时注意）

1. **`branch-tree` 的边序不能用 `findIndex` 求**：同一节点的多条出边只会取到第一条，第二条永远不显示。必须边遍历边 push（见 index.js 里的拓扑序实现）。
2. **`branch-tree` 末端节点亮起阈值**：不要用 `(maxRank + 1) / nE * growEnd`，会把末端节点的点亮推到 growEnd 之后，大半时间不亮。用 `maxRank / nE * growEnd`。
3. **文字精灵不要手动传 `px`**：`textSprite` 默认按画布高度 60% 定字号。手动传小 px 会让标签在 1080p 画面上只有 20–30px，小到看不清。
4. **`particles` 的目标点必须三分量齐全**：少 push 一个分量就是 `undefined → NaN`，NaN 会让对象被视锥剔除、**整个镜头静默消失**。用 `window.Viz.findNaN()` 可枚举定位。
5. **`particles` 的字号要按字数自适应**：固定 300px 画 3 个字会被 canvas 裁掉两边。
6. **`object-3d` 的 halo 宁小勿大**：加性混合的辉光 scale 一旦接近画面尺寸，整片会发灰发闷（曾用 9×9 把全屏底色抬成雾）。控制在 4×4 左右、opacity ≤ 0.15。
7. **竖屏里圆环/双栏必出血**：正圆水平直径 = 2R，默认相机下超过 10.7 就出画。要么倾斜（绕 Y 轴）、要么收窄、要么拉远相机。
8. **模块级函数访问不到 `view`**：`particles` 的 `sampleText()` 定义在模块作用域，`create()` 里却用了 `view`，直接 ReferenceError 整页白屏。模块级函数要把 `view` 当参数传进去。
9. **浅色模式（`theme.mode:"light"`）下 `textSprite` 必须 `shadow:false, bold:true`**：默认深色投影在浅底糊成灰团、sans 细字在浅底发灰；强调色小字改用 accent 混 ink 的深色变体（原 accent 对比度不够）。branch-tree 已适配，其余组件推全片时同样处理。粗线要用 `_lib` 的 `growTube`（WebGL 细线无法加粗）。
