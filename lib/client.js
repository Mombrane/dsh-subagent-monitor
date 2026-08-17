window.__ModuleLoader__.load({
	id: "@leetoners/dsh-ui-subagent-monitor",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
			open: false,
			minimized: false,
			hidden: []
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
					now: data.now ?? Date.now()
				});
			} catch {}
		}
		let sessionsSvc;
		function setSessionsService(service) {
			sessionsSvc = service;
		}
		const UNKNOWN = {
			cls: "smn-dot-off",
			label: "已结束"
		};
		const STATUS = {
			running: {
				cls: "smn-dot-running",
				label: "运行中"
			},
			completed: {
				cls: "smn-dot-ok",
				label: "完成"
			},
			error: {
				cls: "smn-dot-error",
				label: "失败"
			},
			aborted: {
				cls: "smn-dot-warn",
				label: "已打断"
			},
			"max-tokens": {
				cls: "smn-dot-warn",
				label: "令牌上限"
			},
			refusal: {
				cls: "smn-dot-warn",
				label: "已拒绝"
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `smn-dot ${(STATUS[status] ?? UNKNOWN).cls}`,
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
		function rowLabel(row) {
			if (typeof row.label === "string" && row.label !== "") return row.label;
			if (typeof row.provider === "string" && row.provider !== "") return `[${row.provider}] 子代理`;
			return `子代理 ${shortId(row.id)}`;
		}
		const MOBILE_QUERY = "(max-width: 768px)";
		const LAYOUT_KEY = "dsh-smn.panel-layout.v1";
		const DEFAULT_TOP = 80;
		const EDGE = 8;
		const MIN_HEIGHT = 160;
		const layout = {
			left: null,
			top: null,
			height: null
		};
		let layoutLoaded = false;
		function loadLayout() {
			if (layoutLoaded) return;
			layoutLoaded = true;
			try {
				const raw = window.localStorage.getItem(LAYOUT_KEY);
				if (raw === null) return;
				const parsed = JSON.parse(raw);
				if (typeof parsed.left === "number" && Number.isFinite(parsed.left)) layout.left = parsed.left;
				if (typeof parsed.top === "number" && Number.isFinite(parsed.top)) layout.top = parsed.top;
				if (typeof parsed.height === "number" && Number.isFinite(parsed.height)) layout.height = parsed.height;
				if (layout.left === null || layout.top === null) {
					layout.left = null;
					layout.top = null;
				}
			} catch {}
		}
		function saveLayout() {
			try {
				window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
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
		function applyLayoutStyle(el, minimized = false) {
			if (layout.left !== null && layout.top !== null) {
				el.style.left = `${layout.left}px`;
				el.style.top = `${layout.top}px`;
				el.style.right = "auto";
			} else {
				el.style.left = "auto";
				el.style.top = `${DEFAULT_TOP}px`;
				el.style.right = "16px";
			}
			if (layout.height !== null && !minimized) {
				el.style.height = `${layout.height}px`;
				el.style.maxHeight = "none";
			} else {
				el.style.height = "";
				el.style.maxHeight = "";
			}
		}
		function layoutStyle(minimized = false) {
			const style = layout.left !== null && layout.top !== null ? {
				left: `${layout.left}px`,
				top: `${layout.top}px`
			} : {
				top: `${DEFAULT_TOP}px`,
				right: "16px"
			};
			if (layout.height !== null && !minimized) {
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
			const running = monitor.rows.filter((row) => row.status === "running").length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				className: "smn-trigger",
				type: "button",
				title: "运行中的子代理",
				onClick: () => commit({ open: !state.open }),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "smn-trigger-label",
					children: "子代理"
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
			const minimizedRef = (0, react.useRef)(monitor.minimized);
			minimizedRef.current = monitor.minimized;
			(0, react.useEffect)(() => {
				loadLayout();
				clampLayout();
				saveLayout();
				const onResize = () => {
					clampLayout();
					if (panelRef.current !== null) applyLayoutStyle(panelRef.current, minimizedRef.current);
				};
				window.addEventListener("resize", onResize);
				return () => {
					window.removeEventListener("resize", onResize);
				};
			}, []);
			(0, react.useEffect)(() => {
				if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.minimized);
			}, [monitor.minimized]);
			if (!monitor.open) return null;
			const ordered = [...monitor.rows].sort((a, b) => {
				const ka = a.startedAt ?? a.sortKey ?? Number.NEGATIVE_INFINITY;
				return (b.startedAt ?? b.sortKey ?? Number.NEGATIVE_INFINITY) - ka;
			});
			const running = ordered.filter((row) => row.status === "running").length;
			const visible = ordered.filter((row) => !monitor.hidden.includes(row.id));
			const done = visible.filter((row) => row.status === "completed").length;
			const failed = visible.filter((row) => row.status === "error" || row.status === "aborted" || row.status === "max-tokens" || row.status === "refusal").length;
			const sessionId = monitor.sessionId;
			const style = layoutStyle(monitor.minimized);
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
					applyLayoutStyle(el, monitor.minimized);
				};
				const end = () => {
					saveLayout();
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
				saveLayout();
				if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.minimized);
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
					saveLayout();
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
				saveLayout();
				if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.minimized);
			};
			const openChild = (row) => {
				if (sessionsSvc === void 0 || monitor.sessionId === void 0 || row.mode === void 0) return;
				const address = {
					parentSessionId: monitor.sessionId,
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
						title: "拖动调整位置 · 双击复位",
						"aria-hidden": "true",
						onPointerDown: onMoveGripDown,
						onDoubleClick: resetPosition,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "smn-grip-v-dots" })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "smn-panel-title",
						children: "运行中的子代理"
					}),
					subagentParent !== void 0 && sessionsSvc !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "smn-btn smn-back",
						type: "button",
						title: "返回主会话",
						onClick: () => sessionsSvc?.open(subagentParent),
						children: "← 主会话"
					}) : null,
					running > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "smn-panel-running",
						children: running
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "smn-panel-spacer" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "smn-btn",
						type: "button",
						title: monitor.minimized ? "展开面板" : "收起面板",
						onClick: () => commit({ minimized: !state.minimized }),
						children: monitor.minimized ? "展开 ▾" : "收起 ▴"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "smn-btn",
						type: "button",
						title: "关闭",
						onClick: () => commit({ open: false }),
						children: "✕"
					})
				]
			});
			if (monitor.minimized) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "smn-panel",
				style,
				ref: panelRef,
				children: header
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "smn-panel",
				style,
				ref: panelRef,
				children: [
					header,
					visible.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "smn-empty",
						children: sessionId === void 0 ? "尚未选择会话" : "本会话暂无子代理活动"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "smn-rows",
						children: visible.map((row) => {
							const meta = STATUS[row.status] ?? UNKNOWN;
							const elapsed = row.status === "running" ? fmtDuration(row.startedAt, state.now) : fmtDuration(row.startedAt, row.endedAt);
							const depth = typeof row.depth === "number" ? row.depth : 1;
							const indent = Math.max(0, depth - 1) * 14;
							const modeText = row.mode === "continuable" ? "连续对话" : row.mode === "one-shot" ? "一次性" : "";
							const metaLine = [
								row.provider,
								modeText,
								shortId(row.id)
							].filter((value) => typeof value === "string" && value !== "").join(" · ");
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "smn-row",
								style: { marginLeft: indent },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "smn-row-main",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusDot, { status: row.status }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "smn-row-label",
											title: rowLabel(row),
											children: rowLabel(row)
										}),
										row.mode !== void 0 && sessionsSvc !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "smn-btn smn-row-open",
											type: "button",
											onClick: () => openChild(row),
											children: "打开对话"
										}) : null
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "smn-row-foot",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "smn-row-meta",
										children: metaLine !== "" ? metaLine : "\xA0"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "smn-row-time",
										children: row.status === "running" ? `${elapsed} · ${meta.label}` : `${meta.label} · ${elapsed}`
									})]
								})]
							}, row.id);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "smn-panel-footer",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "smn-panel-stats",
								children: `运行 ${running} · 完成 ${done} · 异常 ${failed}`
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "smn-panel-spacer" }),
							monitor.hidden.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "smn-btn",
								type: "button",
								onClick: () => commit({ hidden: [] }),
								children: `显示已隐藏 ${monitor.hidden.length}`
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "smn-btn",
								type: "button",
								onClick: () => {
									const hidden = [...state.hidden];
									for (const row of state.rows) if (row.status !== "running" && !hidden.includes(row.id)) hidden.push(row.id);
									commit({ hidden });
								},
								children: "清空已完成"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "smn-grip-h",
						title: "拖动调整高度 · 双击复位",
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
  flex: none; width: 14px; height: 20px; cursor: grab;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px;
  user-select: none; -webkit-user-select: none; touch-action: none;
}
.smn-grip-v:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.05)); }
.smn-grip-v:active { cursor: grabbing; }
.smn-grip-v-dots {
  width: 6px; height: 14px;
  background-image: radial-gradient(circle, var(--dsw-alias-label-tertiary, #cbd5e1) 1.2px, transparent 1.8px);
  background-size: 6px 6px; background-repeat: repeat-y; background-position: center top;
  opacity: 0.55;
}
.smn-grip-v:hover .smn-grip-v-dots { opacity: 1; }
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
.smn-empty { padding: 24px 12px; text-align: center; color: var(--dsw-alias-label-tertiary, #94a3b8); }
.smn-row {
  flex: none;
  background: var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.6));
  border: 1px solid var(--dsw-alias-border-l1, rgba(15, 23, 42, 0.07));
  border-radius: 8px;
  box-shadow: var(--dsw-shadow-lv1, 0 2px 4px rgba(15, 23, 42, 0.04));
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