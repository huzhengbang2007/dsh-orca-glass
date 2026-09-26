/**
 * dsh-orca-glass —— 宿主半（Node side）。
 *
 * 这个插件的工作全在浏览器里（注入 SVG 滤镜 + <style>），宿主侧只需要存在一个
 * 可加载的入口，让 cordis 的 composition 里那一行能落地。
 */

/** Host loader entry for the browser-only liquid-glass layer. */
export function apply() {}
