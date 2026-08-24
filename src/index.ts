/**
 * Subagent run monitor, node half: a host-plane observer over subagent
 * lifecycle events plus the polling endpoint the browser panel reads.
 * The browser half ships via exports["./client"], discovered through the
 * package.json "dsh.client" declaration.
 *
 * Process-wide events are attributed to their DIRECT parent session, so the
 * panel serves exactly ONE layer: the subagents the viewed session delegated
 * itself, never its grandchildren. A grandchild is reached by opening its own
 * parent's session, where it is again a direct child. Durable catalog facts
 * (label, mode) come from 'listChildren'.
 *
 * Usage/context/cache accounting is folded from each child's own session log:
 * 'assistant/message' (and 'assistant/chunk' usage) events carry a provider
 * TokenUsage (inputTokens/outputTokens/cacheReadTokens/cacheWriteTokens).
 * Live children serve their in-memory events; cold (persistence-only) children
 * are inspected once via 'sessionPersistence' and cached. The fold mirrors
 * @deepseek-ai/dsh-token-meter's tokenUsage + contextPressure projections
 * without depending on that package, so an out-of-repo plugin stays
 * self-contained.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentRunEndInfo, SubagentRunInfo } from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** One observed run, scalar-only so the wire copy stays lossless JSON. */
interface RunRow {
  readonly runId: string
  readonly id: string
  readonly provider?: string
  readonly local: boolean
  /** Durable direct parent: the session that delegated this run. */
  readonly parentId: string
  readonly startedAt: number
  status: string
  endedAt?: number
}

/** Provider-neutral token accounting folded from one child's session log. */
interface UsageData {
  /** Uncached prompt tokens (provider inputTokens). */
  inputTokens: number
  /** Generated completion tokens. */
  outputTokens: number
  /** Prompt tokens served from cache (cache hit). */
  cacheReadTokens: number
  /** Prompt tokens written into cache. */
  cacheWriteTokens: number
  /** Accumulated prompt-side context: input + cache read + cache write. */
  contextTokens: number
  /** Heuristic tokens of the session's tool outputs (tool/result content). */
  toolOutputTokens: number
  /** Advertised model context window, when 'request/context' logged one. */
  contextWindow?: number
  /** Prompt-side pressure of the newest usage sample, when reported. */
  pressureTokens?: number
  /**
   * What the next request's prompt would cost: the newest sample plus the
   * heuristic surface movement since (a compaction shadow shrinks it the
   * moment content is replaced). This is the current-context occupancy figure;
   * unlike {@link contextTokens} it is not cumulative over the session.
   */
  projectedTokens?: number
}

/** A panel row: an event-driven row enriched with durable catalog facts. */
interface PanelRow {
  id: string
  label?: string
  mode?: string
  parentId?: string
  runId?: string
  provider?: string
  local?: boolean
  startedAt?: number
  endedAt?: number
  status: string
  /** Newest-first key for catalog rows without an observed start time. */
  sortKey?: number
  /** Folded token accounting for this child, when the log reports any. */
  usage?: UsageData
}

const MAX_PER_PARENT = 200

export const inject = ['sessions', 'subagents', 'webServer']

/** Structural slice of the provider usage record carried by session events. */
interface TokenUsageLike {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Disjoint usage buckets, matching the token-meter projection's totals. */
interface UsageBuckets {
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Shadow price armed by a compaction event, consumed by the next surface replace. */
interface ShadowPriceClaim {
  start: number
  end: number
  tokens: number
}

/** Incremental fold state for one child session (watermark + last sample). */
interface UsageFoldState {
  consumedEvents: number
  totals: UsageBuckets
  /** Cumulative heuristic tokens of tool/result content in this session. */
  toolOutputTokens: number
  last: { turn: number, step: number, buckets: UsageBuckets } | null
  contextWindow?: number
  pressureTokens?: number
  /**
   * Running heuristic price of the current model-visible surface (appends
   * price each message; a compaction replacement subtracts its shadow price).
   */
  surfaceTokens: number
  /** {@link surfaceTokens} at the newest usage sample, before that sample joined the surface. */
  sampledSurfaceTokens?: number
  /** Shadow price armed by a compaction event, consumed by the next replace. */
  claim: ShadowPriceClaim | undefined
}

/** Minimal surface of the optional 'sessionPersistence' service we use. */
interface SessionPersistenceLike {
  inspect(id: SessionId): Promise<{ meta: { id: SessionId, cwd?: string }, events: readonly SessionEvent[] }>
}

const zeroBuckets = (): UsageBuckets => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
})

const bucketsOf = (usage: TokenUsageLike): UsageBuckets => ({
  uncachedInputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  cacheReadTokens: usage.cacheReadTokens ?? 0,
  cacheWriteTokens: usage.cacheWriteTokens ?? 0,
})

const bucketsEqual = (left: UsageBuckets, right: UsageBuckets): boolean =>
  left.uncachedInputTokens === right.uncachedInputTokens
  && left.outputTokens === right.outputTokens
  && left.cacheReadTokens === right.cacheReadTokens
  && left.cacheWriteTokens === right.cacheWriteTokens

/** Replace one step's earlier sample instead of double counting it. */
const addReplacing = (
  totals: UsageBuckets,
  previous: UsageBuckets | undefined,
  next: UsageBuckets,
): UsageBuckets => ({
  uncachedInputTokens: totals.uncachedInputTokens - (previous?.uncachedInputTokens ?? 0) + next.uncachedInputTokens,
  outputTokens: totals.outputTokens - (previous?.outputTokens ?? 0) + next.outputTokens,
  cacheReadTokens: totals.cacheReadTokens - (previous?.cacheReadTokens ?? 0) + next.cacheReadTokens,
  cacheWriteTokens: totals.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0) + next.cacheWriteTokens,
})

/** The usage a step reports, from a final message or an early usage chunk. */
const usageOf = (event: SessionEvent): TokenUsageLike | undefined => {
  if (event.type === 'assistant/message') {
    return (event.data as { usage?: TokenUsageLike }).usage
  }
  if (event.type === 'assistant/chunk') {
    const chunk = event.data.chunk as { type: string, usage?: TokenUsageLike }
    return chunk.type === 'usage' ? chunk.usage : undefined
  }
  return undefined
}

const stepOf = (event: SessionEvent): { turn: number, step: number } =>
  event.data as unknown as { turn: number, step: number }

/** Fixed-density heuristic matching @deepseek-ai/dsh-token-meter's estimate. */
const CHARS_PER_TOKEN = 4
const BLOCK_OVERHEAD = 4
const ROLE_OVERHEAD = 4

/**
 * Price a content-block list under the meter's fixed density (chars / 4 plus
 * per-block structural overhead). Tool outputs are not reported by providers,
 * so the context ring's "tool output" slice is this heuristic over
 * 'tool/result' message content — the same estimate the harness itself uses.
 */
function estimateContentTokens(blocks: readonly unknown[]): number {
  let tokens = 0
  for (const block of blocks) {
    const b = block as { type?: string; text?: string; content?: unknown[]; name?: string; arguments?: string }
    switch (b.type) {
      case 'text':
      case 'reasoning':
        tokens += Math.ceil((b.text ?? '').length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD
        break
      case 'tool-result':
        tokens += estimateContentTokens(b.content ?? []) + BLOCK_OVERHEAD
        break
      default:
        tokens += BLOCK_OVERHEAD + Math.ceil(JSON.stringify(block).length / CHARS_PER_TOKEN)
    }
  }
  return tokens
}

/**
 * The model-visible message an event derives to, mirroring the session
 * surface's projection rule: only 'user/message', 'assistant/message' (with
 * content) and 'tool/result' produce a priced message; everything else is
 * trace/replay data. The returned object is the message's content slice only.
 */
const surfaceMessageOf = (event: SessionEvent): { content: readonly unknown[] } | null => {
  switch (event.type) {
    case 'user/message': {
      const data = event.data as { content?: readonly unknown[] }
      return data.content !== undefined ? { content: data.content } : null
    }
    case 'assistant/message': {
      const message = (event.data as { message?: { content?: readonly unknown[] } }).message
      if (message === undefined || (message.content ?? []).length === 0) return null
      return message as { content: readonly unknown[] }
    }
    case 'tool/result': {
      const message = (event.data as { message?: { content?: readonly unknown[] } }).message
      return message !== undefined ? (message as { content: readonly unknown[] }) : null
    }
    default:
      return null
  }
}

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
const foldSurface = (
  claim: ShadowPriceClaim | undefined,
  event: SessionEvent,
): { deltaTokens: number, claim: ShadowPriceClaim | undefined } => {
  // 'compaction/summary'/'compaction/prune' live in the dsh-compaction event
  // merge, absent from this plugin's static SessionEvent union — widen the
  // type so the branch survives without a runtime narrowing to `never`.
  const type = (event as { type?: string }).type
  if (type === 'compaction/summary' || type === 'compaction/prune') {
    const data = (event as { data?: {
      shadowedRange?: { start?: number, end?: number }
      shadowedTokenCount?: number
    } }).data
    const range = data?.shadowedRange
    if (range !== undefined
      && typeof range.start === 'number' && typeof range.end === 'number'
      && typeof data?.shadowedTokenCount === 'number') {
      return { deltaTokens: 0, claim: { start: range.start, end: range.end, tokens: data.shadowedTokenCount } }
    }
    return { deltaTokens: 0, claim: undefined }
  }
  const raw = event as SessionEvent & { surfaceOp?: unknown }
  // Non-surface events move nothing and expire any armed claim.
  if (raw.surfaceOp === undefined) return { deltaTokens: 0, claim: undefined }
  const message = surfaceMessageOf(event)
  const tokens = message === null ? 0 : estimateContentTokens(message.content) + ROLE_OVERHEAD
  if (raw.surfaceOp === 'append') return { deltaTokens: tokens, claim: undefined }
  const op = raw.surfaceOp as { op: string, start?: number, end?: number }
  if (claim === undefined || op.start !== claim.start || op.end !== claim.end) {
    return { deltaTokens: 0, claim: undefined }
  }
  return { deltaTokens: tokens - claim.tokens, claim: undefined }
}

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
function foldUsage(state: UsageFoldState, events: readonly SessionEvent[]): void {
  let index = state.consumedEvents
  for (; index < events.length; index++) {
    const event = events[index]
    if (event === undefined) continue
    if (event.type === 'request/context') {
      const contextWindow = (event.data as { contextWindow?: number }).contextWindow
      if (contextWindow !== undefined) state.contextWindow = contextWindow
      continue
    }
    if (event.type === 'tool/result') {
      const message = (event.data as { message?: { content?: readonly unknown[] } }).message
      if (message?.content !== undefined) state.toolOutputTokens += estimateContentTokens(message.content)
    }
    const usage = usageOf(event)
    const fold = foldSurface(state.claim, event)
    state.claim = fold.claim
    if (usage !== undefined) {
      const buckets = bucketsOf(usage)
      const { turn, step } = stepOf(event)
      const previous = state.last !== null && state.last.turn === turn && state.last.step === step
        ? state.last.buckets
        : undefined
      if (previous === undefined || !bucketsEqual(previous, buckets)) {
        state.totals = addReplacing(state.totals, previous, buckets)
        state.last = { turn, step, buckets }
        state.pressureTokens = buckets.uncachedInputTokens + buckets.cacheReadTokens + buckets.cacheWriteTokens
        // Stamp the surface total before this event joins it.
        state.sampledSurfaceTokens = state.surfaceTokens
      }
    }
    if (fold.deltaTokens !== 0) state.surfaceTokens += fold.deltaTokens
  }
  state.consumedEvents = index
}

export function apply(ctx: Context): void {
  const runs = new Map<string, RunRow>()
  const usageCache = new Map<string, UsageFoldState>()

  const str = (value: unknown): string => typeof value === 'string' ? value : String(value)

  const toUsageData = (state: UsageFoldState): UsageData | undefined => {
    const { totals } = state
    if (totals.uncachedInputTokens === 0 && totals.outputTokens === 0
      && totals.cacheReadTokens === 0 && totals.cacheWriteTokens === 0) {
      return undefined
    }
    const projectedTokens = state.pressureTokens !== undefined && state.sampledSurfaceTokens !== undefined
      ? Math.max(0, state.pressureTokens + state.surfaceTokens - state.sampledSurfaceTokens)
      : undefined
    return {
      inputTokens: totals.uncachedInputTokens,
      outputTokens: totals.outputTokens,
      cacheReadTokens: totals.cacheReadTokens,
      cacheWriteTokens: totals.cacheWriteTokens,
      contextTokens: totals.uncachedInputTokens + totals.cacheReadTokens + totals.cacheWriteTokens,
      toolOutputTokens: state.toolOutputTokens,
      ...(state.contextWindow !== undefined ? { contextWindow: state.contextWindow } : {}),
      ...(state.pressureTokens !== undefined ? { pressureTokens: state.pressureTokens } : {}),
      ...(projectedTokens !== undefined ? { projectedTokens } : {}),
    }
  }

  // One hop up the durable lineage: the delegating session. The panel shows a
  // single layer, so a run belongs to its direct parent and is never lifted to
  // the root of the tree (that lifting is what made grandchildren surface in a
  // parent's panel).
  const parentOf = (childId: string): string | undefined => {
    const child = ctx.sessions.get(childId as SessionId)
    const parent = child?.header.parentSession
    return parent === undefined ? undefined : str(parent)
  }

  const prune = (): void => {
    const counts = new Map<string, number>()
    for (const row of runs.values()) counts.set(row.parentId, (counts.get(row.parentId) ?? 0) + 1)
    for (const [parentId, count] of counts) {
      if (count <= MAX_PER_PARENT) continue
      let excess = count - MAX_PER_PARENT
      const rows = [...runs.values()]
        .filter(row => row.parentId === parentId && row.status !== 'running')
        .sort((a, b) => a.startedAt - b.startedAt)
      for (const row of rows) {
        if (excess <= 0) break
        runs.delete(row.runId)
        excess -= 1
      }
    }
  }

  const onStart = (info: SubagentRunInfo): void => {
    const childId = str(info.id)
    const parentId = parentOf(childId)
    if (parentId === undefined) return
    runs.set(str(info.runId), {
      runId: str(info.runId),
      id: childId,
      provider: info.provider,
      local: info.local,
      parentId,
      startedAt: Date.now(),
      status: 'running',
    })
    prune()
  }

  const onEnd = (info: SubagentRunEndInfo): void => {
    const row = runs.get(str(info.runId))
    if (row === undefined) return
    row.status = info.stopReason
    row.endedAt = Date.now()
  }

  ctx.on('subagent/start', onStart, { global: true })
  ctx.on('subagent/end', onEnd, { global: true })

  /**
   * Fold one child's usage. Live children serve their in-memory events
   * incrementally; a cold child is inspected from persistence exactly once per
   * process lifetime (the watermark cache then serves it). A missing optional
   * 'sessionPersistence' or an unreadable log degrades to undefined.
   */
  const childUsage = async (childId: string): Promise<UsageData | undefined> => {
    const live = ctx.sessions.get(childId as SessionId)
    if (live !== undefined) {
      let state = usageCache.get(childId)
      if (state === undefined) {
        state = { consumedEvents: 0, totals: zeroBuckets(), toolOutputTokens: 0, last: null, surfaceTokens: 0, claim: undefined }
        usageCache.set(childId, state)
      }
      foldUsage(state, live.events)
      return toUsageData(state)
    }
    const cached = usageCache.get(childId)
    if (cached !== undefined) return toUsageData(cached)
    const persistence = (ctx as unknown as { get(name: string): unknown }).get('sessionPersistence') as
      SessionPersistenceLike | undefined
    if (persistence === undefined) return undefined
    try {
      const inspected = await persistence.inspect(childId as SessionId)
      const state: UsageFoldState = { consumedEvents: 0, totals: zeroBuckets(), toolOutputTokens: 0, last: null, surfaceTokens: 0, claim: undefined }
      foldUsage(state, inspected.events)
      usageCache.set(childId, state)
      return toUsageData(state)
    } catch {
      return undefined
    }
  }

  /** Attach usage to every row with a bounded concurrency (first load). */
  const applyUsage = async (rows: PanelRow[]): Promise<void> => {
    const limit = 8
    let index = 0
    const worker = async (): Promise<void> => {
      while (index < rows.length) {
        const i = index
        index += 1
        const row = rows[i]
        if (row === undefined) continue
        const usage = await childUsage(row.id)
        if (usage !== undefined) row.usage = usage
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, rows.length) }, worker))
  }

  // Merge event-driven rows with the durable DIRECT-child catalog (labels,
  // mode). One layer only: 'listChildren' never enumerates grandchildren, so a
  // parent's panel cannot fill up with a child's own delegations.
  // Undefined values never reach the wire.
  const enrich = async (sessionId: string): Promise<PanelRow[]> => {
    let desc: Awaited<ReturnType<typeof ctx.subagents.listChildren>> = []
    try {
      desc = await ctx.subagents.listChildren(sessionId as SessionId)
    } catch {
      desc = []
    }
    const eventRows: RunRow[] = []
    for (const row of runs.values()) {
      if (row.parentId === sessionId) eventRows.push({ ...row })
    }
    eventRows.sort((a, b) => a.startedAt - b.startedAt)
    const merged: PanelRow[] = []
    const seen = new Set<string>()
    // Catalog entries arrive oldest-first; the descending recency key lets
    // unobserved rows rank newest-first below any observed run.
    for (let index = 0; index < desc.length; index++) {
      const entry = desc[index]
      if (entry === undefined) continue
      const id = str(entry.id)
      seen.add(id)
      // Every catalog entry here is a direct child of the queried session by
      // construction, so the parent is the query itself (listChildren entries
      // carry no parentId of their own).
      const base = {
        id,
        ...(entry.kind === 'child' && entry.label !== undefined ? { label: entry.label } : {}),
        ...(entry.kind === 'child' ? { mode: entry.mode } : {}),
        parentId: sessionId,
      }
      const ev = eventRows.find(row => row.id === id)
      if (ev !== undefined) {
        merged.push({ ...base, ...ev })
      } else {
        merged.push({
          ...base,
          local: true,
          sortKey: -(desc.length - index),
          status: entry.kind === 'child' && entry.activity === 'running' ? 'running' : 'unknown',
        })
      }
    }
    for (const ev of eventRows) {
      if (!seen.has(ev.id)) merged.push({ ...ev })
    }
    // Newest first: observed runs sort by start time; catalog-only rows fall
    // back to their recency key (always below observed runs).
    merged.sort((a, b) => {
      const ka = a.startedAt ?? a.sortKey ?? Number.NEGATIVE_INFINITY
      const kb = b.startedAt ?? b.sortKey ?? Number.NEGATIVE_INFINITY
      return kb - ka
    })
    await applyUsage(merged)
    return merged
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/subagent-monitor/snapshot',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const sessionId = url.searchParams.get('sessionId')
      const payload = sessionId === null
        ? { now: Date.now(), rows: [] }
        : {
            sessionId,
            now: Date.now(),
            rows: await enrich(sessionId),
            // The viewed session's own usage/context (window, pressure,
            // tool outputs) — the "main session" side of the dashboard.
            main: await childUsage(sessionId),
          }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(payload))
    },
  }), 'ui-subagent-monitor: snapshot route')
}
