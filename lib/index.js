//#region src/index.ts
const MAX_PER_PARENT = 200;
const inject = [
	"sessions",
	"subagents",
	"webServer"
];
const zeroBuckets = () => ({
	uncachedInputTokens: 0,
	outputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0
});
const bucketsOf = (usage) => ({
	uncachedInputTokens: usage.inputTokens,
	outputTokens: usage.outputTokens,
	cacheReadTokens: usage.cacheReadTokens ?? 0,
	cacheWriteTokens: usage.cacheWriteTokens ?? 0
});
const bucketsEqual = (left, right) => left.uncachedInputTokens === right.uncachedInputTokens && left.outputTokens === right.outputTokens && left.cacheReadTokens === right.cacheReadTokens && left.cacheWriteTokens === right.cacheWriteTokens;
/** Replace one step's earlier sample instead of double counting it. */
const addReplacing = (totals, previous, next) => ({
	uncachedInputTokens: totals.uncachedInputTokens - (previous?.uncachedInputTokens ?? 0) + next.uncachedInputTokens,
	outputTokens: totals.outputTokens - (previous?.outputTokens ?? 0) + next.outputTokens,
	cacheReadTokens: totals.cacheReadTokens - (previous?.cacheReadTokens ?? 0) + next.cacheReadTokens,
	cacheWriteTokens: totals.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0) + next.cacheWriteTokens
});
/** The usage a step reports, from a final message or an early usage chunk. */
const usageOf = (event) => {
	if (event.type === "assistant/message") return event.data.usage;
	if (event.type === "assistant/chunk") {
		const chunk = event.data.chunk;
		return chunk.type === "usage" ? chunk.usage : void 0;
	}
};
const stepOf = (event) => event.data;
/** Fixed-density heuristic matching @deepseek-ai/dsh-token-meter's estimate. */
const CHARS_PER_TOKEN = 4;
const BLOCK_OVERHEAD = 4;
const ROLE_OVERHEAD = 4;
/**
* Price a content-block list under the meter's fixed density (chars / 4 plus
* per-block structural overhead). Tool outputs are not reported by providers,
* so the context ring's "tool output" slice is this heuristic over
* 'tool/result' message content — the same estimate the harness itself uses.
*/
function estimateContentTokens(blocks) {
	let tokens = 0;
	for (const block of blocks) {
		const b = block;
		switch (b.type) {
			case "text":
			case "reasoning":
				tokens += Math.ceil((b.text ?? "").length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD;
				break;
			case "tool-result":
				tokens += estimateContentTokens(b.content ?? []) + BLOCK_OVERHEAD;
				break;
			default: tokens += BLOCK_OVERHEAD + Math.ceil(JSON.stringify(block).length / CHARS_PER_TOKEN);
		}
	}
	return tokens;
}
/**
* The model-visible message an event derives to, mirroring the session
* surface's projection rule: only 'user/message', 'assistant/message' (with
* content) and 'tool/result' produce a priced message; everything else is
* trace/replay data. The returned object is the message's content slice only.
*/
const surfaceMessageOf = (event) => {
	switch (event.type) {
		case "user/message": {
			const data = event.data;
			return data.content !== void 0 ? { content: data.content } : null;
		}
		case "assistant/message": {
			const message = event.data.message;
			if (message === void 0 || (message.content ?? []).length === 0) return null;
			return message;
		}
		case "tool/result": {
			const message = event.data.message;
			return message !== void 0 ? message : null;
		}
		default: return null;
	}
};
/**
* Signed surface movement for one event plus the shadow-price claim to carry
* forward — the same O(1) protocol the harness's surface projection uses. A
* 'compaction/summary'/'compaction/prune' event arms a claim priced by its
* logged shadowed token count; the immediately following surface replacement
* consumes it and subtracts that price from the running surface total (so a
* compaction visibly shrinks current occupancy). A replacement without an
* armed claim folds with zero delta because the bounded state cannot
* reconstruct the replaced range.
*/
const foldSurface = (claim, event) => {
	const type = event.type;
	if (type === "compaction/summary" || type === "compaction/prune") {
		const data = event.data;
		const range = data?.shadowedRange;
		if (range !== void 0 && typeof range.start === "number" && typeof range.end === "number" && typeof data?.shadowedTokenCount === "number") return {
			deltaTokens: 0,
			claim: {
				start: range.start,
				end: range.end,
				tokens: data.shadowedTokenCount
			}
		};
		return {
			deltaTokens: 0,
			claim: void 0
		};
	}
	const raw = event;
	if (raw.surfaceOp === void 0) return {
		deltaTokens: 0,
		claim: void 0
	};
	const message = surfaceMessageOf(event);
	const tokens = message === null ? 0 : estimateContentTokens(message.content) + ROLE_OVERHEAD;
	if (raw.surfaceOp === "append") return {
		deltaTokens: tokens,
		claim: void 0
	};
	const op = raw.surfaceOp;
	if (claim === void 0 || op.start !== claim.start || op.end !== claim.end) return {
		deltaTokens: 0,
		claim: void 0
	};
	return {
		deltaTokens: tokens - claim.tokens,
		claim: void 0
	};
};
/**
* Fold new events into state from its watermark. Mirrors the token-meter's
* tokenUsage + contextPressure projections: provider usage buckets are summed
* with same-step replacement, 'request/context' supplies the context window,
* the newest usage sample sets the prompt-side pressure, and 'tool/result'
* content is priced heuristically into the tool-output bucket. The surface
* fold (appends price each message, compaction replacements subtract their
* shadow price) carries the sample forward so current occupancy
* (`projectedTokens`) reacts the moment a compaction shadows a span. A usage
* sample is stamped against the surface BEFORE the same event joins it, so it
* anchors against the surface its own request saw.
*/
function foldUsage(state, events) {
	let index = state.consumedEvents;
	for (; index < events.length; index++) {
		const event = events[index];
		if (event === void 0) continue;
		if (event.type === "request/context") {
			const contextWindow = event.data.contextWindow;
			if (contextWindow !== void 0) state.contextWindow = contextWindow;
			continue;
		}
		if (event.type === "tool/result") {
			const message = event.data.message;
			if (message?.content !== void 0) state.toolOutputTokens += estimateContentTokens(message.content);
		}
		const usage = usageOf(event);
		const fold = foldSurface(state.claim, event);
		state.claim = fold.claim;
		if (usage !== void 0) {
			const buckets = bucketsOf(usage);
			const { turn, step } = stepOf(event);
			const previous = state.last !== null && state.last.turn === turn && state.last.step === step ? state.last.buckets : void 0;
			if (previous === void 0 || !bucketsEqual(previous, buckets)) {
				state.totals = addReplacing(state.totals, previous, buckets);
				state.last = {
					turn,
					step,
					buckets
				};
				state.pressureTokens = buckets.uncachedInputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens;
				state.sampledSurfaceTokens = state.surfaceTokens;
			}
		}
		if (fold.deltaTokens !== 0) state.surfaceTokens += fold.deltaTokens;
	}
	state.consumedEvents = index;
}
function apply(ctx) {
	const runs = /* @__PURE__ */ new Map();
	const usageCache = /* @__PURE__ */ new Map();
	const str = (value) => typeof value === "string" ? value : String(value);
	const toUsageData = (state) => {
		const { totals } = state;
		if (totals.uncachedInputTokens === 0 && totals.outputTokens === 0 && totals.cacheReadTokens === 0 && totals.cacheWriteTokens === 0) return;
		const projectedTokens = state.pressureTokens !== void 0 && state.sampledSurfaceTokens !== void 0 ? Math.max(0, state.pressureTokens + state.surfaceTokens - state.sampledSurfaceTokens) : void 0;
		return {
			inputTokens: totals.uncachedInputTokens,
			outputTokens: totals.outputTokens,
			cacheReadTokens: totals.cacheReadTokens,
			cacheWriteTokens: totals.cacheWriteTokens,
			contextTokens: totals.uncachedInputTokens + totals.cacheReadTokens + totals.cacheWriteTokens,
			toolOutputTokens: state.toolOutputTokens,
			...state.contextWindow !== void 0 ? { contextWindow: state.contextWindow } : {},
			...state.pressureTokens !== void 0 ? { pressureTokens: state.pressureTokens } : {},
			...projectedTokens !== void 0 ? { projectedTokens } : {}
		};
	};
	const parentOf = (childId) => {
		const parent = ctx.sessions.get(childId)?.header.parentSession;
		return parent === void 0 ? void 0 : str(parent);
	};
	const prune = () => {
		const counts = /* @__PURE__ */ new Map();
		for (const row of runs.values()) counts.set(row.parentId, (counts.get(row.parentId) ?? 0) + 1);
		for (const [parentId, count] of counts) {
			if (count <= MAX_PER_PARENT) continue;
			let excess = count - MAX_PER_PARENT;
			const rows = [...runs.values()].filter((row) => row.parentId === parentId && row.status !== "running").sort((a, b) => a.startedAt - b.startedAt);
			for (const row of rows) {
				if (excess <= 0) break;
				runs.delete(row.runId);
				excess -= 1;
			}
		}
	};
	const onStart = (info) => {
		const childId = str(info.id);
		const parentId = parentOf(childId);
		if (parentId === void 0) return;
		runs.set(str(info.runId), {
			runId: str(info.runId),
			id: childId,
			provider: info.provider,
			local: info.local,
			parentId,
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
	/**
	* Fold one child's usage. Live children serve their in-memory events
	* incrementally; a cold child is inspected from persistence exactly once per
	* process lifetime (the watermark cache then serves it). A missing optional
	* 'sessionPersistence' or an unreadable log degrades to undefined.
	*/
	const childUsage = async (childId) => {
		const live = ctx.sessions.get(childId);
		if (live !== void 0) {
			let state = usageCache.get(childId);
			if (state === void 0) {
				state = {
					consumedEvents: 0,
					totals: zeroBuckets(),
					toolOutputTokens: 0,
					last: null,
					surfaceTokens: 0,
					claim: void 0
				};
				usageCache.set(childId, state);
			}
			foldUsage(state, live.events);
			return toUsageData(state);
		}
		const cached = usageCache.get(childId);
		if (cached !== void 0) return toUsageData(cached);
		const persistence = ctx.get("sessionPersistence");
		if (persistence === void 0) return void 0;
		try {
			const inspected = await persistence.inspect(childId);
			const state = {
				consumedEvents: 0,
				totals: zeroBuckets(),
				toolOutputTokens: 0,
				last: null,
				surfaceTokens: 0,
				claim: void 0
			};
			foldUsage(state, inspected.events);
			usageCache.set(childId, state);
			return toUsageData(state);
		} catch {
			return;
		}
	};
	/** Attach usage to every row with a bounded concurrency (first load). */
	const applyUsage = async (rows) => {
		const limit = 8;
		let index = 0;
		const worker = async () => {
			while (index < rows.length) {
				const i = index;
				index += 1;
				const row = rows[i];
				if (row === void 0) continue;
				const usage = await childUsage(row.id);
				if (usage !== void 0) row.usage = usage;
			}
		};
		await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, worker));
	};
	const enrich = async (sessionId) => {
		let desc = [];
		try {
			desc = await ctx.subagents.listChildren(sessionId);
		} catch {
			desc = [];
		}
		const eventRows = [];
		for (const row of runs.values()) if (row.parentId === sessionId) eventRows.push({ ...row });
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
				parentId: sessionId
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
		for (const ev of eventRows) if (!seen.has(ev.id)) merged.push({ ...ev });
		merged.sort((a, b) => {
			const ka = a.startedAt ?? a.sortKey ?? Number.NEGATIVE_INFINITY;
			return (b.startedAt ?? b.sortKey ?? Number.NEGATIVE_INFINITY) - ka;
		});
		await applyUsage(merged);
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
				rows: await enrich(sessionId),
				main: await childUsage(sessionId)
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
