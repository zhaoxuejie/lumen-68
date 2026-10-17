# LUMEN 68 — 团队协作契约

> 项目：原创紧凑机械键盘 **LUMEN 68 / 光屿** 的交互式 3D 产品展示与配置页面。
> 技术栈：Vite + 原生 ES Modules + Three.js（Canvas 只画 3D 产品，界面全部由 DOM/CSS 构成）。
> 工作区：`D:\projectDsh\moqian-3d-key`。依赖已由 Lead 安装完毕，**不要执行 `npm install`**。

本文件是 Lead 与队友之间的共享契约。开始写代码前先完整阅读本文件与 `docs/TEST-API.md`。
任何会破坏下列契约的改动，先发消息给 Lead 确认。

---

## 1. 产品叙事与文案基调

- 品牌：**LUMEN**（虚构原创品牌），系列名 **光屿 LUMEN 68**。
- 产品：68 键紧凑布局机械键盘，CNC 铝合金一体底壳、Gasket 结构、热插拔轴座、PBT 键帽。
- 英文主标题：`LUMEN 68`；中文副标题：`光屿 · 68 键机械键盘`。
- 首屏一句话介绍（可直接用）：
  > 把一束光，收进 68 次敲击。CNC 铝合金机身与 Gasket 悬浮结构，为桌面留出呼吸的空间。
- 参数标签（chips）：`68 KEYS / 紧凑布局`、`CNC ALUMINUM / 铝合金`、`GASKET / 悬浮结构`、`HOT-SWAP / 热插拔`（至少 3 个）。
- 页面语言以简体中文为主，微标签用英文大写 + 字距，形成消费电子质感。
- 语气：克制、安静、有光泽感；不要游戏电竞风（无 RGB 彩虹、无夸张描边）。

## 2. 视觉方向

"暖色摄影棚里的高端产品页"：近黑暖色背景、柔光光晕、玻璃质感配置面板、克制的铜金强调色。
同一套视觉语言贯穿：排版、色板、圆角、发丝线、按钮、3D 灯光。

推荐设计变量（可微调，但必须统一）：

```css
--bg: #0b0a09;
--bg-raise: #12100e;
--ink: #f2ede4;
--ink-dim: rgba(242, 237, 228, 0.64);
--ink-mute: rgba(242, 237, 228, 0.42);
--line: rgba(242, 237, 228, 0.12);
--line-strong: rgba(242, 237, 228, 0.2);
--accent: #d59a6a;
--accent-strong: #ecb98a;
--panel: rgba(24, 22, 20, 0.66);
--radius-xl: 24px;
--radius-lg: 18px;
--radius-md: 12px;
```

- 字体：只用系统字体（**禁止任何外链字体/图片/网络请求**，最终要打包成单文件）：
  - 展示字体栈：`"Segoe UI Variable Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif`
  - 等宽字体栈：`"SFMono-Regular", Consolas, "Cascadia Mono", "Liberation Mono", monospace`
- 背景：深暖黑 + 2~3 处柔和径向光（暖铜色，低透明）+ 极淡噪点（inline SVG feTurbulence data URI 或 CSS 渐变实现），不要影响文字可读性。
- 面板：`backdrop-filter: blur(20px) saturate(1.15)`，1px 内描边高光，柔和投影；按钮/选项 hover 有微妙反光。
- 过渡：150–400ms，`cubic-bezier(.22,.61,.36,1)`；尊重 `prefers-reduced-motion`。

## 3. 布局（首屏必须一次呈现完整产品与主要配置控件）

桌面（≥ 1100px，目标 1440×900 / 1280×800 **不出现纵向滚动**）：

```
.app-shell            100svh，flex column，左右 padding clamp(22px, 2.8vw, 48px)
├─ .site-header       高 ~74px：左 LUMEN 品牌字标 + STUDIO 小字；右概念徽章 / 状态
├─ .showcase          flex:1 min-height:0；grid：左 stage 自适应 + 右面板 clamp(318px, 24vw, 366px)
│  ├─ .stage          flex column min-height:0 position:relative
│  │  ├─ .hero        紧凑（~150–190px 高）；标题 + 简介 + chips；可左右两栏排布
│  │  ├─ #viewport    flex:1 min-height:0；3D canvas 由 JS 注入并绝对定位铺满
│  │  ├─ .viewport-toolbar  绝对定位于 viewport 左下：复位视角 / 自动展示
│  │  └─ #experience-hint   绝对定位 viewport 底部居中（默认隐藏）
│  └─ .panel         配置面板，贴右侧，min-height 撑满 showcase；内容过多时面板内部滚动
└─ .site-footer       高 ~46px：左侧操作提示 · 中间 #key-echo · 右侧署名/本机保存说明
```

- `#viewport` 必须有明确的可测高度（flex:1 + min-height:0）。canvas 由 Lead 的代码插入，class 为 `scene-canvas`；UI 只负责容器与叠层。不要给 `#viewport` 设 `overflow:hidden` 以外的裁剪影响。
- `.hero` 不覆盖 3D 键盘；键盘完整出现在 `#viewport` 内。
- 平板/窄屏（< 1100px）：单列。header → 紧凑 hero → `#viewport`（高度 `clamp(300px, 44svh, 460px)`）→ panel（完整可滚动）→ footer。移动端 390×844 下首屏至少看到产品名、完整键盘和面板起始部分。
- 面板内容顺序（自上而下）：
  1. 面板标题 `配置你的 LUMEN 68` + `CONFIGURE / 01` 微标签
  2. 外壳 · CASE FINISH：3 个横向选项卡（由 `CASES` 生成）
  3. 键帽 · KEYCAP SET：3 个横向选项卡（由 `KEYCAPS` 生成，用三色 mini keycap 展示色板）
  4. 配置摘要 · YOUR BUILD：配置名、外壳、键帽（含材质/工艺），以及"已保存"状态
  5. 主按钮：`拆解视图` / `组装还原`（id 见 §5，点击由 3D 逻辑监听）
  6. 键帽体验开关（自定义 switch）+ 提示文字
  7. 配置命名 input + 辅助说明
  8. 次级操作：复位视角、恢复默认（克制样式，`恢复默认` 需很轻的确认感但不弹窗，点击即恢复并 toast）
- 配置面板中的主要控件必须在首屏可见；内容高度不足时允许面板内部滚动。

## 4. 文件所有权（严格遵守，不要改动别人的文件）

| 所有者 | 文件 |
| --- | --- |
| **Lead** | `package.json`、`vite.config.mjs`、`src/main.js`、`src/state.js`、`src/bus.js`、`src/scene/**`、`scripts/**`、`README.md`、`LUMEN-68.html`、`docs/**` |
| **ui-designer** | `index.html`、`src/ui/**`、`src/styles/**` |
| **qa-verifier** | `verify/**`、`VERIFICATION.md` |

- 依赖已安装：`three`、`vite`、`playwright-core` 均在 `node_modules`。**不要执行 `npm install` / `npm run build`**（构建由 Lead 统一执行）。
- 开发服务器由 Lead 在 `http://127.0.0.1:5173` 启动；QA 只访问，不另起服务。
- 需要修改别人文件时，发消息给 Lead 说明原因，由所有者修改。

## 5. DOM 契约（双方共同依赖，UI 必须提供）

`index.html` 是唯一 HTML 入口，`<script type="module" src="/src/main.js"></script>`。
`src/main.js` 会 `import { mountUI } from './ui/panel.js'` 并调用 `mountUI()`（无参数），然后初始化 Three.js。
UI 侧 `src/ui/panel.js` 必须 `export function mountUI()`。

必须存在的节点与职责：

| 选择器 | 由谁创建 | 契约 |
| --- | --- | --- |
| `#viewport` | UI | 3D 容器；Lead 插入 `<canvas class="scene-canvas">`，绝对定位铺满 |
| `#layer-labels` | UI（放在 `#viewport` 内） | Lead 注入 3 个 `.layer-label`（`data-layer="caps" / "plate" / "case"`），负责用 `transform: translate3d()` 定位与透明度；容器 `pointer-events:none`、`overflow:visible` |
| `#btn-explode` | UI | 主按钮，`type="button"`，`aria-pressed="false"`；Label 在 `#btn-explode-label` 内。点击监听由 Lead 绑定 |
| `#btn-reset-view` | UI | 复位视角按钮，Lead 绑定 |
| `#toggle-autorotate` | UI | 自动旋转 checkbox，Lead 绑定 |
| `#toggle-experience` | UI | 键帽体验 checkbox，Lead 绑定 change |
| `#experience-status` | UI | Lead 更新文案（开启/关闭说明），UI 负责样式 |
| `#experience-hint` | UI | Lead 控制 `hidden` 属性与文案 |
| `#key-echo` | UI | 页脚按键回显，Lead 写 `textContent` 并切换 `.is-active` 类 |
| `#case-options` | UI | 内部 3 个按钮：`button[data-case="lunar|obsidian|copper"]`，`aria-pressed` 表示选中，`.is-selected` 同步 |
| `#keycap-options` | UI | 内部 3 个按钮：`button[data-keycap="alabaster|graphite|harvest"]`，同上 |
| `#profile-name` | UI | `input`，`maxlength="24"`，受控于 store；Lead 不绑定 |
| `#summary-name` `#summary-case` `#summary-keycap` `#summary-case-meta` `#summary-keycap-meta` | UI | Lead 不修改，UI 从 store 派生 |
| `#save-status` | UI | Lead 不修改，UI 根据 store 事件显示保存状态 |
| `#btn-restore` | UI | 点击调用 `restoreDefaults()`，UI 自己 toast，Lead 不绑定 |
| `#toast` | UI | `role="status" aria-live="polite"`；监听 `lumen:toast` 事件显示消息 |
| `.site-header` `.hero` `.panel` `.viewport-toolbar` `.site-footer` 等 | UI | 结构、样式自由，但上述 ID 与语义必须保留 |

`document.body` 会被 Lead 设置这些状态属性，UI 可据此写样式：

- `data-app-ready="true"`：首帧渲染完成（可用于 fade-in）
- `data-experience="on" | "off"`
- `data-exploded="open" | "closed"`
- `data-case="lunar|obsidian|copper"`（可选使用）

## 6. 状态模块（Lead 已实现，UI 直接 import）

`src/state.js` 导出：

```js
STORAGE_KEY, CASES, KEYCAPS, DEFAULT_CONFIG, PROFILE_NAME_MAX
getConfig() -> { caseId, keycapId, profileName }
getCase(), getKeycap(), caseById(id), keycapById(id)
getDisplayName() -> string            // 空名字时返回 "未命名配置"
isDefaultConfig(), hasSavedConfig(), isStorageAvailable()
subscribe(listener) -> unsubscribe    // listener(config, detail)
setCase(id), setKeycap(id), setProfileName(name), restoreDefaults()
announceInitial()                     // UI 绑定完监听后调用一次
```

`detail = { reason: 'case'|'keycap'|'name'|'restore'|'init', saved: boolean, config, displayName, isDefault }`。
`restoreDefaults()` 只 `removeItem(STORAGE_KEY)`，绝不 `localStorage.clear()`。
数据里的配色（`caseColor`、`colors.alpha` 等）是 3D 材质与 UI 色板的共同来源。

## 7. 事件

- `lumen:toast`：`{ message: string, tone?: 'default'|'success'|'error' }`，由 Lead 发出（例如复位视角、体验模式切换提示）；UI 监听 `#toast` 展示。
- UI 自己触发恢复默认 toast 时可直接调用内部 toast 函数，也可 `emit('lumen:toast', ...)`。

## 8. 交互与验收（UI 负责的部分）

1. 三种外壳 × 三种键帽可任意组合；点击任意组合后：选项选中态、配置摘要、3D 预览同步更新；选项名/工艺/色板全部来自 `state.js`，不得硬编码颜色文案。
2. `拆解视图` 按钮文案由 Lead 更新（`#btn-explode-label`），UI 保证按钮内布局不因文字变化而跳动（固定宽度/居中/图标与文字间距）。
3. 键帽体验 checkbox 默认关闭；关闭时不拦截任何键盘输入。
4. `#profile-name` 获得焦点时正常输入；输入同步 store 并保存；清空时摘要显示"未命名配置"。
5. 恢复默认：清除本页配置（外壳/键帽/名称），并 toast 提示；不影响其他 localStorage。
6. `#save-status`：保存成功显示类似 `已自动保存 · 本机`；存储不可用时显示 `仅本次会话`。
7. 可访问性：所有可点击元素是 `button`（选项用 `aria-pressed`）；开关用原生 checkbox 并有关联 label；焦点环清晰；toast 有 aria-live；图标加 `aria-hidden="true"`。
8. 不产生任何网络请求（无外链字体/图片/CDN）。所有图标用 inline SVG。
9. 高 DPI 下文字与描边清晰；`index.html` 的 `<title>` 为 `LUMEN 68 · 光屿 — 68 键机械键盘`；提供 inline SVG favicon（data URI）。
10. 1440×900 与 1280×800 下：页面无纵向滚动，`LUMEN 68` 标题、完整 3D 键盘区域、拆解/体验/配色控件都在首屏内。
11. 390×844 移动端：无横向滚动，3D 键盘完整显示，面板可滚动。

## 9. 本地命令

```powershell
npm run dev        # http://127.0.0.1:5173   （Lead 启动，其他人不要重复启动）
npm run build      # 仅 Lead
```

## 10. 沟通

- 完成关键里程碑、需要对方配合、发现契约冲突时，用消息通知 Lead（`send_message`），内容要包含：已完成什么、验证方式、下一步/阻塞点。
- 不要修改不属于自己的文件；不要把半成品状态当完成上报。
- 若 Lead 文件尚未就绪（例如 `src/state.js` 缺失），先等待或先做不依赖它的工作，并告知 Lead。
