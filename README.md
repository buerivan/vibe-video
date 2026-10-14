# vibe-video

把知识点变成**代码渲染的知识视频**：agent 写代码装配场景 → 无头浏览器逐帧渲染 → FFmpeg 合成。
交付「无声 MP4 + SRT 字幕」，配音在剪映里用"文本朗读"完成。

零 Python 依赖、零 API key、零云端服务。`git clone && npm i` 就能跑。

```bash
npm install
node engine/serve.js --root examples/calculus-priority   # 终端 A：起服务
node engine/shoot.js --out output/demo                   # 终端 B：渲全片
node engine/encode.js --frames output/demo --out output/demo.mp4
```

打开 http://127.0.0.1:5173 可以直接在浏览器里看（可交互预览，空格暂停不管用，刷新即可）。

## 它解决什么问题

「#vibe知识大赏」那类视频（如《运气的形状》）看上去是视频，底层其实是**网页动画**：
用 GSAP/Three.js 把知识结构写成代码，再一帧帧渲染出来。手搓一条很爽，但第 10 条就会
发现每次都在重写同样的时间轴、分叉树、粒子聚字。

这个 repo 把那些重复劳动收进**组件库**，让"写代码"变成"填配置 + 偶尔写个新组件"。

## 三条核心设计

1. **确定性帧驱动**：画面是时间 `t` 的纯函数（`window.Viz.seek(t)`）。网页实时播放和
   逐帧离屏渲染得到**同一批画面**——不掉帧、不漂移、可重渲单帧、可逐帧质检。
   （实时录屏做不到这些，所以本引擎不用录屏。）
2. **配置驱动 + 组件沉淀**：常见母题（时间轴/分叉树/3D 特写/粒子/双栏对比）填 JSON 即可；
   新母题写新组件，过质检后入库，下次就变成填配置。
3. **agent 不配音**：旁白先行定时间轴（260 字/分钟估算），渲染出无声片 + SRT，
   丢给剪映"文本朗读"。零成本、音色好、语速停顿的最终控制权在人。

## 目录

```
engine/          渲染引擎（serve/shot/encode + qc 质检 + runtime 页面）
components/      组件库（每组件 = index.js + README + 默认配置）
themes/          主题（一色一义 5 色制）
examples/        原创可跑示例
scenes/          你的选题工作区（不进 git）
docs/            七阶段手册 / 剪映对接 / 质检说明
SKILL.md         agent 入口（七阶段工作流 + 红线 + 自检）
```

## 依赖

| 依赖 | 用途 |
|---|---|
| puppeteer-core | 驱本机 Chrome/Edge 逐帧截图（不下载浏览器） |
| three | WebGL 场景 |
| ffmpeg-static | 合成 MP4（自带二进制） |
| pngjs | 质检时解码 PNG |

Node ≥ 18。

## 已知问题

**Windows 下 `npm install` 报 `TAR_ENTRY_ERROR [safe-delete] ... trash operation`**
某些环境（含 WorkBuddy 沙箱）会往 PATH 注入 `safe-bin` 并设 `GENIE_TRASH_DIR`，
导致 npm 移动文件失败、依赖包静默缺文件。绕过：

```bash
export PATH=$(echo "$PATH" | tr ':' '\n' | grep -v 'safe-bin' | paste -sd:)
unset GENIE_TRASH_DIR
npm install
```

**Windows 下 `git fetch` / `git push -u` 报告成功，但 `git status` 显示 `[gone]`**
同一个 `safe-bin` 环境还会拦截 git 新建 `.git/refs/remotes/<remote>/` 嵌套目录：
远端分支确实存在，本地却 `git rev-parse origin/main` 报 unknown revision。
手动回填远程追踪引用即可（不影响远端，只修本地视图）：

```bash
mkdir -p .git/refs/remotes/origin
git ls-remote origin refs/heads/main | cut -f1 > .git/refs/remotes/origin/main
```

## 浏览器

按顺序探测：`PUPPETEER_EXECUTABLE_PATH` → Chrome → Edge（Windows/macOS/Linux 常见路径）。
都没有就设环境变量指向你的浏览器可执行文件。

##  License

MIT
