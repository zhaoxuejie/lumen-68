# LUMEN 68 / 光屿 — 自动化验证报告（VERIFICATION）

> 验证执行者：qa-verifier（Agent Teams）
> 验证对象：LUMEN 68 交互式 3D 产品展示页（dev server `http://127.0.0.1:5173/`）与单文件 `LUMEN-68.html`
> 验收依据：`docs/CONTRACT.md`、`docs/TEST-API.md`
> 本文件只记录**实际执行过**的验证与命令输出；未执行项在 §9 明确列为“未验证”。

> **最终结论（源码冻结后两轮，均为 PASS）**
> - Dev 页面：**48 PASS / 0 FAIL / 0 SKIP**（+1 条 INFO 测量明细），53.6s
> - 单文件 `LUMEN-68.html`：**48 PASS / 0 FAIL / 0 SKIP**，58.3s
> - 两轮 console error / pageerror / 失败请求 / 外部网络请求均为 **0**；HMR 重载为 0
> - 视觉复审：**0 blocker / 0 major / 0 待修复 minor**（此前 4 条 minor 已全部修复并复验）

---

## 1. 结论摘要

| 验证对象 | 结果 | 用时 | 运行时间（本地） |
| --- | --- | --- | --- |
| Dev 页面（`http://127.0.0.1:5173/`） | **PASS：48 PASS / 0 FAIL / 0 SKIP**（另有 1 条 INFO 测量明细） | 53.6s | 2026-10-17 21:29:25 – 21:30:19 |
| 单文件 `LUMEN-68.html`（`file:///D:/projectDsh/moqian-3d-key/LUMEN-68.html`） | **PASS：48 PASS / 0 FAIL / 0 SKIP** | 58.3s | 2026-10-17 21:30:23 – 21:31:22 |
| Harness 自测（`verify/fixtures/mock.html`，**不是产品页**） | 45 PASS / 0 FAIL | 60.6s | 仅用于真实页面就绪前校验 harness 自身，不计入产品验收 |

两轮正式运行均为：**console error = 0、console warning = 0、pageerror = 0、失败请求 = 0、外部网络请求 = 0**。
两次运行主框架导航均为 5 次（初始 1 + 用例主动 reload 4），**无 Vite HMR 额外重载**。

---

## 2. 验证环境（实测）

| 项目 | 值 |
| --- | --- |
| OS / Shell | Windows（PowerShell 5.1） |
| Node.js | v22.23.0 |
| playwright-core | 1.64.1（随项目安装，未执行 `npm install`） |
| 浏览器 | Microsoft Edge `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，版本 **153.0.4234.48**，headless |
| WebGL 后端 | **硬件 GPU**：`ANGLE (Intel, Intel(R) UHD Graphics (0x00009B41) Direct3D11 vs_5_0 ps_5_0, D3D11)`，实测页面约 50–61 FPS |
| 备用后端（已测但未用于正式报告） | SwiftShader 软件 WebGL2 可用但仅约 **1 FPS**（加载 24s、截图 5s），故默认使用硬件 GPU；可用 `LUMEN_GL=swiftshader` 强制 |
| 视口 | 1440×900、1280×800、390×844；deviceScaleFactor=1；locale zh-CN；timezone Asia/Shanghai |
| 运行日期 | 2026-10-17 |

环境自检（`node verify/smoke.mjs`）：Edge headless 启动、WebGL2 可用、`file://` 本地 HTML 可加载、截图可写，四项全通过。

---

## 3. 运行命令与产物

```powershell
# Dev 全量验证（默认硬件 GPU）
node verify/run.mjs

# 单文件验收：截图前缀 08-standalone-，不覆盖 dev 截图
$env:LUMEN_URL = 'file:///D:/projectDsh/moqian-3d-key/LUMEN-68.html'
$env:LUMEN_SHOT_PREFIX = '08-standalone-'
node verify/run.mjs

# 可选环境变量
#   LUMEN_GL=auto|d3d11|swiftshader   渲染后端（默认 auto=硬件 GPU）
#   LUMEN_EDGE=<path>                 浏览器路径
#   LUMEN_URL=<url>                   目标页面（默认 http://127.0.0.1:5173/）
#   LUMEN_SHOT_PREFIX=<prefix>        截图文件名前缀
#   LUMEN_WATCHDOG_MS=<ms>            套件看门狗（默认 15 分钟）
```

产物：

| 产物 | 路径 | 说明 |
| --- | --- | --- |
| Dev 机器可读报告 | `verify/last-run-dev.json` | 48 PASS，含每项耗时、console/网络、截图元数据、层标签测量明细 |
| 单文件机器可读报告 | `verify/last-run-standalone.json` | 48 PASS，mode=file |
| 截图 | `verify/shots/*.png` | dev `01–07` + 拆解/对比度附加图；单文件 `08-standalone-*` |
| Harness 自测报告 | `verify/last-run.json`（最近一次运行覆盖） | 当前为单文件运行 |
| 辅助脚本 | `verify/smoke.mjs`、`verify/probe.mjs`、`verify/diag-demo.mjs`、`verify/check-mobile-labels.mjs`、`verify/fixtures/mock.html`、`verify/analyze_shots.py`、`verify/compare_runs.py` | 环境自检 / 性能探针 / 历史缺陷诊断 / 移动端专项 / harness 自测 mock / 像素与对比度分析 |

> 验证期间未修改任何应用源码；仅写入 `verify/**` 与 `VERIFICATION.md`。

---

## 4. Dev 页面逐项结果（48 PASS + 1 INFO）

测试脚本：`verify/run.mjs`；报告：`verify/last-run-dev.json`。

| # | 结果 | 用例 | 耗时(s) |
| --- | --- | --- | --- |
| 1 | PASS | 初始加载：页面可访问，window.__LUMEN_READY__ === true | 0.04 |
| 2 | PASS | 初始加载：无 console error / pageerror | 0.33 |
| 3 | PASS | 测试 API 契约：方法齐全 / storageKey / version | 0.02 |
| 4 | PASS | 场景信息：66 键 / WebGL / canvas 尺寸 / 层标签 | 0.03 |
| 5 | PASS | 初始状态为默认配置（lunar/alabaster） | 0.04 |
| 6 | PASS | DOM 契约：必需节点、属性、内联 favicon | 0.02 |
| 7 | PASS | 初始桌面截图 1440×900 | 1.4 |
| 8 | PASS | 布局 1440×900：无纵向滚动，标题/视口/主要控件在首屏 | 0.04 |
| 9 | PASS | 配色组合 lunar + alabaster：3D/选项/摘要/存储同步 | 0.40 |
| 10 | PASS | 配色组合 lunar + graphite：3D/选项/摘要/存储同步 | 1.2 |
| 11 | PASS | 配色组合 lunar + harvest：3D/选项/摘要/存储同步 | 2.2 |
| 12 | PASS | 配色组合 obsidian + alabaster：3D/选项/摘要/存储同步 | 0.84 |
| 13 | PASS | 配色组合 obsidian + graphite：3D/选项/摘要/存储同步 | 1.9 |
| 14 | PASS | 配色组合 obsidian + harvest：3D/选项/摘要/存储同步 | 0.89 |
| 15 | PASS | 配色组合 copper + alabaster：3D/选项/摘要/存储同步 | 1.7 |
| 16 | PASS | 配色组合 copper + graphite：3D/选项/摘要/存储同步 | 0.84 |
| 17 | PASS | 配色组合 copper + harvest：3D/选项/摘要/存储同步 | 0.86 |
| 18 | PASS | 重复点击已选外壳不产生状态变化 | 0.20 |
| 19 | PASS | 拆解：点击后 layers.caps > layers.plate > 0，按钮/标签/body 状态正确 | 1.3 |
| 20 | PASS | 拆解截图 | 0.97 |
| 21 | PASS | 组装：回到 0，标签隐藏，按钮文案恢复 | 1.3 |
| 22 | PASS | 快速连续点击 11 次：whenSettled 后目标与进度一致（open） | 1.3 |
| 23 | PASS | 再点击 1 次（共 12 次）：whenSettled 后回到 closed，进度误差 < 0.001 | 1.3 |
| 24 | PASS | 体验模式：默认关闭时物理按键不产生按压 | 0.20 |
| 25 | PASS | 体验模式：开启后开关/状态/提示联动 | 0.08 |
| 26 | PASS | 体验模式：物理按住 A 键键帽下压，释放后回落 | 0.21 |
| 27 | PASS | 体验模式：空格键触发且页面不滚动 | 0.17 |
| 28 | PASS | 体验模式：pressVirtual/releaseVirtual 与物理路径等效 | 0.19 |
| 29 | PASS | 体验模式：用 getKey().screen 坐标鼠标点击 KeyF 触发 | 0.37 |
| 30 | PASS | 体验模式：输入框聚焦键入不触发键帽、文本正常、页面不滚动 | 1.0 |
| 31 | PASS | 命名清空：摘要显示“未命名配置” | 0.10 |
| 32 | PASS | 体验模式：关闭后物理按键不再触发 | 0.27 |
| 33 | PASS | 视角：自动旋转开关存在且默认关闭（相机测试前置） | 0.02 |
| 34 | PASS | 视角：canvas 拖拽后相机 position 变化 | 0.77 |
| 35 | PASS | 视角：滚轮改变相机距离 | 0.62 |
| 36 | PASS | 视角：点击 #btn-reset-view 回到初始相机（容差已注明） | 1.1 |
| 37 | PASS | 持久化前置：清空存储并 reload 回到默认 | 0.63 |
| 38 | PASS | 持久化：设置铜色 + 麦田 + 命名，reload 后状态与摘要恢复 | 2.2 |
| 39 | PASS | 持久化：恢复默认只移除本页 key，保留其它 localStorage，刷新后为默认 | 1.6 |
| 40 | PASS | 命名 maxlength=24：键盘输入超长文本被截断 | 2.0 |
| 41 | PASS | 布局 1280×800：无滚动，标题/视口/主要控件在首屏 | 1.3 |
| 42 | PASS | 移动端 390×844：无横向滚动，键盘在视口内，面板起始可见 | 1.1 |
| 43 | PASS | 拆解态层标签 1440x900：在 #viewport 内、不遮工具条、不压产品 | 3.5 |
| 44 | PASS | 拆解态层标签 1280x800：在 #viewport 内、不遮工具条、不压产品 | 4.4 |
| 45 | PASS | 拆解态层标签 390x844：在 #viewport 内、不遮工具条、不压产品 | 3.8 |
| 46 | INFO | 拆解态层标签详细测量（按 viewport，见 §7） | — |
| 47 | PASS | 网络：除本机 dev server 外无任何外部请求 | 0.02 |
| 48 | PASS | 全程无 console error / pageerror / 失败请求 | 0.41 |
| 49 | PASS | 测试期间页面未被额外重载（HMR 稳定性） | 0.01 |

**关键断言取值（dev 最终实测）**

- `getSceneInfo()`：`renderer=webgl2`、`keyCount=66`、`rows=[15,15,14,13,9]`（合计 66）、canvas 982×586。
- 初始相机 `distance=22.66`、`target=[0,1.15,0]`；拖拽后 position 位移 27.08（阈值 0.227）；滚轮 22.66 → 19.034；复位后 position/target 偏差 0/0（容差 = max(0.02, 初始距离×1%) = 0.227）。
- 拆解：`layers={caps:3, plate:1.35, case_:0}`；11 次快速点击后 `progress=1`、按钮文案“组装还原”；第 12 次点击后 `progress=0`、layers 全部归零、文案“拆解视图”。
- 体验模式：按住 A 实测 `press=0.322`（0..1 clamp 内）、`offset=-0.051`（负值=下压）、`#key-echo="A"`；空格 `press=0.125` 且 `scrollY=0`；`pressVirtual`/`releaseVirtual` 生效；`getKey('KeyF').screen=(409.4, 499.5)` 鼠标点按触发；输入框聚焦键入 `hello keyboard` 时采样最大 press=0、文本与 store 同步、`scrollY=0`。
- 9 种配色 `getRenderTheme()` 真实材质色与 `src/state.js` 数据**逐项相等**（例：lunar case `#b3b8be`、copper case `#a26a49`、harvest capAlpha `#d9ceb4`、graphite capAccent `#c9a35f`）。
- 持久化：reload 后恢复 copper/harvest/“QA BUILD 68”；`#btn-restore` 后 `lumen68.config.v1` 被移除、预埋 `qa.sentinel.1/2` 保留、toast 出现、刷新回默认；`maxlength=24` 生效。
- 布局：1440×900 与 1280×800 无纵向滚动，`panelOverflow=0`（面板无内部溢出）、`.panel-bottom` 位于面板底部 ≤24px、主要控件均在首屏；390×844 横向溢出 0，`#viewport` 高 304px，采样键 5/5 inView，面板起始可见。

---

## 5. 单文件 `LUMEN-68.html` 专项验收（48 PASS）

| 项目 | 实测结果 |
| --- | --- |
| 文件 | `D:\projectDsh\moqian-3d-key\LUMEN-68.html`，**585,338 bytes**，mtime **2026-10-17 21:28:30**（与冻结源码同批构建） |
| SHA-256 | **`583C2093BEFFCA7A6BD1EFA3E28642EA4F289F3FC71C5DF53FF07A59742F8028`** |
| 自包含检查 | 内联 `<script type="module">`；无 `script src`；唯一 `link` 为 data URI favicon；全文 3 处 `http://` 均为 inline SVG / XHTML 命名空间（`http://www.w3.org/...`），**非网络请求**；15 处 data URI |
| 请求审计 | 全程 **5 个请求全部为 `file://`**（页面本体 + 用例内 reload），**外部 http(s) 请求 = 0** |
| ready / 场景 | `__LUMEN_READY__ === true`、WebGL2、66 键、rows 合计 66、无 console error / pageerror |
| 核心交互抽测 | 9 种配色（含 renderTheme 真实材质色）、拆解/组装/快速连点、体验模式（物理 A/空格、virtual、鼠标点键帽、输入框焦点保护）、相机拖拽/滚轮/复位、恢复默认与 localStorage 隔离 —— **与 dev 完全一致通过** |
| file:// 持久化 | 本机 Edge 153 允许 `file://` 使用 localStorage：设置 copper/harvest/QA BUILD 68 后 reload 正常恢复；恢复默认仅移除本页 key、预埋 key 保留、刷新回默认（`storageAvailable=true`） |
| 布局 | 1440/1280 `panelOverflow=0`、无滚动；390×844 `#viewport` 高 304px、无横向滚动、拆解标签单行图例 |
| 截图 | `verify/shots/08-standalone-*.png`（01–07 + 02b/02c/02d/02e） |

单文件执行的是与 dev 相同的 48 项用例，结果**逐项全部 PASS**（耗时见 `verify/last-run-standalone.json`，其中截图项约 1.5s/张、持久化 reload 项 2.1–2.4s）。

**单文件 vs dev 截图逐像素对比**（同视口、同机、同 GPU，脚本 `verify/compare_runs.py`）：

| 对比图 | 平均绝对差(0–255) | 差异>8 的像素占比 |
| --- | --- | --- |
| 01 initial 1440×900 | 0.002 | 0.017% |
| 02 exploded 1440×900 | 0.019 | 0.040% |
| 03 obsidian+graphite | 0.001 | 0.002% |
| 04 lunar+harvest | 0.002 | 0.002% |
| 05 copper+alabaster | 0.003 | 0.020% |
| 06 mobile 390×844 | 0.001 | 0.005% |
| 07 desktop 1280×800 | 0.065 | 0.016% |

结论：单文件渲染与 dev 页面**视觉一致**（差异来自动画/时间相位，无功能或样式缺失）。

---

## 6. Console / 网络证据

| 指标 | Dev 页面 | 单文件 |
| --- | --- | --- |
| console.error | **0** | **0** |
| console.warning | **0** | **0** |
| pageerror | **0** | **0** |
| 请求失败 | **0** | **0** |
| 总请求数 | 90（全部 `127.0.0.1` dev server / 内联） | 5（全部 `file://`） |
| 外部 http(s) 请求 | **0** | **0** |
| 外链 DOM 资源 | 0 | 0 |
| 主框架导航次数 | 5（初始 1 + 用例主动 reload 4，无 HMR 重载） | 5（同上） |

> 开发期间曾出现 HMR 重载干扰（源码被并行修改），最终两轮均在冻结源码下执行，无额外重载。

---

## 7. 拆解态层标签专项测量（dev 最终实测）

| 视口 | #viewport | 标签 | 工具条重叠 | 产品投影重叠 |
| --- | --- | --- | --- | --- |
| 1440×900 | (40.3, 266.2)–(1023.9, 854) | 左侧竖排：`01 · 键帽 / KEYCAPS`、`02 · 定位板 / PLATE`、`03 · 底壳 / CASE`，opacity 0.96 | 0 px² | caps 0% / plate 0% / case 0% |
| 1280×800 | (35.8, 252.9)–(899.3, 754) | 同上（与各层投影高度对齐） | 0 px² | 0% / 0% / 0% |
| 390×844 | (16, 269.7)–(374, 573.5) | 顶部单行紧凑图例：`01 · 键帽 ｜ 02 · 定位板 ｜ 03 · 底壳`（同一 y=293.3、高 22.75） | 0 px² | 0% / 0% / 0% |

拆解态主按钮对比度（crop `02e-btn-explode-contrast.png`，Pillow 像素分析）：文字 RGB(255,255,240) vs 深铜底 RGB(93,55,27) → **WCAG 对比度 10.26:1**（AAA，远高于 AA 4.5:1）。

---

## 8. 视觉复审（基于最终 GPU 实拍截图）

方法：`read_image` 逐张检查 1440×900 初始/拆解/三套主题、1280×800、390×844 初始与拆解态；配置摘要 3× 放大裁切（`analysis-summary-01/03.png`）；拆解按钮像素级对比度（§7）；移动端产品占视口比例像素统计（strip 内 bbox 面积占比 **70%**，上一版为 62%）。

| 级别 | 数量 | 说明 |
| --- | --- | --- |
| **Blocker** | **0** | 无 |
| **Major** | **0** | 无 |
| **可执行 minor** | **0** | 上一轮 4 条 minor 已全部修复并复验通过（见下） |

上一轮 4 条 minor 的复验结果：

1. **移动端取景偏小** → 已修复：`#viewport` 371→304px 后键盘占视口宽约 **70%**，产品更饱满、首屏露出更多面板。证据 `06-mobile-390x844.png`。
2. **配置摘要 meta 偏小偏暗** → 已修复：约 10.5px / alpha≈0.58，1440 下清晰可读。证据 `analysis-summary-01.png`。
3. **面板底部留白** → 已修复：`.panel-bottom` 贴底（距面板底 ≤24px）+ “配置保存在本机 · 不上传”说明；1440/1280 `panelOverflow=0`。证据 `01-initial-desktop-1440x900.png`、`07-desktop-1280x800.png`。
4. **曜石黑底壳轮廓分离度** → 已修复：底壳顶部新增极细金属 trim 边线，深色主题下轮廓清晰、不遮挡键帽。证据 `03-theme-obsidian-graphite.png`。

其余视觉结论：产品完整、键位清晰、9 套配色切换真实且层级/光影统一；拆解三层层次分明、顶排不再被裁切、层标签三视口均不压产品/工具条；移动端拆解为顶部单行图例；整体调性符合“暖色摄影棚高端产品页”。

主观观察（不构成问题、不建议再改）：移动端键盘上方仍保留少量暗部留白用于呼吸感；拆解态标签字号较小但可读。

---

## 9. 已知限制与未验证项（如实记录）

**已测环境限制**

1. 使用无头 Edge + 硬件 GPU（ANGLE/D3D11）实测；与最终用户浏览器/驱动/机型可能存在细微渲染差异（抗锯齿、阴影、色彩管理）。
2. 截图 deviceScaleFactor=1，未覆盖 HiDPI（2×）下文字/描边清晰度。
3. 移动端仅用 390×844 视口模拟，未在真实手机/触屏验证触控手势、地址栏伸缩（svh 变化）与移动浏览器差异。
4. `file://` 的 localStorage 行为由浏览器策略决定：本机 Edge 153 可用并已实测持久化；部分浏览器（如某些 Chrome 版本）可能禁用 file 源 localStorage，页面会降级为“仅本次会话”，脚本对此有 SKIP 分支但本机未触发。
5. 视觉复审为主观判断（`read_image` + 像素统计），非专业设计评审。

**未验证项**

1. Firefox / Safari / 其他 Chromium 版本：未执行。
2. `prefers-reduced-motion` 的实际动画降级：未做断言。
3. 无障碍完整审计（屏幕阅读器朗读顺序、键盘 Tab 焦点环可见性、全量对比度扫描）：仅验证了 DOM 结构/ARIA 属性（aria-pressed、role=status、aria-live、label 关联）与焦点守卫逻辑。
4. 高负载/长时间运行的内存与稳定性（>10 分钟 soak）、低端设备帧率：未执行。
5. 3D 模型几何/材质数值精度（polycount、贴图、PBR 参数）：契约未要求，未验证。
6. 触屏真实交互（pointer 触控事件）：仅用鼠标事件在 390×844 视口下模拟。

---

## 10. 截图证据清单（相对工作区，均来自最终两轮）

**Dev 页面（GPU 实拍）**

| 文件 | 尺寸 | 内容 |
| --- | --- | --- |
| `verify/shots/01-initial-desktop-1440x900.png` | 1440×900 | 初始桌面（月银/雾白，含 trim 边线与 panel-bottom 说明） |
| `verify/shots/02-exploded-1440x900.png` | 1440×900 | 拆解态（默认主题，三层完整、左侧层标签、深铜 CTA） |
| `verify/shots/02b-exploded-labels-1440x900.png` | 1440×900 | 拆解层标签专项（1440） |
| `verify/shots/02c-exploded-labels-1280x800.png` | 1280×800 | 拆解层标签专项（1280） |
| `verify/shots/02d-exploded-labels-390x844.png` | 390×844 | 拆解层标签专项（390，顶部单行图例） |
| `verify/shots/02e-btn-explode-contrast.png` | 304×52 | 拆解态主按钮 crop（对比度证据） |
| `verify/shots/03-theme-obsidian-graphite.png` | 1440×900 | 曜石黑 + 石墨（trim 轮廓） |
| `verify/shots/04-theme-lunar-harvest.png` | 1440×900 | 月银 + 麦田 |
| `verify/shots/05-theme-copper-alabaster.png` | 1440×900 | 暮铜 + 雾白 |
| `verify/shots/06-mobile-390x844.png` | 390×844 | 移动端初始（键盘更饱满、面板起始可见） |
| `verify/shots/07-desktop-1280x800.png` | 1280×800 | 1280×800 首屏布局 |
| `verify/shots/analysis-summary-01.png` / `analysis-summary-03.png` | 1089×240 | 配置摘要 3× 放大裁切（可读性证据） |

**单文件（file://，前缀 `08-standalone-`）**

| 文件 | 尺寸 |
| --- | --- |
| `verify/shots/08-standalone-01-initial-desktop-1440x900.png` | 1440×900 |
| `verify/shots/08-standalone-02-exploded-1440x900.png` | 1440×900 |
| `verify/shots/08-standalone-02b/02c/02d-exploded-labels-*.png` | 1440×900 / 1280×800 / 390×844 |
| `verify/shots/08-standalone-02e-btn-explode-contrast.png` | 304×52 |
| `verify/shots/08-standalone-03/04/05-theme-*.png` | 1440×900 |
| `verify/shots/08-standalone-06-mobile-390x844.png` | 390×844 |
| `verify/shots/08-standalone-07-desktop-1280x800.png` | 1280×800 |

> 其余 `iter*/lead*/standalone-test.png` 等为开发/Lead 迭代或探针临时截图，非本报告证据。

---

## 11. 问题历史与闭环

| # | 问题 | 发现方式 | 处置 | 复验 |
| --- | --- | --- | --- | --- |
| 1 | `getSceneInfo().theme` 返回 `{caseId,keycapId}`，违反 TEST-API 的 `{case,keycap}` | dev 首轮（41 PASS / 4 FAIL） | Lead 修改 `src/test-api.js` | 通过 |
| 2 | `getKey().press` 弹簧超调 1.09–1.14，超出 0..1 契约 | dev 首轮 + 专项诊断 | Lead 在测试 API 层 clamp 0..1；实测 press≤1 | 通过 |
| 3 | 体验模式 demo wave 自动敲 `L U M E N ␣`，与输入/测试重叠 | dev 首轮 + `verify/diag-demo.mjs` | Lead 移除 demo wave；焦点保护保留 | 通过（键入采样 max press=0） |
| 4 | 拆解态顶排键帽被裁切、层标签压住产品 | dev 首轮视觉复审（blocker 级） | Lead 拆解态相机自动拉远/上移 + 标签锚点修正 | 通过（§7 三视口） |
| 5 | 移动端 `#viewport` 缩至 304px 后竖排图例 CASE 标签压住 KeyQ/KeyA | 冻结后 dev 复验 FAIL（47/48） | Lead 改为顶部单行紧凑图例（短文案） | 通过（0% 重叠） |
| 6 | 视觉 minor 1–4（移动取景/meta 可读性/面板底部/曜石黑轮廓） | 视觉复审 | Lead/ui-designer 修复（viewport 304、meta 10.5px/.58、`.panel-bottom`、trim 边线） | 通过（§8） |
| 7 | 移动端拆解截图因按钮点击自动滚动导致取景错误 | QA 自查 | QA 修正测试脚本：点击后滚动 #viewport 到视口中央再测量/截图 | 通过 |

其他说明：

- **默认组合不落盘**：初始默认（月银/雾白/未改名）点击已选中项时 `state.js` 按设计不写 localStorage；刷新后仍解析为默认配置。QA 用例按“默认组合允许不落盘”处理，不视为缺陷。
- **HMR 干扰**：并行开发期间 Vite HMR 曾导致页面重载；最终两轮均在冻结源码下执行，导航 5 次、无额外重载。

---

## 12. 复现步骤

1. 确保 dev server 已启动：`http://127.0.0.1:5173/`（或直接使用根目录 `LUMEN-68.html`）。
2. 在 `D:\projectDsh\moqian-3d-key` 下执行 §3 命令。
3. 终端逐项输出 PASS/FAIL；报告写入 `verify/last-run*.json`；截图写入 `verify/shots/`。
4. 退出码：0 = 全部 PASS；1 = 存在 FAIL（终端打印失败详情）；2 = 看门狗超时（输出部分报告）。
