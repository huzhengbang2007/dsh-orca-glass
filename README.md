# dsh-orca-glass

给 **DeepSeek Harness（DSH）Web** 用的「真·液态玻璃折射层」+ **orca-scene** 皮肤。
插件负责 SVG 折射（`backdrop-filter: url(#filter)`），皮肤负责底色 / token / 磨砂 / 边框 —— 两者配合才是完整的液态玻璃效果。

```
dsh-orca-glass/
├── package.json          # DSH 客户端插件清单（dsh.client + dsh.bundle.patch）
├── cordis.patch.yml      # profile bundle 插入行
├── lib/
│   ├── index.js          # 宿主半（空实现）
│   └── client.js         # 浏览器半：注入 SVG 滤镜 + CSS + 指针高光
└── skin/
    └── orca-scene/       # 配套皮肤（拷进 $DSH_HOME/skins/ 即可）
        ├── skin.json
        ├── skin.css      # 主题 token（明/暗两套）
        ├── patches.css   # 表面：侧边栏 / 正文板 / 气泡 / 输入卡 / 弹窗 …
        ├── assets/       # 背景图 light.webp / dark.webp
        └── preview/      # 皮肤中心预览图
```

## 为什么折射必须做成插件

真折射 = `backdrop-filter: url(#svgFilter)`，被引用的 `<filter>` 节点必须存在于**同一个文档**里，这只能由 JS 注入。
皮肤中心（`@linxin666/dsh-client-ui-skin-center`）只给有 provenance 白名单的官方皮肤放行 `hooks.mjs`，
放在 `$DSH_HOME/skins/` 下的自建皮肤拿不到任何 JS 口子 —— 所以折射只能由插件补，皮肤那边只做静态观感。

## 插件做了什么

1. 往 `document.body` 注入 0 尺寸 `<svg id="orca-glass-defs">`：
   - `#orca-lg`：`feGaussianBlur`（霜化）→ `feTurbulence fractalNoise`（大尺度波纹）→
     三条 `feDisplacementMap`（scale = `refract±chroma`，R/G 通道）→ `feColorMatrix` 分离三通道 →
     两次 `feBlend mode="screen"` —— 得到带**色散边缘**的折射
   - `#orca-lg-soft`：频率更高、位移更小的轻量版
2. 注入 `<style id="orca-glass-style">`，全部规则限定在 `html[data-dsh-skin='orca-scene']` 之下
   （换皮肤自动失效，不污染其它皮肤）：
   - 折射表面：侧边栏 / 右侧详情栏 / 会话头 / AI 回复正文板 / 用户气泡 / 工具行 / 菜单与 tooltip / 代码块
   - 输入卡：用更高特指度 + `!important` 覆盖皮肤中心的 neutralizer，并保留其
     `blur(var(--dsh-input-card-blur))` 串在滤镜列表里
   - 颗粒层（`::after` + 内联 SVG 噪声 + `mix-blend-mode: overlay`，不需要图片资源）
   - `@keyframes` 流光漂移、滚动条细化、表格玻璃化、选区染色、`prefers-reduced-motion` 自动关动效
   - 浮空玻璃卡（左栏 + 右详情栏：18px 圆角、1px 描边、双向内高光，展开态四周留 10px 缝；
     不放外投影——它会贴着中栏画一圈暗带，在半透明玻璃上透出来像是「阴影挡住了侧边栏」；
     卡比原生栏窄 20px，所以栏内内容盒也一起缩（`max-width: 100%`）——否则详情栏面板
     会向左多出 22px、被 `overflow: hidden` 裁掉标题首字；
     56px 图标轨道内主动不缩进，免得图标偏心被圆角切）
3. 监听 `pointermove`，把 `--orca-lx` / `--orca-ly` 写到当前玻璃面上，做径向跟随高光。

## 安装

### 1) 装皮肤

把 `skin/orca-scene/` 整个目录复制到 `$DSH_HOME/skins/orca-scene/`（本机即 `~/.dsh/skins/orca-scene/`），
然后在皮肤中心（skin center）里选中 `orca-scene`；或直接写：

```jsonc
// $DSH_HOME/skin-center-active.json
{ "active": "orca-scene", "initialized": true, "background": { "enabled": true, "inputCardBlur": 18, "bubbleOpacity": 55, "bubbleBlur": 14 } }
```

皮肤变化只需刷新页面，不必重启。

### 2) 装插件

把本包放进 `$DSH_HOME/profiles/<profile>/node_modules/dsh-orca-glass/`（或放在任意 ASCII 路径再链接进去），
然后在 profile 的 `package.json` 里登记**两处**：

```jsonc
{
  "dependencies": { "dsh-orca-glass": "file:../../plugins/dsh-orca-glass" },
  "dsh": { "profile": { "bundles": [ /* … 其它 bundle … */ "dsh-orca-glass" ] } }
}
```

`dependencies` 决定能不能解析到包，`dsh.profile.bundles` 决定要不要加载这个 bundle 层 —— **两者缺一不可**。
客户端插件只在 **DSH 启动时**装载，装完要重启一次 DSH。

> 已知坑：`dsh plugin add` 会把**非 ASCII 路径参数** mojibake 后再交给 pnpm
> （`C:\…\默认工作区\_build\…` → `榛樿宸ヤ綔鍖篭_build`），导致 `UNKNOWN: unknown error … errno -4094`；
> 另外本机沙箱里 junction / reparse point 不可穿透（`untrusted mount point`）。
> 所以插件源码要放在 **纯 ASCII 路径**下，用真实目录 + `file:` 规格登记。

## 现场调参

```js
window.__orcaGlass.get()                            // 当前参数
window.__orcaGlass.tune({ refract: 32, chroma: 12 })
window.__orcaGlass.tune({ float: false, grain: 0 })  // 关浮空卡 / 关颗粒
window.__orcaGlass.reset()                          // 回默认
window.__orcaGlass.css()                            // 当前生成的 CSS 文本
```

| 参数 | 默认 | 含义 |
|---|---|---|
| `refract` | 18 | 折射位移强度（`feDisplacementMap` scale，px） |
| `chroma` | 7 | 三通道色散差（越大边缘彩边越明显） |
| `frost` / `frostSoft` | 14 / 9 | 大面 / 小面霜化（`feGaussianBlur` stdDeviation） |
| `freqX` / `freqY` / `octaves` / `seed` | 0.008 / 0.013 / 2 / 7 | 波纹形状 |
| `saturate` | 1.7 | 背景饱和度增益 |
| `grain` | 0.35 | 颗粒层不透明度（0..1） |
| `spot` / `spotSize` | 0.15 / 560 | 指针高光强度 / 半径（px） |
| `float` | true | 左右两栏浮空玻璃卡（左栏 + 右详情栏） |

改动存 `localStorage["dsh-orca-glass"]`；`window.__orcaGlass` 就是插件的实时实例。

## 已验证（DSH 0.1.7-rc.2 · Edge/Chromium 无头量化）

- `backdrop-filter: url(#svgFilter)` **确实被执行**：同场景 `url` vs `blur` 像素差 mean 12–37，对照区恒为 0
- `url(...) blur(...) saturate(...)` 组合滤镜列表被接受且 `url()` 部分有效（差值 ≈ 纯 `url`，
  远大于「整条声明被丢弃」的情形）→ 输入卡规则成立
- 注入 CSS 稳定解析出 **27 条规则 / 2 个滤镜**（把规则数编码成色块读像素验证，无整表丢弃）
- 插件开/关 A/B：差异**只**落在侧边栏与 AI 正文板，其余元素 0 差异
- 像素级验证方法（无视觉模型也能验证 CSS）：同场景两种渲染做像素差 + 无差异对照区，
  用 `System.Drawing` 逐点采样

## 卸载 / 回退

- 停插件：从 `dsh.profile.bundles` 里删掉 `dsh-orca-glass` 后重启（皮肤照旧，只是没有折射）；
  或临时 `window.__orcaGlass.tune({ refract: 0, grain: 0, float: false })`
- 换皮肤：折射层因为 `html[data-dsh-skin='orca-scene']` 门控会自动失效

## License

MIT
