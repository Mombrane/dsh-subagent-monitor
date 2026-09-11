window.__ModuleLoader__.load({
	id: "@leetoners/dsh-ui-subagent-monitor",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		/** Every shipped language, each a complete dictionary. */
		const DICTS = {
			zh: {
				"trigger.label": "子代理",
				"trigger.title": "子代理看板",
				"panel.title": "子代理看板",
				"panel.back": "← 上一层",
				"panel.back.title": "返回上一层会话",
				"panel.close": "关闭",
				"panel.collapseRows": "收起 ▴",
				"panel.collapseRows.title": "收起子代理卡片，保留总览",
				"panel.collapseAll": "全部收起 ▴",
				"panel.collapseAll.title": "全部收起，仅留标题栏",
				"panel.expand": "展开 ▾",
				"panel.expand.title": "展开面板",
				"panel.moveGrip.title": "拖动调整位置 · 双击复位",
				"panel.resizeGrip.title": "拖动调整高度 · 双击复位",
				"summary.context": "上下文",
				"summary.main": "主会话",
				"summary.subagents": "子代理",
				"summary.running": "运行",
				"summary.done": "完成",
				"summary.failed": "异常",
				"ring.cache": "缓存",
				"ring.window": "窗口",
				"ring.usage.aria": "模型用量构成，缓存命中率 {rate}%",
				"ring.usage.aria.empty": "模型用量构成，无用量数据",
				"ring.context.aria": "主会话上下文，当前 {rate}% 窗口",
				"ring.context.aria.empty": "主会话上下文，无用量数据",
				"rows.empty.noSession": "尚未选择会话",
				"rows.empty.noActivity": "本会话暂无子代理活动",
				"row.label.provider": "[{provider}] 子代理",
				"row.label.fallback": "子代理 {id}",
				"row.mode.continuable": "连续对话",
				"row.mode.oneShot": "一次性",
				"row.open": "打开对话",
				"row.usage.cache": "缓存",
				"row.usage.context": "上下文",
				"row.usage.window": "窗口",
				"status.running": "运行中",
				"status.completed": "完成",
				"status.error": "失败",
				"status.aborted": "已打断",
				"status.maxTokens": "令牌上限",
				"status.refusal": "已拒绝",
				"status.ended": "已结束",
				"footer.stats": "运行 {running} · 完成 {done} · 异常 {failed}",
				"footer.showHidden": "显示已隐藏 {count}",
				"footer.clearDone": "清空已完成"
			},
			en: {
				"trigger.label": "Subagents",
				"trigger.title": "Subagent dashboard",
				"panel.title": "Subagents",
				"panel.back": "← Parent",
				"panel.back.title": "Back to the parent session",
				"panel.close": "Close",
				"panel.collapseRows": "Collapse ▴",
				"panel.collapseRows.title": "Collapse the subagent cards, keep the overview",
				"panel.collapseAll": "Collapse all ▴",
				"panel.collapseAll.title": "Collapse everything but the title bar",
				"panel.expand": "Expand ▾",
				"panel.expand.title": "Expand the panel",
				"panel.moveGrip.title": "Drag to reposition · double-click to reset",
				"panel.resizeGrip.title": "Drag to resize · double-click to reset",
				"summary.context": "Context",
				"summary.main": "Main",
				"summary.subagents": "Subagents",
				"summary.running": "Running",
				"summary.done": "Done",
				"summary.failed": "Failed",
				"ring.cache": "cache",
				"ring.window": "window",
				"ring.usage.aria": "Model usage breakdown, cache hit rate {rate}%",
				"ring.usage.aria.empty": "Model usage breakdown, no usage data",
				"ring.context.aria": "Main session context, {rate}% of the window",
				"ring.context.aria.empty": "Main session context, no usage data",
				"rows.empty.noSession": "No session selected",
				"rows.empty.noActivity": "No subagent activity in this session",
				"row.label.provider": "[{provider}] subagent",
				"row.label.fallback": "Subagent {id}",
				"row.mode.continuable": "continuable",
				"row.mode.oneShot": "one-shot",
				"row.open": "Open chat",
				"row.usage.cache": "cache",
				"row.usage.context": "ctx",
				"row.usage.window": "window",
				"status.running": "Running",
				"status.completed": "Done",
				"status.error": "Failed",
				"status.aborted": "Interrupted",
				"status.maxTokens": "Token limit",
				"status.refusal": "Rejected",
				"status.ended": "Ended",
				"footer.stats": "Running {running} · Done {done} · Failed {failed}",
				"footer.showHidden": "Unhide {count}",
				"footer.clearDone": "Clear done"
			}
		};
		/**
		* Narrow a host locale id to a shipped language. Regional variants ride their
		* primary subtag (`en-US` reads English); anything else — including an absent
		* id — keeps the default.
		* @param id - the host's active locale id, when it names one.
		* @returns the language whose copy the panel renders.
		*/
		function resolveLocale(id) {
			const primary = (id ?? "").split("-")[0]?.toLowerCase() ?? "";
			return Object.hasOwn(DICTS, primary) ? primary : "zh";
		}
		/**
		* Bind a translate function to one language.
		* @param locale - the language to read.
		* @returns the reader for that language's dictionary.
		*/
		function translator(locale) {
			const dict = DICTS[locale];
			return (key, params) => {
				const template = dict[key];
				if (params === void 0) return template;
				return template.replace(/\{(\w+)\}/g, (raw, name) => String(params[name] ?? raw));
			};
		}
		//#endregion
		//#region src/client/panel.tsx
		/**
		* Subagent run monitor, browser half: the sidebar footer trigger and the
		* floating panel. The panel polls the node half's snapshot route once per
		* second while the trigger stays mounted, so a page refresh recovers
		* everything without any model interaction.
		*/
		const listeners = /* @__PURE__ */ new Set();
		let state = {
			sessionId: void 0,
			now: Date.now(),
			rows: [],
			main: void 0,
			open: false,
			collapse: "none",
			hidden: [],
			locale: "zh"
		};
		let autoOpened = false;
		let polling = false;
		const commit = (patch) => {
			state = {
				...state,
				...patch
			};
			for (const listener of [...listeners]) listener();
		};
		const subscribe = (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		};
		const getSnapshot = () => state;
		const useMonitor = () => (0, react.useSyncExternalStore)(subscribe, getSnapshot);
		async function refresh(sessionId) {
			try {
				const data = await (await fetch(`/api/subagent-monitor/snapshot?sessionId=${encodeURIComponent(sessionId)}`)).json();
				if (data.sessionId !== state.sessionId) return;
				commit({
					rows: data.rows ?? [],
					main: data.main,
					now: data.now ?? Date.now()
				});
			} catch {}
		}
		let sessionsSvc;
		function setSessionsService(service) {
			sessionsSvc = service;
		}
		/**
		* Adopt the host's UI language. The plugin body calls this whenever the host
		* publishes its active locale; a language this plugin ships no copy for — and
		* a host naming none at all — leaves the panel on its default Chinese copy.
		*/
		function setLocale(id) {
			const locale = resolveLocale(id);
			if (locale !== state.locale) commit({ locale });
		}
		const UNKNOWN = {
			cls: "smn-dot-off",
			label: "status.ended"
		};
		const STATUS = {
			running: {
				cls: "smn-dot-running",
				label: "status.running"
			},
			completed: {
				cls: "smn-dot-ok",
				label: "status.completed"
			},
			error: {
				cls: "smn-dot-error",
				label: "status.error"
			},
			aborted: {
				cls: "smn-dot-warn",
				label: "status.aborted"
			},
			"max-tokens": {
				cls: "smn-dot-warn",
				label: "status.maxTokens"
			},
			refusal: {
				cls: "smn-dot-warn",
				label: "status.refusal"
			}
		};
		/** Outer 3x3 matrix cells (2px pixels on a 10px grid), clockwise from top-left. */
		const CHASE_CELLS = [
			[0, 0],
			[4, 0],
			[8, 0],
			[8, 4],
			[8, 8],
			[4, 8],
			[0, 8],
			[0, 4]
		];
		function StatusDot({ status }) {
			if (status === "running") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className: "smn-dot smn-dot-running",
				width: 10,
				height: 10,
				viewBox: "0 0 10 10",
				shapeRendering: "crispEdges",
				"aria-hidden": "true",
				children: CHASE_CELLS.map(([x, y], index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					className: "smn-dot-cell",
					x,
					y,
					width: "2",
					height: "2",
					style: { animationDelay: `${(index - CHASE_CELLS.length) * 125}ms` }
				}, `${x}-${y}`))
			});
			const meta = STATUS[status] ?? UNKNOWN;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `smn-dot ${meta.cls}`,
				"aria-hidden": "true"
			});
		}
		function fmtDuration(start, end) {
			if (start === void 0) return "—";
			const ms = (end ?? Date.now()) - start;
			if (ms < 0) return "00:00";
			const s = Math.floor(ms / 1e3);
			const h = Math.floor(s / 3600);
			const m = Math.floor(s % 3600 / 60);
			const sec = s % 60;
			const pad = (n) => String(n).padStart(2, "0");
			return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
		}
		const shortId = (id) => id === void 0 || id.length <= 8 ? id ?? "—" : id.slice(0, 8);
		function rowLabel(row, t) {
			if (typeof row.label === "string" && row.label !== "") return row.label;
			if (typeof row.provider === "string" && row.provider !== "") return t("row.label.provider", { provider: row.provider });
			return t("row.label.fallback", { id: shortId(row.id) });
		}
		const fmtTokens = (n) => {
			if (n >= 1e6) {
				const m = n / 1e6;
				return `${m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`;
			}
			if (n >= 1e3) {
				const k = n / 1e3;
				return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
			}
			return String(n);
		};
		const fmtPct = (n) => `${Math.round(n * 100)}%`;
		/** Cache-hit share of prompt tokens for one usage record. */
		function usageHitRate(usage) {
			const prompt = usage.inputTokens + usage.cacheReadTokens;
			return prompt > 0 ? fmtPct(usage.cacheReadTokens / prompt) : "—";
		}
		/** Context-window utilization of the current occupancy, when both are known. */
		function usageUtilization(usage) {
			const used = usage.projectedTokens ?? usage.pressureTokens;
			if (used === void 0 || usage.contextWindow === void 0 || usage.contextWindow <= 0) return "";
			return fmtPct(used / usage.contextWindow);
		}
		const RING_SIZE = 52;
		const RING_RADIUS = 20;
		const RING_STROKE = 6;
		const RING_GAP = 1.5;
		/**
		* Pure-SVG cache donut for the summary strip. One ring, three segments — the
		* prompt side split into uncached input vs cache-hit input, plus output —
		* with the cache-hit rate in the center. Zero dependency, matching the
		* panel's hand-rolled SVG approach. The stroke-dasharray trick places each
		* arc clockwise from 12 o'clock; a tiny gap separates the segments. `size`
		* scales the geometry (the two small cache rings use 34).
		*/
		function RingChart(props) {
			const size = props.size ?? RING_SIZE;
			const radius = RING_RADIUS * (size / RING_SIZE);
			const stroke = RING_STROKE * (size / RING_SIZE);
			const gap = RING_GAP * (size / RING_SIZE);
			const segments = [
				{
					value: props.uncachedInput,
					cls: "smn-ring-seg-uncached"
				},
				{
					value: props.cachedInput,
					cls: "smn-ring-seg-cached"
				},
				{
					value: props.output,
					cls: "smn-ring-seg-output"
				}
			];
			const total = segments.reduce((acc, seg) => acc + seg.value, 0);
			const hasData = total > 0;
			const c = size / 2;
			const circ = 2 * Math.PI * radius;
			const visible = segments.filter((seg) => seg.value > 0);
			const usable = hasData ? circ - gap * visible.length : 0;
			let acc = 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				className: "smn-ring" + (size < RING_SIZE ? " smn-ring-sm" : ""),
				width: size,
				height: size,
				viewBox: "0 0 " + size + " " + size,
				role: "img",
				"aria-label": props.hitRate !== void 0 ? props.t("ring.usage.aria", { rate: Math.round(props.hitRate * 100) }) : props.t("ring.usage.aria.empty"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						className: "smn-ring-bg",
						cx: c,
						cy: c,
						r: radius,
						fill: "none",
						strokeWidth: stroke
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("g", {
						transform: "rotate(-90 " + c + " " + c + ")",
						children: hasData ? visible.map((seg) => {
							const len = seg.value / total * usable;
							const el = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								className: "smn-ring-seg " + seg.cls,
								cx: c,
								cy: c,
								r: radius,
								fill: "none",
								strokeWidth: stroke,
								strokeDasharray: Math.max(0, len - gap) + " " + circ,
								strokeDashoffset: -acc
							}, seg.cls);
							acc += len;
							return el;
						}) : null
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
						className: "smn-ring-pct",
						x: c,
						y: c - size * .02,
						textAnchor: "middle",
						dominantBaseline: "central",
						children: props.hitRate !== void 0 ? Math.round(props.hitRate * 100) + "%" : "—"
					}),
					hasData ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
						className: "smn-ring-label",
						x: c,
						y: c + size * .18,
						textAnchor: "middle",
						dominantBaseline: "central",
						children: props.t("ring.cache")
					}) : null
				]
			});
		}
		/**
		* Main-session context-window ring. The ring's circumference is the model
		* context window (when the route advertises one); the filled arc is the
		* CURRENT context occupancy — what the next request's prompt would cost,
		* folded from the newest provider usage sample plus the heuristic surface
		* movement since (a compaction shadow shrinks it the moment content is
		* replaced, so the ring drops after compression). Center shows occupancy as
		* a percentage of the window. With no contextWindow the ring fills on the
		* used figure instead.
		*/
		function ContextRing(props) {
			const u = props.usage;
			const used = u?.projectedTokens ?? u?.pressureTokens ?? u?.contextTokens ?? 0;
			const cap = u?.contextWindow;
			const total = cap !== void 0 && cap > 0 ? cap : used;
			const hasData = used > 0;
			const size = props.size ?? 56;
			const radius = size * (22 / 56);
			const stroke = size * (7 / 56);
			const gap = 1.5;
			const c = size / 2;
			const circ = 2 * Math.PI * radius;
			const frac = total > 0 ? Math.min(1, used / total) : 0;
			const usable = hasData && total > 0 ? circ - gap : 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				className: "smn-ring smn-ctx",
				width: size,
				height: size,
				viewBox: "0 0 " + size + " " + size,
				role: "img",
				"aria-label": hasData && total > 0 ? props.t("ring.context.aria", { rate: Math.round(frac * 100) }) : props.t("ring.context.aria.empty"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						className: "smn-ring-bg",
						cx: c,
						cy: c,
						r: radius,
						fill: "none",
						strokeWidth: stroke
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("g", {
						transform: "rotate(-90 " + c + " " + c + ")",
						children: hasData && total > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
							className: "smn-ring-seg smn-ctx-seg-input",
							cx: c,
							cy: c,
							r: radius,
							fill: "none",
							strokeWidth: stroke,
							strokeDasharray: Math.max(0, frac * usable - gap) + " " + circ
						}) : null
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
						className: "smn-ring-pct",
						x: c,
						y: c - 1,
						textAnchor: "middle",
						dominantBaseline: "central",
						children: hasData && total > 0 ? Math.round(frac * 100) + "%" : "—"
					}),
					hasData ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
						className: "smn-ring-label",
						x: c,
						y: c + size * .18,
						textAnchor: "middle",
						dominantBaseline: "central",
						children: props.t("ring.window")
					}) : null
				]
			});
		}
		const MOBILE_QUERY = "(max-width: 768px)";
		const POSITION_KEY = "dsh-smn.panel-position.v1";
		const HEIGHT_KEY_PREFIX = "dsh-smn.panel-height.v2.";
		const DEFAULT_TOP = 80;
		const EDGE = 8;
		const MIN_HEIGHT = 240;
		const heights = /* @__PURE__ */ new Map();
		let heightKey = "";
		let layout = {
			left: null,
			top: null,
			height: null
		};
		let positionLoaded = false;
		/** Load the shared position once per page. */
		function loadPosition() {
			if (positionLoaded) return;
			positionLoaded = true;
			try {
				const raw = window.localStorage.getItem(POSITION_KEY);
				if (raw !== null) {
					const parsed = JSON.parse(raw);
					if (typeof parsed.left === "number" && Number.isFinite(parsed.left)) layout.left = parsed.left;
					if (typeof parsed.top === "number" && Number.isFinite(parsed.top)) layout.top = parsed.top;
					if (layout.left === null || layout.top === null) {
						layout.left = null;
						layout.top = null;
					}
				}
			} catch {}
		}
		/** Bind the height slot to the current session's bucket. */
		function bindHeight(sessionId) {
			const key = sessionId ?? "__global__";
			if (key === heightKey) return;
			heightKey = key;
			const cached = heights.get(key);
			if (cached !== void 0) {
				layout.height = cached;
				clampLayout();
				return;
			}
			let h = null;
			try {
				const raw = window.localStorage.getItem(HEIGHT_KEY_PREFIX + key);
				if (raw !== null) {
					const parsed = JSON.parse(raw);
					if (typeof parsed.height === "number" && Number.isFinite(parsed.height)) h = parsed.height;
				}
			} catch {}
			heights.set(key, h);
			layout.height = h;
			clampLayout();
		}
		function savePosition() {
			try {
				window.localStorage.setItem(POSITION_KEY, JSON.stringify({
					left: layout.left,
					top: layout.top
				}));
			} catch {}
		}
		function saveHeight() {
			try {
				window.localStorage.setItem(HEIGHT_KEY_PREFIX + heightKey, JSON.stringify({ height: layout.height }));
			} catch {}
		}
		function clampLayout() {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			if (layout.left !== null) layout.left = Math.min(Math.max(EDGE, layout.left), Math.max(EDGE, vw - 60));
			if (layout.top !== null) layout.top = Math.min(Math.max(EDGE, layout.top), Math.max(EDGE, vh - 60));
			if (layout.height !== null) {
				const top = layout.top ?? DEFAULT_TOP;
				layout.height = Math.min(Math.max(MIN_HEIGHT, layout.height), Math.max(MIN_HEIGHT, vh - top - 16));
			}
		}
		function applyLayoutStyle(el, collapsed = false) {
			if (layout.left !== null && layout.top !== null) {
				el.style.left = `${layout.left}px`;
				el.style.top = `${layout.top}px`;
				el.style.right = "auto";
			} else {
				el.style.left = "auto";
				el.style.top = `${DEFAULT_TOP}px`;
				el.style.right = "16px";
			}
			if (layout.height !== null && !collapsed) {
				el.style.height = `${layout.height}px`;
				el.style.maxHeight = "none";
			} else {
				el.style.height = "";
				el.style.maxHeight = "";
			}
		}
		function layoutStyle(collapsed = false) {
			const style = layout.left !== null && layout.top !== null ? {
				left: `${layout.left}px`,
				top: `${layout.top}px`
			} : {
				top: `${DEFAULT_TOP}px`,
				right: "16px"
			};
			if (layout.height !== null && !collapsed) {
				style.height = `${layout.height}px`;
				style.maxHeight = "none";
			}
			return style;
		}
		function Trigger(props) {
			const monitor = useMonitor();
			const current = props.useSessions((select) => select.current);
			(0, react.useEffect)(() => {
				if (current === void 0) {
					if (state.sessionId !== void 0) commit({
						sessionId: void 0,
						rows: []
					});
					return;
				}
				if (current !== state.sessionId) {
					commit({ sessionId: current });
					refresh(current);
				}
			}, [current]);
			(0, react.useEffect)(() => {
				if (polling) return;
				polling = true;
				const timer = window.setInterval(() => {
					const sid = state.sessionId;
					if (sid !== void 0) refresh(sid);
				}, 1e3);
				return () => {
					window.clearInterval(timer);
					polling = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				if (autoOpened) return;
				autoOpened = true;
				if (!window.matchMedia(MOBILE_QUERY).matches) commit({ open: true });
			}, []);
			const t = translator(monitor.locale);
			const running = monitor.rows.filter((row) => row.status === "running").length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				className: "smn-trigger",
				type: "button",
				title: t("trigger.title"),
				onClick: () => commit({ open: !state.open }),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "smn-trigger-label",
					children: t("trigger.label")
				}), running > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "smn-trigger-badge",
					children: running
				}) : null]
			});
		}
		function Panel(props) {
			const monitor = useMonitor();
			const subagentParent = props.useSessions((select) => select.currentAddress === void 0 ? void 0 : select.currentAddress.parentSessionId);
			const panelRef = (0, react.useRef)(null);
			const collapsedRef = (0, react.useRef)(monitor.collapse !== "none");
			collapsedRef.current = monitor.collapse !== "none";
			(0, react.useEffect)(() => {
				clampLayout();
				const onResize = () => {
					clampLayout();
					if (panelRef.current !== null) applyLayoutStyle(panelRef.current, collapsedRef.current);
				};
				window.addEventListener("resize", onResize);
				return () => {
					window.removeEventListener("resize", onResize);
				};
			}, []);
			(0, react.useEffect)(() => {
				if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.collapse !== "none");
			}, [monitor.collapse]);
			if (!monitor.open) return null;
			const t = translator(monitor.locale);
			loadPosition();
			bindHeight(monitor.sessionId);
			const ordered = [...monitor.rows].sort((a, b) => {
				const ka = a.startedAt ?? a.sortKey ?? Number.NEGATIVE_INFINITY;
				return (b.startedAt ?? b.sortKey ?? Number.NEGATIVE_INFINITY) - ka;
			});
			const running = ordered.filter((row) => row.status === "running").length;
			const visible = ordered.filter((row) => !monitor.hidden.includes(row.id));
			const done = visible.filter((row) => row.status === "completed").length;
			const failed = visible.filter((row) => row.status === "error" || row.status === "aborted" || row.status === "max-tokens" || row.status === "refusal").length;
			const sessionId = monitor.sessionId;
			const totals = visible.filter((row) => row.usage !== void 0).reduce((acc, row) => ({
				inputTokens: acc.inputTokens + row.usage.inputTokens,
				outputTokens: acc.outputTokens + row.usage.outputTokens,
				cacheReadTokens: acc.cacheReadTokens + row.usage.cacheReadTokens,
				cacheWriteTokens: acc.cacheWriteTokens + row.usage.cacheWriteTokens,
				contextTokens: acc.contextTokens + row.usage.contextTokens
			}), {
				inputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
				contextTokens: 0
			});
			const cacheHitRate = totals.inputTokens + totals.cacheReadTokens > 0 ? totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens) : void 0;
			const main = monitor.main;
			const mainHitRate = main !== void 0 && main.inputTokens + main.cacheReadTokens > 0 ? main.cacheReadTokens / (main.inputTokens + main.cacheReadTokens) : void 0;
			const statusMax = Math.max(running, done, failed, 1);
			const statusBar = (count, cls, label) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "smn-bar",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "smn-bar-track",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "smn-bar-fill " + cls,
							style: { height: `${count / statusMax * 100}%` }
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", {
						className: "smn-bar-count",
						children: count
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "smn-bar-label",
						children: label
					})
				]
			});
			const style = layoutStyle(monitor.collapse !== "none");
			const onMoveGripDown = (event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				const el = panelRef.current;
				if (el === null) return;
				const rect = el.getBoundingClientRect();
				const offX = event.clientX - rect.left;
				const offY = event.clientY - rect.top;
				const move = (ev) => {
					const vw = window.innerWidth;
					const vh = window.innerHeight;
					layout.left = Math.min(Math.max(EDGE, ev.clientX - offX), Math.max(EDGE, vw - rect.width - EDGE));
					layout.top = Math.min(Math.max(EDGE, ev.clientY - offY), Math.max(EDGE, vh - 60));
					applyLayoutStyle(el, monitor.collapse !== "none");
				};
				const end = () => {
					savePosition();
					window.removeEventListener("pointermove", move);
					window.removeEventListener("pointerup", end);
					window.removeEventListener("pointercancel", end);
				};
				window.addEventListener("pointermove", move);
				window.addEventListener("pointerup", end);
				window.addEventListener("pointercancel", end);
			};
			const resetPosition = () => {
				layout.left = null;
				layout.top = null;
				savePosition();
				if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.collapse !== "none");
			};
			const onResizeGripDown = (event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				const el = panelRef.current;
				if (el === null) return;
				const rect = el.getBoundingClientRect();
				const startH = rect.height;
				const startTop = rect.top;
				const startY = event.clientY;
				const move = (ev) => {
					const maxH = Math.max(MIN_HEIGHT, window.innerHeight - startTop - 16);
					layout.height = Math.min(Math.max(MIN_HEIGHT, startH + (ev.clientY - startY)), maxH);
					applyLayoutStyle(el);
				};
				const end = () => {
					saveHeight();
					window.removeEventListener("pointermove", move);
					window.removeEventListener("pointerup", end);
					window.removeEventListener("pointercancel", end);
				};
				window.addEventListener("pointermove", move);
				window.addEventListener("pointerup", end);
				window.addEventListener("pointercancel", end);
			};
			const resetHeight = () => {
				layout.height = null;
				saveHeight();
				if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.collapse !== "none");
			};
			const openChild = (row) => {
				if (sessionsSvc === void 0 || monitor.sessionId === void 0 || row.mode === void 0) return;
				const address = {
					parentSessionId: row.parentId ?? monitor.sessionId,
					childSessionId: row.id,
					mode: row.mode
				};
				sessionsSvc.openSubagent(address);
			};
			const header = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "smn-panel-header",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "smn-grip-v",
						title: t("panel.moveGrip.title"),
						"aria-hidden": "true",
						onPointerDown: onMoveGripDown,
						onDoubleClick: resetPosition,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
							className: "smn-grip-v-icon",
							width: "12",
							height: "12",
							viewBox: "0 0 12 12",
							"aria-hidden": "true",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6 0.8 7.3 3.6H4.7Z" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6 11.2 4.7 8.4H7.3Z" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M0.8 6 3.6 4.7V7.3Z" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M11.2 6 8.4 4.7V7.3Z" })
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "smn-panel-title",
						children: t("panel.title")
					}),
					subagentParent !== void 0 && sessionsSvc !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "smn-btn smn-back",
						type: "button",
						title: t("panel.back.title"),
						onClick: () => sessionsSvc?.open(subagentParent),
						children: t("panel.back")
					}) : null,
					running > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "smn-panel-running",
						children: running
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "smn-panel-spacer" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "smn-btn",
						type: "button",
						title: monitor.collapse === "none" ? t("panel.collapseRows.title") : monitor.collapse === "rows" ? t("panel.collapseAll.title") : t("panel.expand.title"),
						onClick: () => {
							const next = monitor.collapse === "none" ? "rows" : monitor.collapse === "rows" ? "all" : "none";
							commit({ collapse: next });
						},
						children: monitor.collapse === "none" ? t("panel.collapseRows") : monitor.collapse === "rows" ? t("panel.collapseAll") : t("panel.expand")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "smn-btn",
						type: "button",
						title: t("panel.close"),
						onClick: () => commit({ open: false }),
						children: "✕"
					})
				]
			});
			const summaryEl = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "smn-summary",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "smn-summary-left",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "smn-summary-rings",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "smn-ring-item",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ContextRing, {
									usage: main,
									size: 48,
									t
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "smn-ring-caption",
									children: t("summary.context")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "smn-ring-item",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RingChart, {
									size: 48,
									uncachedInput: main?.inputTokens ?? 0,
									cachedInput: main?.cacheReadTokens ?? 0,
									output: main?.outputTokens ?? 0,
									hitRate: mainHitRate,
									t
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "smn-ring-caption",
									children: t("summary.main")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "smn-ring-item",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RingChart, {
									size: 48,
									uncachedInput: totals.inputTokens,
									cachedInput: totals.cacheReadTokens,
									output: totals.outputTokens,
									hitRate: cacheHitRate,
									t
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "smn-ring-caption",
									children: t("summary.subagents")
								})]
							})
						]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "smn-chart",
					children: [
						statusBar(running, "smn-bar-running", t("summary.running")),
						statusBar(done, "smn-bar-ok", t("summary.done")),
						statusBar(failed, "smn-bar-err", t("summary.failed"))
					]
				})]
			});
			if (monitor.collapse === "all") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "smn-panel",
				style,
				ref: panelRef,
				children: header
			});
			const rowsEl = visible.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "smn-empty",
				children: sessionId === void 0 ? t("rows.empty.noSession") : t("rows.empty.noActivity")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "smn-rows",
				children: visible.map((row) => {
					const meta = STATUS[row.status] ?? UNKNOWN;
					const elapsed = row.status === "running" ? fmtDuration(row.startedAt, state.now) : fmtDuration(row.startedAt, row.endedAt);
					const modeText = row.mode === "continuable" ? t("row.mode.continuable") : row.mode === "one-shot" ? t("row.mode.oneShot") : "";
					const metaLine = [
						row.provider,
						modeText,
						shortId(row.id)
					].filter((value) => typeof value === "string" && value !== "").join(" · ");
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "smn-row",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "smn-row-main",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusDot, { status: row.status }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "smn-row-label",
										title: rowLabel(row, t),
										children: rowLabel(row, t)
									}),
									row.mode !== void 0 && sessionsSvc !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "smn-btn smn-row-open",
										type: "button",
										onClick: () => openChild(row),
										children: t("row.open")
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "smn-row-foot",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "smn-row-meta",
									children: metaLine !== "" ? metaLine : "\xA0"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "smn-row-time",
									children: row.status === "running" ? `${elapsed} · ${t(meta.label)}` : `${t(meta.label)} · ${elapsed}`
								})]
							}),
							row.usage !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "smn-row-usage",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										"↑",
										fmtTokens(row.usage.inputTokens),
										" ↓",
										fmtTokens(row.usage.outputTokens)
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("row.usage.cache"),
										" ",
										usageHitRate(row.usage)
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("row.usage.context"),
										" ",
										fmtTokens(row.usage.contextTokens)
									] }),
									usageUtilization(row.usage) !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("row.usage.window"),
										" ",
										usageUtilization(row.usage)
									] }) : null
								]
							}) : null
						]
					}, row.id);
				})
			});
			const footer = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "smn-panel-footer",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "smn-panel-stats",
						children: t("footer.stats", {
							running,
							done,
							failed
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "smn-panel-spacer" }),
					monitor.hidden.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "smn-btn",
						type: "button",
						onClick: () => commit({ hidden: [] }),
						children: t("footer.showHidden", { count: monitor.hidden.length })
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "smn-btn",
						type: "button",
						onClick: () => {
							const hidden = [...state.hidden];
							for (const row of state.rows) if (row.status !== "running" && !hidden.includes(row.id)) hidden.push(row.id);
							commit({ hidden });
						},
						children: t("footer.clearDone")
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "smn-panel",
				style,
				ref: panelRef,
				children: [
					header,
					summaryEl,
					monitor.collapse !== "rows" ? rowsEl : null,
					footer,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "smn-grip-h",
						title: t("panel.resizeGrip.title"),
						"aria-hidden": "true",
						onPointerDown: onResizeGripDown,
						onDoubleClick: resetHeight,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "smn-grip-h-bar" })
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots", "sessions"];
		function apply(ctx) {
			setSessionsService(ctx.get("sessions"));
			ctx.inject(["locale"], (localeCtx) => {
				localeCtx.effect(() => {
					const locale = localeCtx.get("locale");
					if (locale === void 0) return () => {};
					const adopt = () => {
						setLocale(locale.getLocale().active);
					};
					try {
						adopt();
						const unsubscribe = locale.subscribe(adopt);
						return () => {
							unsubscribe();
							setLocale(void 0);
						};
					} catch {
						setLocale(void 0);
						return () => {};
					}
				}, "ui-subagent-monitor: host locale");
			});
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "@leetoners/dsh-ui-subagent-monitor";
				tag.textContent = `
.smn-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--dsw-alias-brand-primary, #2563eb);
  background: var(--dsw-alias-brand-primary, #2563eb);
  color: #ffffff;
  border-radius: 8px; padding: 4px 10px; font-size: 12px;
  line-height: 18px; cursor: pointer; font-weight: 500;
  font-family: var(--dsw-font-family, inherit);
}
.smn-trigger:hover { filter: brightness(1.06); }
.smn-trigger-label { font-size: 12px; }
.smn-trigger-badge {
  min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px;
  background: #ffffff; color: var(--dsw-alias-brand-primary, #2563eb);
  font-size: 10px; line-height: 16px; display: inline-flex;
  align-items: center; justify-content: center; font-weight: 600;
}
.smn-panel {
  pointer-events: auto;
  position: fixed; width: 340px; max-height: min(560px, calc(100vh - 160px));
  display: flex; flex-direction: column;
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-base, #ffffff));
  border: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.08));
  border-radius: 12px;
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(15, 23, 42, 0.12));
  font-family: var(--dsw-font-family, inherit);
  font-size: 12px; overflow: hidden; z-index: 2147483000;
}
/* Move grip: a small handle sitting left of the panel title, only in the header. */
.smn-grip-v {
  flex: none; width: 18px; height: 20px; cursor: grab;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px;
  user-select: none; -webkit-user-select: none; touch-action: none;
}
.smn-grip-v:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.05)); }
.smn-grip-v:active { cursor: grabbing; }
.smn-grip-v-icon {
  flex: none; fill: currentColor;
  color: var(--dsw-alias-label-tertiary, #cbd5e1); opacity: 0.55;
}
.smn-grip-v:hover .smn-grip-v-icon { color: var(--dsw-alias-label-primary, inherit); opacity: 1; }
.smn-grip-h {
  flex: none; height: 12px; cursor: ns-resize;
  display: flex; align-items: center; justify-content: center;
  user-select: none; -webkit-user-select: none; touch-action: none;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.06));
}
.smn-grip-h:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.05)); }
.smn-grip-h-bar {
  width: 32px; height: 4px; border-radius: 2px;
  background: var(--dsw-alias-label-tertiary, #cbd5e1); opacity: 0.55;
}
.smn-grip-h:hover .smn-grip-h-bar { opacity: 1; }
.smn-panel-header {
  display: flex; align-items: center; gap: 8px; padding: 9px 12px;
  user-select: none; background: transparent;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.06));
}
.smn-panel-title { font-weight: 600; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-primary, inherit); }
.smn-panel-running { color: var(--dsw-alias-brand-primary, #2563eb); font-size: 12px; }
.smn-panel-spacer { flex: 1; }
.smn-rows {
  overflow-y: auto; flex: 1;
  display: flex; flex-direction: column; gap: 6px;
  padding: 8px;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2, rgba(15, 23, 42, 0.15));
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2, rgba(15, 23, 42, 0.25));
}
/* Empty state: like .smn-rows it owns the flexible middle (flex: 1), so a
   manually resized panel grows this region and the footer + height grip track
   the bottom edge — instead of staying pinned near the top with dead space
   left under the grip. */
.smn-empty {
  flex: 1;
  /* Shrinkable floor: any height deficit is absorbed here (never by the
     footer / height grip), so the grip always stays visible and draggable. */
  min-height: 0;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  padding: 24px 12px; text-align: center;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.smn-row {
  flex: none;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.6));
  border: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.07));
  border-radius: 8px;
  box-shadow: var(--dsw-shadow-lv1, 0 2px 4px rgba(15, 23, 42, 0.04));
  /* One layer per panel: every card is a direct child, so there is no depth
     indent to express. border-box keeps every card's outer edge identical
     regardless of future padding changes. */
  box-sizing: border-box;
  padding: 7px 10px;
}
.smn-row-main { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.smn-dot { width: 10px; height: 10px; flex: none; }
/* Running: StateDot "ongoing" — pixel-art chase around the 3x3 outer ring
   (DSH sidebar tab spec: 2x2 cells, clockwise stepped brightness trail). */
.smn-dot-running { color: var(--dsw-static-deepseek-450, rgb(86, 134, 254)); }
.smn-dot-cell { fill: currentColor; opacity: 0.15; animation: smn-dot-chase 1s infinite; }
@keyframes smn-dot-chase {
  0%, 12.4% { opacity: 1; }
  12.5%, 24.9% { opacity: 0.6; }
  25%, 37.4% { opacity: 0.35; }
  37.5%, 100% { opacity: 0.15; }
}
/* Terminal states: StateDot spec — 10% same-color halo (::before) around a
   6/10 solid core (::after); the color rides currentColor per state. */
.smn-dot-ok, .smn-dot-error, .smn-dot-warn, .smn-dot-off {
  position: relative; display: inline-block;
}
.smn-dot-ok::before, .smn-dot-error::before, .smn-dot-warn::before, .smn-dot-off::before {
  content: ''; position: absolute; inset: 0; border-radius: 50%;
  background: currentColor; opacity: 0.1;
}
.smn-dot-ok::after, .smn-dot-error::after, .smn-dot-warn::after, .smn-dot-off::after {
  content: ''; position: absolute; inset: 20%; border-radius: 50%;
  background: currentColor;
}
.smn-dot-ok { color: var(--dsw-alias-state-success-primary, rgb(34, 197, 94)); }
.smn-dot-error { color: var(--dsw-alias-state-error-primary, rgb(236, 19, 19)); }
.smn-dot-warn { color: var(--dsw-alias-state-warn-primary, rgb(245, 158, 11)); }
.smn-dot-off { color: var(--dsw-alias-label-tertiary, #cbd5e1); }
.smn-row-label {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 13px; line-height: 18px;
  color: var(--dsw-alias-label-primary, inherit);
}
.smn-row-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-top: 3px; padding-left: 18px;
}
.smn-row-time { color: var(--dsw-alias-label-tertiary, #94a3b8); font-variant-numeric: tabular-nums; flex: none; font-size: 11px; line-height: 16px; }
.smn-row-meta {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-tertiary, #a3aec2); font-size: 11px; line-height: 16px;
}
.smn-row-open { flex: none; }
/* Overall dashboard strip between the header and the card list: live counts
   plus aggregate token usage / cache hit / context for the viewed layer, and
   the donut (uncached input / cached input / output) with the hit rate at its
   center. */
.smn-summary {
  flex: none;
  display: flex; flex-direction: row; align-items: center; gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.06));
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.35));
}
/* Status histogram on the summary's right: one vertical bar per state
   (running / completed / failed) scaled to the largest count, with the count
   and a short label underneath. Replaces the duplicated run/completed/failed
   text cells — the footer still carries the textual status line. */
.smn-chart {
  flex: 1; min-width: 0; height: 56px;
  display: flex; align-items: stretch; gap: 8px;
}
.smn-bar {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.smn-bar-track {
  flex: 1; width: 100%;
  display: flex; align-items: flex-end; justify-content: center;
  background: var(--dsw-alias-bg-layer-1, rgba(15, 23, 42, 0.05));
  border-radius: 3px;
}
.smn-bar-fill { width: 12px; border-radius: 2px 2px 0 0; }
.smn-bar-running { background: var(--dsw-alias-brand-primary, #2563eb); }
.smn-bar-ok { background: var(--dsw-alias-state-success-primary, rgb(34, 197, 94)); }
.smn-bar-err { background: var(--dsw-alias-state-error-primary, rgb(236, 19, 19)); }
.smn-bar-count {
  font-size: 11px; line-height: 13px; font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary, inherit);
}
.smn-bar-label { font-size: 10px; line-height: 12px; color: var(--dsw-alias-label-tertiary, #94a3b8); }
/* Donut: full background ring + three arcs (uncached input / cached input /
   output), all in the deepseek blue scale (the harness's own brand blue);
   the center text shows the cache-hit rate. */
.smn-ring { flex: none; }
.smn-ring-bg { stroke: var(--dsw-static-deepseek-100, rgb(228, 237, 253)); }
.smn-ring-seg-uncached { stroke: var(--dsw-static-deepseek-200, rgb(211, 226, 255)); }
.smn-ring-seg-cached { stroke: var(--dsw-static-deepseek-450, rgb(86, 134, 254)); }
.smn-ring-seg-output { stroke: var(--dsw-static-deepseek-500, rgb(65, 118, 230)); }
.smn-ring-pct {
  fill: var(--dsw-static-deepseek-450, rgb(86, 134, 254));
  font-size: 10px; font-weight: 600; font-variant-numeric: tabular-nums;
}
.smn-ring-label { fill: var(--dsw-static-deepseek-400, rgb(103, 158, 254)); font-size: 7px; }
/* Ring cluster (left of the summary): context-window ring + two cache rings. */
.smn-summary-left { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.smn-summary-rings { display: flex; align-items: flex-end; gap: 8px; }
.smn-ring-item { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.smn-ring-caption { font-size: 9px; line-height: 1; color: var(--dsw-alias-label-tertiary, #94a3b8); }
.smn-ring-sm .smn-ring-pct { font-size: 8px; }
.smn-ring-sm .smn-ring-label { font-size: 6px; }
/* Context-window ring slices: input (blue-200) / tool output (amber) / output (blue-500). */
.smn-ctx-seg-input { stroke: var(--dsw-static-deepseek-200, rgb(211, 226, 255)); }
.smn-ctx-seg-tool { stroke: var(--dsw-static-amber-400, rgb(247, 173, 49)); }
.smn-ctx-seg-output { stroke: var(--dsw-static-deepseek-500, rgb(65, 118, 230)); }
.smn-legend-ctx-input { background: var(--dsw-static-deepseek-200, rgb(211, 226, 255)); }
.smn-legend-ctx-tool { background: var(--dsw-static-amber-400, rgb(247, 173, 49)); }
.smn-legend-ctx-output { background: var(--dsw-static-deepseek-500, rgb(65, 118, 230)); }
/* Compact legend under the number rows, shown only while usage data exists. */
.smn-summary-legend {
  display: flex; flex-wrap: wrap; gap: 4px 10px;
  padding-top: 1px;
}
.smn-legend-item {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10px; line-height: 14px; color: var(--dsw-alias-label-tertiary, #94a3b8);
}
.smn-legend-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.smn-legend-uncached { background: var(--dsw-static-deepseek-200, rgb(211, 226, 255)); }
.smn-legend-cached { background: var(--dsw-static-deepseek-450, rgb(86, 134, 254)); }
.smn-legend-output { background: var(--dsw-static-deepseek-500, rgb(65, 118, 230)); }
/* Per-card token line under the meta row. */
.smn-row-usage {
  display: flex; flex-wrap: wrap; gap: 3px 10px;
  margin-top: 3px; padding-left: 18px;
  color: var(--dsw-alias-label-tertiary, #94a3b8);
  font-size: 10px; line-height: 15px; font-variant-numeric: tabular-nums;
}
.smn-panel-footer {
  display: flex; align-items: center; gap: 8px; padding: 7px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.06));
  background: transparent;
}
.smn-panel-stats { color: var(--dsw-alias-label-tertiary, #94a3b8); font-size: 11px; }
.smn-btn {
  border: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.12));
  background: transparent; color: var(--dsw-alias-label-primary, inherit);
  border-radius: 6px; padding: 1px 8px; font-size: 11px; line-height: 16px;
  cursor: pointer; font-family: inherit;
}
.smn-btn:hover {
  border-color: var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.3));
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.04));
}
.smn-back { color: var(--dsw-alias-brand-primary, #2563eb); border-color: var(--dsw-alias-brand-primary, #2563eb); }
@media (max-width: 768px) {
  .smn-panel { width: min(340px, calc(100vw - 24px)); }
}
`;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, "ui-subagent-monitor: styles");
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "subagent-monitor",
				order: 50
			}, Trigger));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "subagent-monitor-panel",
				order: 100
			}, Panel));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map