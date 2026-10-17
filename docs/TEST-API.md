# LUMEN 68 — 测试接口契约（Lead 提供，QA 使用）

页面加载完成后（`window.__LUMEN_READY__ === true`）会在 `window.__LUMEN__` 暴露一个只读+命令式调试接口，
供自动化验证使用。它不是 UI 的一部分，但必须真实反映 Three.js 场景状态。

```ts
interface LumenTestApi {
  version: string;
  storageKey: string;              // "lumen68.config.v1"

  // 状态
  getState(): {
    caseId: 'lunar' | 'obsidian' | 'copper';
    keycapId: 'alabaster' | 'graphite' | 'harvest';
    profileName: string;
    experience: boolean;           // 键帽体验模式是否开启
    exploded: boolean;             // 当前逻辑目标（点击立即翻转）
    explodeTarget: 0 | 1;          // exploded ? 1 : 0
    explodeProgress: number;       // 0..1 实际动画进度（平滑跟随 target）
    camera: {
      position: [number, number, number];
      target: [number, number, number];
      distance: number;
    };
    layers: { caps: number; plate: number; case_: number }; // 各层当前世界 Y 偏移
    keys: number;                  // 应 >= 60，固定 66
    ready: boolean;
  };

  // 配置命令（与 UI 点击等效，同时写入 localStorage）
  setCase(id: string): void;
  setKeycap(id: string): void;
  setExperience(on: boolean): void;
  toggleExplode(): boolean;        // 返回新的 exploded 目标
  setExploded(on: boolean): void;

  // 相机
  resetCamera(): void;             // 带过渡，约 700ms 回到初始视角
  getCamera(): { position: [number, number, number]; target: [number, number, number]; distance: number };

  // 键帽
  getKey(code: string): null | {
    code: string;                  // 例如 "KeyA" / "Space"
    label: string;                 // 键帽字符/名称
    pressed: boolean;              // 是否处于物理按下状态
    press: number;                 // 0..1 按压弹簧当前值
    offset: number;                // 键帽当前下压位移（世界单位，0 为静止，向下为负）
    worldPosition: [number, number, number];
    screen: { x: number; y: number };  // 相对页面视口的 CSS 像素坐标（键帽顶部中心）
    inView: boolean;
  };
  pressVirtual(code: string): void;    // 等效物理 keydown A-Z / Space（受体验模式限制）
  releaseVirtual(code: string): void;

  // 等待所有弹性动画（拆解进度、键帽回弹、相机过渡）稳定
  whenSettled(timeoutMs?: number): Promise<boolean>;  // true = 在超时前稳定

  // 场景信息
  getSceneInfo(): {
    renderer: 'webgl2' | 'webgl1';
    pixelRatio: number;
    canvas: { width: number; height: number; clientWidth: number; clientHeight: number };
    keyCount: number;
    rows: number[];                // 每行键数，例如 [15,15,14,13,9]
    theme: { case: string; keycap: string };
    labelsVisible: boolean;        // 拆解层标签是否可见
  };
}

window.__LUMEN_READY__: boolean;
```

额外要求：

- `pressVirtual` / `releaseVirtual` 与真实键盘路径一致：体验模式关闭时不应产生按压（或至少 QA 会先开启体验模式再测）。
- `getKey()` 的 `screen` 必须基于 `canvas.getBoundingClientRect()` 与实际投影矩阵计算，可用于 `page.mouse.click(x, y)`。
- `getKey().press` 对外始终 clamp 在 `0..1`（内部按压弹簧允许轻微视觉超调，但 API 契约保持 0..1；`offset` 与 clamp 后的 press 对应）。
- `whenSettled()` 判定：`|explodeProgress - explodeTarget| < 0.001`、所有键 `|press| < 0.002`、相机过渡与拆解自动取景收敛完成；默认超时 4000ms。
- `getState().layers`：组装状态三层偏移都为 0；拆解状态下 caps > plate > 0，且 case_ 接近 0（顺序明显分离）。
- 所有坐标单位：1 = 一个键位间距（key pitch），可自由换算；QA 只比较相对关系与容差。
- 该接口不得影响正常用户操作或产生可见调试 UI。

### 额外验证辅助（当前实现提供，便于 CI）

- `getRenderTheme()`：返回 3D 材质当前实际颜色（hex），字段 `case` / `plate` / `capAlpha` / `capMod` / `capAccent` / `legend`，可用于断言主题真的作用到 Three.js 材质而不只是 DOM。
- `waitForTheme(caseId?, keycapId?, timeoutMs = 6000)`：等待材质颜色过渡到目标主题（低帧率 CI 下避免采样到过渡中间值）。
- `getEcho()`：返回页脚 `KEY ECHO` 当前回显内容。
