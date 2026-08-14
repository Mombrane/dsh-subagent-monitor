//#region src/index.ts
const MAX_PER_ROOT = 200;
const inject = [
	"sessions",
	"subagents",
	"webServer"
];
function apply(ctx) {
	const runs = /* @__PURE__ */ new Map();
	const str = (value) => typeof value === "string" ? value : String(value);
	const rootOf = (childId) => {
		let cur = ctx.sessions.get(childId);
		let hops = 0;
		while (cur !== void 0 && hops < 32) {
			const pid = cur.header.parentSession;
			if (pid === void 0) return str(cur.id);
			cur = ctx.sessions.get(pid);
			hops += 1;
		}
	};
	const prune = () => {
		const counts = /* @__PURE__ */ new Map();
		for (const row of runs.values()) counts.set(row.rootId, (counts.get(row.rootId) ?? 0) + 1);
		for (const [rootId, count] of counts) {
			if (count <= MAX_PER_ROOT) continue;
			let excess = count - MAX_PER_ROOT;
			const rows = [...runs.values()].filter((row) => row.rootId === rootId && row.status !== "running").sort((a, b) => a.startedAt - b.startedAt);
			for (const row of rows) {
				if (excess <= 0) break;
				runs.delete(row.runId);
				excess -= 1;
			}
		}
	};
	const onStart = (info) => {
		const childId = str(info.id);
		const root = rootOf(childId);
		if (root === void 0) return;
		runs.set(str(info.runId), {
			runId: str(info.runId),
			id: childId,
			provider: info.provider,
			local: info.local,
			rootId: root,
			startedAt: Date.now(),
			status: "running"
		});
		prune();
	};
	const onEnd = (info) => {
		const row = runs.get(str(info.runId));
		if (row === void 0) return;
		row.status = info.stopReason;
		row.endedAt = Date.now();
	};
	ctx.on("subagent/start", onStart, { global: true });
	ctx.on("subagent/end", onEnd, { global: true });
	const enrich = async (sessionId) => {
		let desc = [];
		try {
			desc = await ctx.subagents.listDescendants(sessionId);
		} catch {
			desc = [];
		}
		const eventRows = [];
		for (const row of runs.values()) if (row.rootId === sessionId) eventRows.push({ ...row });
		eventRows.sort((a, b) => a.startedAt - b.startedAt);
		const merged = [];
		const seen = /* @__PURE__ */ new Set();
		for (let index = 0; index < desc.length; index++) {
			const entry = desc[index];
			if (entry === void 0) continue;
			const id = str(entry.id);
			seen.add(id);
			const base = {
				id,
				...entry.kind === "child" && entry.label !== void 0 ? { label: entry.label } : {},
				...entry.kind === "child" ? { mode: entry.mode } : {},
				depth: entry.depth,
				parentId: str(entry.parentId)
			};
			const ev = eventRows.find((row) => row.id === id);
			if (ev !== void 0) merged.push({
				...base,
				...ev
			});
			else merged.push({
				...base,
				local: true,
				sortKey: -(desc.length - index),
				status: entry.kind === "child" && entry.activity === "running" ? "running" : "unknown"
			});
		}
		for (const ev of eventRows) if (!seen.has(ev.id)) merged.push({
			...ev,
			depth: 0
		});
		merged.sort((a, b) => {
			const ka = a.startedAt ?? a.sortKey ?? Number.NEGATIVE_INFINITY;
			return (b.startedAt ?? b.sortKey ?? Number.NEGATIVE_INFINITY) - ka;
		});
		return merged;
	};
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/api/subagent-monitor/snapshot",
		handler: async (req, res) => {
			const sessionId = new URL(req.url ?? "/", "http://localhost").searchParams.get("sessionId");
			const payload = sessionId === null ? {
				now: Date.now(),
				rows: []
			} : {
				sessionId,
				now: Date.now(),
				rows: await enrich(sessionId)
			};
			res.writeHead(200, {
				"content-type": "application/json",
				"cache-control": "no-store"
			});
			res.end(JSON.stringify(payload));
		}
	}), "ui-subagent-monitor: snapshot route");
}
//#endregion
export { apply, inject };
