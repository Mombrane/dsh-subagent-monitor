/**
 * Subagent run monitor, node half: a host-plane observer over subagent
 * lifecycle events plus the polling endpoint the browser panel reads.
 * The browser half ships via exports["./client"], discovered through the
 * package.json `dsh.client` declaration.
 *
 * Process-wide events are attributed to their root session by walking the
 * in-memory parent chain, so the panel serves exactly one session's forest;
 * durable catalog facts (label, mode, depth) come from `listDescendants`.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentRunEndInfo, SubagentRunInfo } from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** One observed run, scalar-only so the wire copy stays lossless JSON. */
interface RunRow {
  readonly runId: string
  readonly id: string
  readonly provider?: string
  readonly local: boolean
  readonly rootId: string
  readonly startedAt: number
  status: string
  endedAt?: number
}

/** A panel row: an event-driven row enriched with durable catalog facts. */
interface PanelRow {
  id: string
  label?: string
  mode?: string
  depth: number
  parentId?: string
  runId?: string
  provider?: string
  local?: boolean
  startedAt?: number
  endedAt?: number
  status: string
  /** Newest-first key for catalog rows without an observed start time. */
  sortKey?: number
}

const MAX_PER_ROOT = 200

export const inject = ['sessions', 'subagents', 'webServer']

export function apply(ctx: Context): void {
  const runs = new Map<string, RunRow>()

  const str = (value: unknown): string => typeof value === 'string' ? value : String(value)

  // Walk the in-memory session parent chain up to the top-level session id.
  const rootOf = (childId: string): string | undefined => {
    let cur = ctx.sessions.get(childId as SessionId)
    let hops = 0
    while (cur !== undefined && hops < 32) {
      const pid = cur.header.parentSession
      if (pid === undefined) return str(cur.id)
      cur = ctx.sessions.get(pid)
      hops += 1
    }
    return undefined
  }

  const prune = (): void => {
    const counts = new Map<string, number>()
    for (const row of runs.values()) counts.set(row.rootId, (counts.get(row.rootId) ?? 0) + 1)
    for (const [rootId, count] of counts) {
      if (count <= MAX_PER_ROOT) continue
      let excess = count - MAX_PER_ROOT
      const rows = [...runs.values()]
        .filter(row => row.rootId === rootId && row.status !== 'running')
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
    const root = rootOf(childId)
    if (root === undefined) return
    runs.set(str(info.runId), {
      runId: str(info.runId),
      id: childId,
      provider: info.provider,
      local: info.local,
      rootId: root,
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

  // Merge event-driven rows with the durable descendant catalog (labels,
  // mode, depth, pre-order). Undefined values never reach the wire.
  const enrich = async (sessionId: string): Promise<PanelRow[]> => {
    let desc: Awaited<ReturnType<typeof ctx.subagents.listDescendants>> = []
    try {
      desc = await ctx.subagents.listDescendants(sessionId as SessionId)
    } catch {
      desc = []
    }
    const eventRows: RunRow[] = []
    for (const row of runs.values()) {
      if (row.rootId === sessionId) eventRows.push({ ...row })
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
      const base = {
        id,
        ...(entry.kind === 'child' && entry.label !== undefined ? { label: entry.label } : {}),
        ...(entry.kind === 'child' ? { mode: entry.mode } : {}),
        depth: entry.depth,
        parentId: str(entry.parentId),
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
      if (!seen.has(ev.id)) merged.push({ ...ev, depth: 0 })
    }
    // Newest first: observed runs sort by start time; catalog-only rows fall
    // back to their recency key (always below observed runs).
    merged.sort((a, b) => {
      const ka = a.startedAt ?? a.sortKey ?? Number.NEGATIVE_INFINITY
      const kb = b.startedAt ?? b.sortKey ?? Number.NEGATIVE_INFINITY
      return kb - ka
    })
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
        : { sessionId, now: Date.now(), rows: await enrich(sessionId) }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify(payload))
    },
  }), 'ui-subagent-monitor: snapshot route')
}
