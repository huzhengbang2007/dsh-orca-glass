window.__ModuleLoader__.load({
	id: "dsh-orca-glass",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/* =====================================================================
		 * dsh-orca-glass —— orca-scene 皮肤的真·液态玻璃折射层
		 *
		 * 为什么必须是插件：真折射需要 `backdrop-filter: url(#svgFilter)`，而滤镜节点
		 * 必须存在于同文档。皮肤中心只给有 provenance 白名单的官方皮肤放行 hooks.mjs，
		 * 自建皮肤（$DSH_HOME/skins/...）拿不到任何 JS 口子 —— 所以折射只能在插件里补。
		 *
		 * 插件做三件事：
		 *   1) 往 <body> 塞一个 0 尺寸 <svg>：feTurbulence 生成大尺度波纹，
		 *      三条 feDisplacementMap 用不同 scale 做三通道位移（色散/色差），
		 *      再用 feColorMatrix 分离 + feBlend screen 合成。
		 *   2) 塞一个 <style>：把 url(#…)、颗粒层、指针高光、@keyframes 流光、
		 *      浮空玻璃卡、滚动条、表格玻璃化全部限定在 html[data-dsh-skin='orca-scene'] 下，
		 *      换皮肤即自动失效（不会污染别人的皮肤）。
		 *   3) 监听指针，把 --orca-lx/--orca-ly 写到当前玻璃面上，做跟随高光。
		 *
		 * 现场调参：window.__orcaGlass.tune({ refract: 32, chroma: 12 })
		 * 关掉浮空卡：window.__orcaGlass.tune({ float: false })
		 * 回默认：window.__orcaGlass.reset()
		 * ===================================================================== */

		const SKIN = "orca-scene";
		const SVG_ID = "orca-glass-defs";
		const STYLE_ID = "orca-glass-style";
		const STORE_KEY = "dsh-orca-glass";
		const SVG_NS = "http://www.w3.org/2000/svg";

		const DEFAULTS = {
			refract: 18, // 折射位移强度（feDisplacementMap scale，px）——再大就像水波而不是玻璃
			chroma: 7, // 三通道色散差（越大边缘彩边越明显）
			frost: 14, // 大面霜化（feGaussianBlur stdDeviation）
			frostSoft: 9, // 小面霜化
			freqX: 0.008, // 波纹频率（越小越像大曲面透镜）
			freqY: 0.013,
			octaves: 2,
			seed: 7,
			saturate: 1.7,
			grain: 0.35, // 颗粒层不透明度（0..1）
			spot: 0.15, // 指针高光强度（0..1）
			spotSize: 560, // 高光半径（px）
			float: true // 侧边栏浮空玻璃卡
		};

		let tune = Object.assign({}, DEFAULTS);
		try {
			const raw = window.localStorage.getItem(STORE_KEY);
			if (raw) tune = Object.assign({}, DEFAULTS, JSON.parse(raw));
		} catch (err) {
			/* 本地配置损坏就用默认值 */
		}

		/** 颗粒纹理：内联 SVG 噪声（比 PNG 小得多，也不用把二进制塞进皮肤目录）。 */
		function grainUrl(opacity) {
			return (
				'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'%3E' +
				"%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E" +
				"%3Crect width='160' height='160' filter='url(%23g)' opacity='" +
				opacity +
				"'/%3E%3C/svg%3E\")"
			);
		}

		/** 两个滤镜：orca-lg 全量（大面/气泡），orca-lg-soft 轻量（小面/正文板/代码块）。 */
		function defs(t) {
			const num = (v) => (Math.round(v * 1000) / 1000).toString();
			return (
				`<filter id="orca-lg" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">` +
				`<feGaussianBlur in="SourceGraphic" stdDeviation="${num(t.frost)}" result="frost"/>` +
				`<feTurbulence type="fractalNoise" baseFrequency="${num(t.freqX)} ${num(t.freqY)}" numOctaves="${t.octaves}" seed="${t.seed}" result="noise"/>` +
				`<feDisplacementMap in="frost" in2="noise" scale="${num(t.refract + t.chroma)}" xChannelSelector="R" yChannelSelector="G" result="dispR"/>` +
				`<feDisplacementMap in="frost" in2="noise" scale="${num(t.refract)}" xChannelSelector="R" yChannelSelector="G" result="dispG"/>` +
				`<feDisplacementMap in="frost" in2="noise" scale="${num(Math.max(0, t.refract - t.chroma))}" xChannelSelector="R" yChannelSelector="G" result="dispB"/>` +
				`<feColorMatrix in="dispR" type="matrix" values="1.07 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="chrR"/>` +
				`<feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="chrG"/>` +
				`<feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1.07 0 0 0 0 0 1 0" result="chrB"/>` +
				`<feBlend in="chrR" in2="chrG" mode="screen" result="chrRG"/>` +
				`<feBlend in="chrRG" in2="chrB" mode="screen"/>` +
				`</filter>` +
				`<filter id="orca-lg-soft" x="-16%" y="-16%" width="132%" height="132%" color-interpolation-filters="sRGB">` +
				`<feGaussianBlur in="SourceGraphic" stdDeviation="${num(t.frostSoft)}" result="frost"/>` +
				`<feTurbulence type="fractalNoise" baseFrequency="${num(t.freqX * 1.7)} ${num(t.freqY * 1.4)}" numOctaves="2" seed="${t.seed + 3}" result="noise"/>` +
				`<feDisplacementMap in="frost" in2="noise" scale="${num(t.refract * 0.6)}" xChannelSelector="R" yChannelSelector="G"/>` +
				`</filter>`
			);
		}

		function css(t) {
			const S = `html[data-dsh-skin='${SKIN}']`;
			const DARK = `body[data-ds-dark-theme] `;
			const parts = [];

			parts.push(`/* ============ dsh-orca-glass：折射覆盖（!important 才能压过皮肤中心的 neutralizer） ============ */
${S} [class*='sidebarCol'] {
  -webkit-backdrop-filter: url(#orca-lg) saturate(${t.saturate}) brightness(1.04) !important;
  backdrop-filter: url(#orca-lg) saturate(${t.saturate}) brightness(1.04) !important;
}
${S} [class*='rightbarCol'] {
  -webkit-backdrop-filter: url(#orca-lg-soft) saturate(1.5) !important;
  backdrop-filter: url(#orca-lg-soft) saturate(1.5) !important;
}
${S} [data-phase='active'] header,
${S} header[class*='header'] {
  -webkit-backdrop-filter: url(#orca-lg-soft) saturate(1.5) !important;
  backdrop-filter: url(#orca-lg-soft) saturate(1.5) !important;
}
${S} [data-conversation-scroll] [class*='markdown'] {
  -webkit-backdrop-filter: url(#orca-lg) saturate(1.55) brightness(1.03) !important;
  backdrop-filter: url(#orca-lg) saturate(1.55) brightness(1.03) !important;
}
${S} [data-slot='main.conversation'] [class*='userStack'] [class*='bubble'],
${S} [data-slot='main.conversation'] [class*='callRow'] {
  -webkit-backdrop-filter: url(#orca-lg) saturate(1.5) !important;
  backdrop-filter: url(#orca-lg) saturate(1.5) !important;
}
${S} [role='menu'],
${S} [role='tooltip'],
${S} [class*='md-code-block'] {
  -webkit-backdrop-filter: url(#orca-lg-soft) saturate(1.4) !important;
  backdrop-filter: url(#orca-lg-soft) saturate(1.4) !important;
}
/* 输入卡：选择器必须比皮肤中心 neutralizer（html[data-dsh-backdrop-active][data-dsh-conversation-content] [data-composer-card]）更具体，
   而且保留 blur(var(--dsh-input-card-blur))，这样面板里的「输入框模糊」滑杆依然有效。 */
${S}[data-dsh-backdrop-active][data-dsh-conversation-content] [data-composer-card] {
  -webkit-backdrop-filter: url(#orca-lg) blur(var(--dsh-input-card-blur, 10px)) saturate(1.5) !important;
  backdrop-filter: url(#orca-lg) blur(var(--dsh-input-card-blur, 10px)) saturate(1.5) !important;
}
/* 保险：backdrop-filter 会成为 fixed 后代的包含块；开弹窗时先摘掉侧边栏的折射。 */
${S} [class*='sidebarCol']:has([role='dialog']) {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}`);

			parts.push(`/* ============ 颗粒 + 指针跟随高光（皮肤用的是 ::before，这里用 ::after 不冲突） ============ */
/* ::after 是绝对定位叠层，必须保证宿主元素自己是定位祖先；皮肤若已给 relative 则此规则无副作用。 */
${S} [class*='sidebarCol'],
${S} [class*='rightbarCol'],
${S} [data-phase='active'] header,
${S} header[class*='header'],
${S} [data-conversation-scroll] [class*='markdown'] {
  position: relative;
}
/* 颗粒 / 指针高光是绝对定位的 ::after，天然盖在内容之上（侧栏图标、详情栏文字会发灰）。
   把面板的直接子元素抬到叠层之上：玻璃照旧，内容不再被压一层。 */
${S} [class*='sidebarCol'] > *,
${S} [class*='rightbarCol'] > * {
  position: relative;
  z-index: 1;
}
/* 嵌套的 markdown（正文里再套一层）不要重复叠颗粒。 */
${S} [class*='markdown'] [class*='markdown']::after {
  content: none !important;
  animation: none !important;
}
${S} [class*='sidebarCol']::after,
${S} [class*='rightbarCol']::after,
${S} [data-phase='active'] header::after,
${S} header[class*='header']::after,
${S} [data-conversation-scroll] [class*='markdown']::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background-image:
    radial-gradient(${t.spotSize}px circle at var(--orca-lx, 50%) var(--orca-ly, 0%), rgba(255, 255, 255, ${t.spot}), rgba(255, 255, 255, 0) 62%),
    ${grainUrl(t.grain)};
  background-size: 100% 100%, 160px 160px;
  mix-blend-mode: overlay;
  animation: orca-glass-drift 16s ease-in-out infinite;
}
@keyframes orca-glass-drift {
  0%, 100% { background-position: 0 0, 0 0; }
  50% { background-position: 0 0, -7px -5px; }
}`);

			if (t.float) {
				parts.push(`/* ============ 浮空玻璃卡：侧边栏从「贴边栏」变成「浮起来的玻璃板」 ============ */
/* 四边留白必须对称：右边是 0 的话玻璃板会直接贴到中栏上（挤在一起很脏）。
   轨道宽度由 AppFrame 的 grid-template-columns 决定，margin 只会缩小内容盒。 */
${S} [class*='sidebarCol'] {
  margin: 10px !important;
  border: 1px solid rgba(150, 190, 245, 0.38) !important;
  border-radius: 18px !important;
  /* 不要外投影：0 18px 44px 会在玻璃板外侧画出一圈 44px 的暗带，
     而这套皮肤的中栏 / 侧栏底色都是半透明的，暗带会贴着实边栏的右缘透出来，
     看起来就像「阴影盖住了侧边栏」。深度感改由 1px 边框 + inset 高光承担。 */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset -1px 0 0 rgba(255, 150, 195, 0.16) !important;
}
${S} ${DARK}[class*='sidebarCol'] {
  border-color: rgba(120, 160, 210, 0.3) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    inset -1px 0 0 rgba(255, 130, 180, 0.12) !important;
}
/* 右详情栏同样做成浮空玻璃卡（原来是一块贴边满高的面板）。
   高光放在左缘，和左栏镜像；同样不放外投影（会贴着中栏画暗带）。
   overflow:hidden 让有自己底色的子块不越出 18px 圆角。 */
${S} [class*='rightbarCol'] {
  margin: 10px !important;
  border: 1px solid rgba(150, 190, 245, 0.38) !important;
  border-radius: 18px !important;
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 1px 0 0 rgba(130, 205, 255, 0.16) !important;
}
${S} ${DARK}[class*='rightbarCol'] {
  border-color: rgba(120, 160, 210, 0.3) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    inset 1px 0 0 rgba(110, 190, 255, 0.12) !important;
}
/* 卡比原生栏窄 2×margin：栏内内容仍按原生宽度排，不一起缩就会被 overflow:hidden
   裁掉（详情栏面板会向左多出 22px，标题首字缺一块；左栏右缘的箭头 / ⚠ 也会被切）。
   让内容盒跟上卡片、内部允许收缩。 */
${S} [class*='rightbarCol'] [class*='panel'] {
  left: 0 !important;
  right: 0 !important;
  width: auto !important;
  min-width: 0 !important;
}
${S} [class*='rightbarCol'] [class*='panel'] * {
  min-width: 0 !important;
  max-width: 100% !important;
}
/* 左栏同理；收起成 56px 图标轨道时不缩（那时内容本来就窄，硬缩会把图标挤变形）。 */
${S} [class*='sidebarCol']:not([data-sidebar-collapsed], [data-sidebar-collapsed] *) [class*='root'] {
  max-width: 100% !important;
  box-sizing: border-box !important;
}
/* 收起成图标轨道时（AppFrame 的 collapsedWidth = 56px）任何 inset 都会出问题：
   左 10 + 右 10 只剩 36px，正好等于图标按钮的宽度 → 图标被圆角切、还会偏心。
   data-sidebar-collapsed 由 AppFrame 挂在 frame 上，正好是 sidebarCol 的直接父节点。
   注意：选择器要连暗色一起写，否则低特指度压不过上面那条 ${S} ${DARK}[class*='sidebarCol']。 */
${S} [data-sidebar-collapsed] > [class*='sidebarCol'],
${S} ${DARK}[data-sidebar-collapsed] > [class*='sidebarCol'] {
  margin: 0 !important;
  border-radius: 0 !important;
  /* 轨道是贴边的，不要圆角边框；恢复 DSH 原本那条 0.5px 分隔线 */
  border: none !important;
  border-right: 0.5px solid var(--dsw-alias-border-l3) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    inset 0 -1px 0 rgba(255, 255, 255, 0.06) !important;
}`);
			}

			parts.push(`/* ============ 输入卡聚焦：内发光 + 边沿点亮 ============ */
${S} [data-composer-card]:focus-within {
  border-color: rgba(140, 205, 255, 0.6) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    inset 1.5px 0 0 rgba(130, 205, 255, 0.3),
    inset -1.5px 0 0 rgba(255, 145, 190, 0.24),
    0 0 0 1px rgba(130, 205, 255, 0.45),
    0 0 26px rgba(120, 200, 255, 0.34),
    0 14px 40px rgba(12, 28, 58, 0.18) !important;
}
${S} ${DARK}[data-composer-card]:focus-within {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    inset 1.5px 0 0 rgba(110, 190, 255, 0.24),
    inset -1.5px 0 0 rgba(255, 130, 180, 0.2),
    0 0 0 1px rgba(120, 190, 255, 0.4),
    0 0 30px rgba(90, 170, 255, 0.3),
    0 16px 44px rgba(0, 0, 0, 0.44) !important;
}`);

			parts.push(`/* ============ 滚动条细化（玻璃管道） ============ */
${S} * {
  scrollbar-width: thin;
  scrollbar-color: rgba(150, 190, 245, 0.45) transparent;
}
${S} *::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
${S} *::-webkit-scrollbar-track {
  background: transparent;
}
${S} *::-webkit-scrollbar-thumb {
  background: rgba(150, 190, 245, 0.32);
  background-clip: padding-box;
  border: 2px solid transparent;
  border-radius: 999px;
}
${S} *::-webkit-scrollbar-thumb:hover {
  background: rgba(170, 205, 255, 0.55);
  background-clip: padding-box;
}
${S} *::-webkit-scrollbar-corner {
  background: transparent;
}`);

			parts.push(`/* ============ 表格玻璃化 ============ */
${S} [class*='tableScroll'] {
  border: 1px solid rgba(150, 190, 245, 0.28);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}
${S} [class*='tableFill'] {
  background: color-mix(in srgb, var(--dsw-static-neutral-bluish-00) 34%, transparent);
}
${S} ${DARK}[class*='tableFill'] {
  background: color-mix(in srgb, var(--dsw-static-neutral-bluish-900) 40%, transparent);
}
${S} ${DARK} [class*='tableScroll'] {
  border-color: rgba(120, 160, 210, 0.26);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
}`);

			parts.push(`/* ============ 选区染色（玻璃里挑字） ============ */
${S} ::selection {
  background: rgba(120, 200, 255, 0.32);
  text-shadow: 0 0 12px rgba(160, 220, 255, 0.45);
}
${S} ${DARK} ::selection {
  background: rgba(110, 190, 255, 0.26);
}`);

			parts.push(`/* ============ 降低动效偏好 ============ */
@media (prefers-reduced-motion: reduce) {
  ${S} [class*='sidebarCol']::after,
  ${S} [class*='rightbarCol']::after,
  ${S} [data-phase='active'] header::after,
  ${S} header[class*='header']::after,
  ${S} [data-conversation-scroll] [class*='markdown']::after {
    animation: none;
  }
}`);

			return parts.join("\n\n") + "\n";
		}

		/** 把滤镜定义塞进 <svg>（用 XML 解析 + importNode，比 innerHTML 在 SVG 命名空间下可靠）。 */
		function renderDefs(svg) {
			const parsed = new DOMParser().parseFromString(
				`<svg xmlns="${SVG_NS}">${defs(tune)}</svg>`,
				"image/svg+xml"
			);
			while (svg.firstChild) svg.removeChild(svg.firstChild);
			const kids = parsed.documentElement.childNodes;
			for (let i = 0; i < kids.length; i += 1) svg.appendChild(document.importNode(kids[i], true));
		}

		function ensureNodes() {
			let svg = document.getElementById(SVG_ID);
			if (!svg) {
				svg = document.createElementNS(SVG_NS, "svg");
				svg.setAttribute("id", SVG_ID);
				svg.setAttribute("aria-hidden", "true");
				svg.setAttribute("focusable", "false");
				svg.setAttribute(
					"style",
					"position:fixed;top:0;left:0;width:0;height:0;overflow:hidden;pointer-events:none"
				);
				(document.body || document.documentElement).appendChild(svg);
			}
			let style = document.getElementById(STYLE_ID);
			if (!style) {
				style = document.createElement("style");
				style.setAttribute("id", STYLE_ID);
				style.setAttribute("data-plugin", "dsh-orca-glass");
				document.head.appendChild(style);
			}
			return { svg, style };
		}

		function render() {
			const nodes = ensureNodes();
			renderDefs(nodes.svg);
			nodes.style.textContent = css(tune);
		}

		/* ---------------- 指针跟随高光 ---------------- */
		const SPOT_SELECTOR =
			"[class*='sidebarCol'],[class*='rightbarCol'],[data-composer-card],[data-conversation-scroll] [class*='markdown'],header[class*='header']";
		let frame = 0;
		let lastEvent = null;

		function flushSpot() {
			frame = 0;
			const event = lastEvent;
			if (!event) return;
			const target = event.target;
			if (!(target instanceof Element)) return;
			const surface = target.closest(SPOT_SELECTOR);
			if (!surface) return;
			const box = surface.getBoundingClientRect();
			if (!box.width || !box.height) return;
			surface.style.setProperty(
				"--orca-lx",
				(((event.clientX - box.left) / box.width) * 100).toFixed(2) + "%"
			);
			surface.style.setProperty(
				"--orca-ly",
				(((event.clientY - box.top) / box.height) * 100).toFixed(2) + "%"
			);
		}

		function onPointerMove(event) {
			lastEvent = event;
			if (!frame) frame = window.requestAnimationFrame(flushSpot);
		}

		/* ---------------- 现场调参 API ---------------- */
		const api = {
			/** 当前参数快照。 */
			get() {
				return Object.assign({}, tune);
			},
			/** 改参数（立即重画 SVG + CSS，并记进 localStorage）。 */
			tune(patch) {
				tune = Object.assign({}, tune, patch || {});
				try {
					window.localStorage.setItem(STORE_KEY, JSON.stringify(tune));
				} catch (err) {
					/* 隐私模式写不了就只在内存里生效 */
				}
				render();
				return Object.assign({}, tune);
			},
			/** 回到默认参数。 */
			reset() {
				tune = Object.assign({}, DEFAULTS);
				try {
					window.localStorage.removeItem(STORE_KEY);
				} catch (err) {
					/* ignore */
				}
				render();
				return Object.assign({}, tune);
			},
			/** 画布上现在用的 CSS 文本（调试用）。 */
			css() {
				return css(tune);
			}
		};

		const inject = [];

		function apply(ctx) {
			ctx.effect(() => {
				render();
				document.addEventListener("pointermove", onPointerMove, { passive: true });
				window.__orcaGlass = api;
				return () => {
					document.removeEventListener("pointermove", onPointerMove);
					if (frame) window.cancelAnimationFrame(frame);
					frame = 0;
					lastEvent = null;
					if (window.__orcaGlass === api) delete window.__orcaGlass;
					const style = document.getElementById(STYLE_ID);
					if (style) style.remove();
					const svg = document.getElementById(SVG_ID);
					if (svg) svg.remove();
				};
			}, "orca-glass: liquid layer");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
