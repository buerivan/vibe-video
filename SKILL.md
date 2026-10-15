---
name: vibe-video
description: 知识视频生产 agent。输入一个知识点/选题，按七阶段工作流产出「成片 MP4（含 TTS 晓晓配音）+ SRT 字幕 + 封面 + 发布文案」。配音可走 engine/tts.py 自动生成（反向对齐，无长气口），也可交付无声片交剪映。适用于 #vibe知识大赏 类代码渲染知识视频、科普短片、历史知识可视化。
---

# Vibe 知识视频 Agent

把「Vibe Coding 做知识视频」沉淀成可复用流水线。**agent 负责写代码与装配，渲染引擎负责出片，人负责考据终审；配音默认由 engine/tts.py 用晓晓音色自动生成（反向对齐，画面跟随声音），无代理/不想用 TTS 时仍可交付无声片交剪映。**

## 何时用

- 用户要给某个知识点/选题做一条 90–120 秒竖屏知识视频
- 用户提到 #vibe知识大赏 / Vibe Coding 视频 / 代码渲染科普片
- 要把已有文稿/考据转成可视化视频

不适用：需要真人出镜、长视频（>5 分钟）、强剧情的内容。

## 铁律（先读这个）

1. **资料里没有的事实，不许写进片子。** 旁白每个论点都要能在考据稿里指出出处。
2. **旁白先行，画面卡点对齐旁白。** 不许先做画面再凑文案。
3. **一色一义。** 全片 ≤5 色，每色唯一语义；从 `themes/` 选，不随手加色。
4. **不引战。** 不做"你是哪种人"式测试引流、不贴病理标签、不点名批评具体个人。
5. **配音默认 TTS 自动完成（engine/tts.py，晓晓音色，反向对齐画面）。** 跑 tts.py 后真实语音时长写回 `shot.dur`，渲染/字幕/合成全部跟随声音，杜绝人工长气口。无代理或不想用 TTS 时，才交付无声 MP4 + SRT 交剪映。
6. **渲染必须走程序化逐帧**（`engine/shoot.js`），禁止实时录屏。

## 七阶段工作流

### 1. 选题立项 → `scenes/<选题>/storyboard.md`
- 一句话命题 + 四问检验（为什么看/赞/论/转）
- 红线预筛（见铁律 4）
- **不通过就停在起步，别硬做**

### 2. 考据成稿 → 同目录 `facts.md` + 旁白稿
- 旁白 400–500 字（对应 90–120 秒，按 260 字/分钟估）
- **事实清单**：每条事实一行，标注出处（书名/篇名/URL/文件路径）
- 关键数字、年代、人名、术语单独列，标注"AI 不得改写"

### 3. 分镜脚本 → 同目录 `shots.md`
表格：`| # | 时长 | 旁白 | 画面母题 | 组件 | 卡点 |`
- 8–12 镜；每镜一个组件、一句字幕
- 每镜时长 = 该镜旁白字数 / 260 * 60 + 0.4s 呼吸（**初估**；跑 `tts.py` 后会被真实语音时长覆盖）
- 一句一镜，标点天然引导停顿，避免超长流水句（否则单镜语音过久、节奏拖）
- 视觉母题从组件库选（见下表），选不出就规划新组件

### 4. 场景装配 → 同目录 `config.json`
- 从 `themes/` 选一套主题，**整份拷进 config.json 的 `theme` 字段**
- 每镜写 `{ component, dur, caption, config }`
- 需要特殊机位时加 `camera`（3D 特写必须给，否则默认相机太远）
- **config.json 必须是纯 JSON**（serve.js 会剥注释，但别依赖这个）

### 5. 渲染合成（配音先行：TTS 反向对齐）

正确顺序是「先有声音，画面跟随」——这样不会出现人工长气口。
用 `engine/tts.py` 生成每镜语音，把**真实语音时长写回 config.json 的 shot.dur**，
之后的渲染/字幕/合成全部自动对齐：

```bash
# 1) 生成晓晓配音（默认 zh-CN-XiaoxiaoNeural），写回真实 dur
python engine/tts.py --config scenes/<选题>/config.json
#    可选：--voice zh-CN-YunyangNeural 换音色 / --gap 0 去掉镜头间间隔 / --proxy none 关代理

# 2) 渲染（dur 已是真实语音时长，帧数跟随声音）
node engine/serve.js --root scenes/<选题>          # 终端 A
node engine/shoot.js --out output/<选题>            # 终端 B，渲全片

# 3) 字幕（时间轴直接来自真实 dur，无需估算）
node engine/mksrt.js --config scenes/<选题>/config.json --out output/<选题>/subtitles.srt

# 4) 合成：烧字幕 + 混音轨
node engine/encode.js --frames output/<选题> --audio output/<选题>/voice/voice.mp3 \
                      --sub output/<选题>/subtitles.srt --out output/<选题>.mp4
```
- 分段调试/并行：`node engine/shoot.js --from 12 --dur 6 --fps 15`
- 无代理/不想用 TTS 时，跳过第 1 步，交付**无声 MP4 + SRT**，配音在剪映完成（见 `docs/capcut-handoff.md`）
- `config.json` 会被 tts.py 写回真实 dur（原文件自动备份为 `config.before-voice.json`；注意 JSON 注释会丢失）

### 6. 质检（三道闸，不过就回滚）
```bash
node engine/qc/inspect.js output/<选题>      # 像素统计：有内容/在运动/构图出血
node engine/qc/ascii.js output/<选题>/frame_000NN.png   # 字符画目视
```
1. **像素闸**：有内容=true、在运动=true、无"贴边/出血/偏窄"提示
2. **事实闸**：旁白逐字对 `facts.md`，数字/年代/术语一个不改
3. **人审闸**：许鹏抽帧终审（新流程先跑两条再定抽检规则）
- 不合格回滚到对应阶段，不跨阶段返工

### 7. 发布物料
- 封面帧（选一帧导 3:4 竖版）、提问式标题、`#vibe知识大赏` 标签
- 剪映对接（仅当不用 TTS 时）见 `docs/capcut-handoff.md`
- 置顶评论引导 + 合集导流

## 组件库速查

| 组件 | 适用母题 | 关键配置 |
|---|---|---|
| `timeline` | 历史事件推进、纪年、人物生卒 | `events[].year/label/side`、`spanYears`、`highlight[]` |
| `branch-tree` | 推演、概率、分歧、分类谱系 | `nodes[].x/y/label/kind/tag`、`edges`、`highlightEdges[]` |
| `object-3d` | 器物/典籍/天体特写 | `shape`(cube/sphere/torus/pyramid/book/cylinder)、`spin`；**必须给 shot.camera** |
| `particles` | 聚字/散沙/星图 | `mode`(gather/scatter)、`text`、`count` |
| `split-compare` | 两说并置、前后对照 | `left/right{title,items}`、`divider`、`verdict` |

坐标约定：x ∈ [-5, 5]（竖屏水平安全区，超出即出血），y ∈ [-9, 9]。

## 加新组件（沉淀机制）

1. 在 `components/<name>/index.js` 写 `export default { id, create({THREE, group, cfg, theme}) { ... return { update(p, tAbs) } } }`
2. 从 `/components/_lib/sprites.js` 取 `textSprite / growLine / rectLines / panel / glowTexture / 缓动`
3. **update(p, tAbs) 必须是 p 的纯函数**（不得依赖历史帧、不得用 Math.random 驱动动画）
4. 跑通后补 `components/<name>/README.md`（参数表 + 自检项）
5. 只有过了质检的组件才留在库里

## 常用命令

```bash
npm install                                   # 首次（含 ffmpeg-static）
python -m pip install -r engine/requirements.txt   # 语音依赖 edge-tts>=7.3.1
node engine/serve.js --root examples/calculus-priority   # 跑内置示例
python engine/tts.py --config scenes/<选题>/config.json # 生成晓晓配音+写回真实 dur
node engine/shoot.js --fps 15 --out output/demo
node engine/encode.js --frames output/demo --audio output/<选题>/voice/voice.mp3 --fps 15 --out output/demo.mp4
node engine/qc/inspect.js output/demo
node engine/qc/ascii.js output/demo/frame_00001.png 100
```

## 环境要点

- 需要本机 Chrome/Edge（puppeteer-core 不下载浏览器）；可用 `PUPPETEER_EXECUTABLE_PATH` 指定
- ffmpeg 由 `ffmpeg-static` 提供，无需单独装
- **语音（engine/tts.py）依赖 edge-tts>=7.3.1**：该版本起含 v2 GEC token，修复此前 "WSServerHandshakeError: 403" 握手被拒。国内需走代理（默认 `http://127.0.0.1:7897`，即 Clash；`--proxy none` 关闭）
- **Windows + npm 报 `TAR_ENTRY_ERROR ... trash operation`**：见 README「已知问题」
