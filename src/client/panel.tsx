/**
 * Subagent run monitor, browser half: the sidebar footer trigger and the
 * floating panel. The panel polls the node half's snapshot route once per
 * second while it is open and the tab is visible, so a page refresh recovers
 * everything without any model interaction.
 */
import {
  useEffect, useRef, useSyncExternalStore,
  type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement,
} from 'react'
import type { SessionId, SubagentAddress } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { DEFAULT_LOCALE, resolveLocale, translator, type LocaleId, type MonitorKey, type Translate } from './locales'

// ---- wire shape shared with the node half ----

interface MonitorRow {
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
  sortKey?: number
  /** Folded token accounting for this child, when the host reports any. */
  usage?: MonitorUsage
}

/** Provider-neutral token accounting, mirroring the node half's UsageData. */
interface MonitorUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  contextTokens: number
  toolOutputTokens: number
  contextWindow?: number
  pressureTokens?: number
  /** Current context occupancy: newest sample plus surface movement since. */
  projectedTokens?: number
}

interface SnapshotPayload {
  sessionId?: string
  now?: number
  rows?: MonitorRow[]
  /** The viewed (main) session's own usage/context, folded by the host. */
  main?: MonitorUsage
}

// ---- page-local store (one instance per page) ----

/**
 * Panel collapse depth. Two-stage collapse: the header's collapse button first
 * hides only the subagent card list ('rows', the overview summary stays),
 * then collapses everything down to the header ('all').
 */
type CollapseLevel = 'none' | 'rows' | 'all'

interface MonitorState {
  sessionId: string | undefined
  now: number
  rows: MonitorRow[]
  main: MonitorUsage | undefined
  open: boolean
  collapse: CollapseLevel
  /**
   * Horizontal collapse: the panel narrows toward the left (its right edge
   * stays put), the three summary rings restack top-to-bottom, and the
   * subagent card list keeps running underneath in a compact form. Orthogonal
   * to `collapse`, so the two-stage vertical collapse still applies inside a
   * narrowed panel.
   */
  narrow: boolean
  hidden: string[]
  /** Language the copy renders in; the default until the host names another. */
  locale: LocaleId
}

const listeners = new Set<() => void>()
let state: MonitorState = { sessionId: undefined, now: Date.now(), rows: [], main: undefined, open: false, collapse: 'none', narrow: false, hidden: [], locale: DEFAULT_LOCALE }
let autoOpened = false
let polling = false

const commit = (patch: Partial<MonitorState>): void => {
  state = { ...state, ...patch }
  for (const listener of [...listeners]) listener()
}
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const getSnapshot = (): MonitorState => state

const useMonitor = (): MonitorState => useSyncExternalStore(subscribe, getSnapshot)

async function refresh(sessionId: string): Promise<void> {
  try {
    const res = await fetch(`/api/subagent-monitor/snapshot?sessionId=${encodeURIComponent(sessionId)}`)
    const data = await res.json() as SnapshotPayload
    if (data.sessionId !== state.sessionId) return
    commit({ rows: data.rows ?? [], main: data.main, now: data.now ?? Date.now() })
  } catch {
    // Transient network failure: the next tick retries.
  }
}

export interface MonitorSessionsService {
  open(id: SessionId): void
  openSubagent(address: SubagentAddress): void
}

let sessionsSvc: MonitorSessionsService | undefined

export function setSessionsService(service: MonitorSessionsService | undefined): void {
  sessionsSvc = service
}

/**
 * Adopt the host's UI language. The plugin body calls this whenever the host
 * publishes its active locale; a language this plugin ships no copy for — and
 * a host naming none at all — leaves the panel on its default Chinese copy.
 */
export function setLocale(id: string | undefined): void {
  const locale = resolveLocale(id)
  if (locale !== state.locale) commit({ locale })
}

// ---- helpers ----

interface StatusMeta {
  cls: string
  label: MonitorKey
}

const UNKNOWN: StatusMeta = { cls: 'smn-dot-off', label: 'status.ended' }

const STATUS: Record<string, StatusMeta> = {
  running: { cls: 'smn-dot-running', label: 'status.running' },
  completed: { cls: 'smn-dot-ok', label: 'status.completed' },
  error: { cls: 'smn-dot-error', label: 'status.error' },
  aborted: { cls: 'smn-dot-warn', label: 'status.aborted' },
  'max-tokens': { cls: 'smn-dot-warn', label: 'status.maxTokens' },
  refusal: { cls: 'smn-dot-warn', label: 'status.refusal' },
}

// ---- status marker: DSH-native StateDot spec (ui-primitives) ----
// ongoing = pixel-art chase around the 3x3 outer ring; terminal states =
// solid core + 10% same-color halo. See ui-primitives/src/StateDot.tsx.

/** Outer 3x3 matrix cells (2px pixels on a 10px grid), clockwise from top-left. */
const CHASE_CELLS: readonly (readonly [number, number])[] = [
  [0, 0], [4, 0], [8, 0], [8, 4], [8, 8], [4, 8], [0, 8], [0, 4],
]

function StatusDot({ status }: { status: string }): ReactElement {
  if (status === 'running') {
    return (
      <svg
        className="smn-dot smn-dot-running"
        width={10}
        height={10}
        viewBox="0 0 10 10"
        shapeRendering="crispEdges"
        aria-hidden="true"
      >
        {CHASE_CELLS.map(([x, y], index) => (
          <rect
            key={`${x}-${y}`}
            className="smn-dot-cell"
            x={x}
            y={y}
            width="2"
            height="2"
            /* Negative delay phases the chase so every cell animates from mount. */
            style={{ animationDelay: `${(index - CHASE_CELLS.length) * 125}ms` }}
          />
        ))}
      </svg>
    )
  }
  const meta = STATUS[status] ?? UNKNOWN
  return <span className={`smn-dot ${meta.cls}`} aria-hidden="true" />
}

function fmtDuration(start: number | undefined, end: number | undefined): string {
  if (start === undefined) return '—'
  const ms = (end ?? Date.now()) - start
  if (ms < 0) return '00:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

const shortId = (id: string | undefined): string =>
  id === undefined || id.length <= 8 ? id ?? '—' : id.slice(0, 8)

function rowLabel(row: MonitorRow, t: Translate): string {
  if (typeof row.label === 'string' && row.label !== '') return row.label
  if (typeof row.provider === 'string' && row.provider !== '') return t('row.label.provider', { provider: row.provider })
  return t('row.label.fallback', { id: shortId(row.id) })
}

const fmtTokens = (n: number): string => {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`
  }
  if (n >= 1_000) {
    const k = n / 1_000
    return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`
  }
  return String(n)
}

const fmtPct = (n: number): string => `${Math.round(n * 100)}%`

/** Cache-hit share of prompt tokens for one usage record. */
function usageHitRate(usage: MonitorUsage): string {
  const prompt = usage.inputTokens + usage.cacheReadTokens
  return prompt > 0 ? fmtPct(usage.cacheReadTokens / prompt) : '—'
}

/** Context-window utilization of the current occupancy, when both are known. */
function usageUtilization(usage: MonitorUsage): string {
  const used = usage.projectedTokens ?? usage.pressureTokens
  if (used === undefined || usage.contextWindow === undefined || usage.contextWindow <= 0) return ''
  return fmtPct(used / usage.contextWindow)
}
// ---- summary donuts: two cache rings (uncached / cached / output) plus the
// ---- main session's context-window ring (input / tool output / output).

const RING_SIZE = 52
const RING_RADIUS = 20
const RING_STROKE = 6
const RING_GAP = 1.5

/**
 * Pure-SVG cache donut for the summary strip. One ring, three segments — the
 * prompt side split into uncached input vs cache-hit input, plus output —
 * with the cache-hit rate in the center. Zero dependency, matching the
 * panel's hand-rolled SVG approach. The stroke-dasharray trick places each
 * arc clockwise from 12 o'clock; a tiny gap separates the segments. `size`
 * scales the geometry (the two small cache rings use 34).
 */
function RingChart(props: {
  uncachedInput: number
  cachedInput: number
  output: number
  hitRate: number | undefined
  size?: number
  t: Translate
}): ReactElement {
  const size = props.size ?? RING_SIZE
  const radius = RING_RADIUS * (size / RING_SIZE)
  const stroke = RING_STROKE * (size / RING_SIZE)
  const gap = RING_GAP * (size / RING_SIZE)
  const segments = [
    { value: props.uncachedInput, cls: 'smn-ring-seg-uncached' },
    { value: props.cachedInput, cls: 'smn-ring-seg-cached' },
    { value: props.output, cls: 'smn-ring-seg-output' },
  ]
  const total = segments.reduce((acc, seg) => acc + seg.value, 0)
  const hasData = total > 0
  const c = size / 2
  const circ = 2 * Math.PI * radius
  const visible = segments.filter(seg => seg.value > 0)
  const usable = hasData ? circ - gap * visible.length : 0
  let acc = 0
  return (
    <svg
      className={'smn-ring' + (size < RING_SIZE ? ' smn-ring-sm' : '')}
      width={size}
      height={size}
      viewBox={'0 0 ' + size + ' ' + size}
      role="img"
      aria-label={props.hitRate !== undefined
        ? props.t('ring.usage.aria', { rate: Math.round(props.hitRate * 100) })
        : props.t('ring.usage.aria.empty')}
    >
      <circle className="smn-ring-bg" cx={c} cy={c} r={radius} fill="none" strokeWidth={stroke} />
      <g transform={'rotate(-90 ' + c + ' ' + c + ')'}>
        {hasData ? visible.map(seg => {
          const len = (seg.value / total) * usable
          const el = (
            <circle
              key={seg.cls}
              className={'smn-ring-seg ' + seg.cls}
              cx={c}
              cy={c}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeDasharray={Math.max(0, len - gap) + ' ' + circ}
              strokeDashoffset={-acc}
            />
          )
          acc += len
          return el
        }) : null}
      </g>
      <text
        className="smn-ring-pct"
        x={c}
        y={c - size * 0.02}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {props.hitRate !== undefined ? Math.round(props.hitRate * 100) + '%' : '—'}
      </text>
      {hasData
        ? (
          <text
            className="smn-ring-label"
            x={c}
            y={c + size * 0.18}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {props.t('ring.cache')}
          </text>
        )
        : null}
    </svg>
  )
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
function ContextRing(props: { usage: MonitorUsage | undefined; size?: number; t: Translate }): ReactElement {
  const u = props.usage
  // projectedTokens is the occupancy figure (per the token-meter's contract);
  // fall back to the newest prompt sample, then to the cumulative figure for
  // hosts that predate the projection.
  const used = u?.projectedTokens ?? u?.pressureTokens ?? u?.contextTokens ?? 0
  const cap = u?.contextWindow
  const total = cap !== undefined && cap > 0 ? cap : used
  const hasData = used > 0
  const size = props.size ?? 56
  const radius = size * (22 / 56)
  const stroke = size * (7 / 56)
  const gap = 1.5
  const c = size / 2
  const circ = 2 * Math.PI * radius
  const frac = total > 0 ? Math.min(1, used / total) : 0
  const usable = hasData && total > 0 ? circ - gap : 0
  return (
    <svg
      className="smn-ring smn-ctx"
      width={size}
      height={size}
      viewBox={'0 0 ' + size + ' ' + size}
      role="img"
      aria-label={hasData && total > 0
        ? props.t('ring.context.aria', { rate: Math.round(frac * 100) })
        : props.t('ring.context.aria.empty')}
    >
      <circle className="smn-ring-bg" cx={c} cy={c} r={radius} fill="none" strokeWidth={stroke} />
      <g transform={'rotate(-90 ' + c + ' ' + c + ')'}>
        {hasData && total > 0
          ? (
            <circle
              className="smn-ring-seg smn-ctx-seg-input"
              cx={c}
              cy={c}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeDasharray={Math.max(0, (frac * usable) - gap) + ' ' + circ}
            />
          )
          : null}
      </g>
      <text
        className="smn-ring-pct"
        x={c}
        y={c - 1}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {hasData && total > 0 ? Math.round(frac * 100) + '%' : '—'}
      </text>
      {hasData
        ? (
          <text
            className="smn-ring-label"
            x={c}
            y={c + size * 0.18}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {props.t('ring.window')}
          </text>
        )
        : null}
    </svg>
  )
}

const MOBILE_QUERY = '(max-width: 768px)'

// ---- persisted panel layout (drag / resize survive reloads) ----

interface PanelLayout {
  left: number | null
  top: number | null
  height: number | null
}

// Position memory is global (one spot shared across sessions); height memory
// is per-session (each session keeps its own panel size). Two storage spaces:
const POSITION_KEY = 'dsh-smn.panel-position.v1'
const HEIGHT_KEY_PREFIX = 'dsh-smn.panel-height.v2.'
// Horizontal collapse is a page-global preference, like the position: one
// narrow/wide choice shared across sessions.
const NARROW_KEY = 'dsh-smn.panel-narrow.v1'
const DEFAULT_TOP = 80
const EDGE = 8
/** Panel width in each direction state, mirrored by the CSS below. */
const WIDE_WIDTH = 340
const NARROW_WIDTH = 120
// The resize floor must clear the empty state's natural content height
// (header + summary + empty + footer + grip ≈ 226px): a lower floor clips the
// footer and the bottom height grip out of the panel (overflow: hidden), so a
// fully shrunk panel loses the grip it needs to grow again.
const MIN_HEIGHT = 240

const heights = new Map<string, number | null>()
let heightKey = ''
let layout: PanelLayout = { left: null, top: null, height: null }
let positionLoaded = false

/** Load the shared position once per page. */
function loadPosition(): void {
  if (positionLoaded) return
  positionLoaded = true
  try {
    const raw = window.localStorage.getItem(POSITION_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as { left?: number, top?: number }
      if (typeof parsed.left === 'number' && Number.isFinite(parsed.left)) layout.left = parsed.left
      if (typeof parsed.top === 'number' && Number.isFinite(parsed.top)) layout.top = parsed.top
      // A half position makes no sense: fall back to the default corner anchor.
      if (layout.left === null || layout.top === null) { layout.left = null; layout.top = null }
    }
  } catch {
    // Corrupt layout: keep defaults.
  }
}

/** Bind the height slot to the current session's bucket. */
function bindHeight(sessionId: string | undefined): void {
  const key = sessionId ?? '__global__'
  if (key === heightKey) return
  heightKey = key
  const cached = heights.get(key)
  if (cached !== undefined) {
    layout.height = cached
    clampLayout()
    return
  }
  let h: number | null = null
  try {
    const raw = window.localStorage.getItem(HEIGHT_KEY_PREFIX + key)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as { height?: number }
      if (typeof parsed.height === 'number' && Number.isFinite(parsed.height)) h = parsed.height
    }
  } catch {
    // Corrupt height: keep default.
  }
  heights.set(key, h)
  layout.height = h
  clampLayout()
}

function savePosition(): void {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify({ left: layout.left, top: layout.top }))
  } catch {
    // Storage unavailable: layout still lives for this page.
  }
}

function saveHeight(): void {
  try {
    window.localStorage.setItem(HEIGHT_KEY_PREFIX + heightKey, JSON.stringify({ height: layout.height }))
  } catch {
    // Storage unavailable: layout still lives for this page.
  }
}

/** Read the persisted horizontal-collapse preference (defaults to wide). */
function readNarrow(): boolean {
  try {
    return window.localStorage.getItem(NARROW_KEY) === '1'
  } catch {
    return false
  }
}

function saveNarrow(narrow: boolean): void {
  try {
    window.localStorage.setItem(NARROW_KEY, narrow ? '1' : '0')
  } catch {
    // Storage unavailable: the choice still lives for this page.
  }
}

/**
 * Flip the horizontal collapse, keeping the panel's RIGHT edge anchored so the
 * box visually folds toward the left (and unfolds back rightward). With the
 * default right-anchored placement CSS already does that; once the panel has
 * been dragged it carries an explicit `left`, so compensate by shifting left
 * by the width delta.
 */
function toggleNarrow(): void {
  const next = !state.narrow
  if (layout.left !== null) {
    const delta = WIDE_WIDTH - NARROW_WIDTH
    layout.left = Math.max(EDGE, layout.left + (next ? delta : -delta))
    clampLayout()
    savePosition()
  }
  saveNarrow(next)
  commit({ narrow: next })
}

function clampLayout(): void {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (layout.left !== null) layout.left = Math.min(Math.max(EDGE, layout.left), Math.max(EDGE, vw - 60))
  if (layout.top !== null) layout.top = Math.min(Math.max(EDGE, layout.top), Math.max(EDGE, vh - 60))
  if (layout.height !== null) {
    const top = layout.top ?? DEFAULT_TOP
    layout.height = Math.min(Math.max(MIN_HEIGHT, layout.height), Math.max(MIN_HEIGHT, vh - top - 16))
  }
}

function applyLayoutStyle(el: HTMLElement, collapsed = false): void {
  if (layout.left !== null && layout.top !== null) {
    el.style.left = `${layout.left}px`
    el.style.top = `${layout.top}px`
    el.style.right = 'auto'
  } else {
    el.style.left = 'auto'
    el.style.top = `${DEFAULT_TOP}px`
    el.style.right = '16px'
  }
  // A collapsed panel (cards hidden or fully minimized) shrinks to its
  // content: the remembered height only applies while fully expanded, and
  // returns when the panel expands again.
  if (layout.height !== null && !collapsed) {
    el.style.height = `${layout.height}px`
    el.style.maxHeight = 'none'
  } else {
    el.style.height = ''
    el.style.maxHeight = ''
  }
}

function layoutStyle(collapsed = false): CSSProperties {
  const style: CSSProperties = layout.left !== null && layout.top !== null
    ? { left: `${layout.left}px`, top: `${layout.top}px` }
    : { top: `${DEFAULT_TOP}px`, right: '16px' }
  if (layout.height !== null && !collapsed) {
    style.height = `${layout.height}px`
    style.maxHeight = 'none'
  }
  return style
}

// ---- sidebar footer trigger ----

type TriggerProps = PropsRuntime<'sidebar.footer.action'>

export function Trigger(props: TriggerProps): ReactElement {
  const monitor = useMonitor()
  const current = props.useSessions(select => select.current)

  useEffect(() => {
    if (current === undefined) {
      if (state.sessionId !== undefined) commit({ sessionId: undefined, rows: [] })
      return
    }
    if (current !== state.sessionId) {
      commit({ sessionId: current })
      void refresh(current)
    }
  }, [current])

  // The timer only runs while the panel is actually being looked at: a closed
  // panel or a hidden tab stops it outright, instead of spending 1 req/s on a
  // snapshot nobody is rendering. Every (re)start polls once up front, so
  // reopening the panel / refocusing the tab shows fresh rows immediately
  // rather than the previous snapshot until the first tick lands.
  useEffect(() => {
    if (!monitor.open) return
    if (polling) return
    polling = true
    let timer: number | undefined
    const tick = (): void => {
      const sid = state.sessionId
      if (sid !== undefined) void refresh(sid)
    }
    const start = (): void => {
      if (timer !== undefined) return
      tick()
      timer = window.setInterval(tick, 1000)
    }
    const stop = (): void => {
      if (timer !== undefined) window.clearInterval(timer)
      timer = undefined
    }
    const onVisibility = (): void => {
      if (document.hidden) stop()
      else start()
    }
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      polling = false
    }
  }, [monitor.open])

  useEffect(() => {
    if (autoOpened) return
    autoOpened = true
    // Restore the horizontal-collapse choice before the first paint of the
    // panel, so a narrowed panel does not flash at full width on reload.
    const narrow = readNarrow()
    // Mobile viewports default to hidden; the trigger stays for explicit open.
    const open = !window.matchMedia(MOBILE_QUERY).matches
    commit(open ? { open: true, narrow } : { narrow })
  }, [])

  const t = translator(monitor.locale)
  const running = monitor.rows.filter(row => row.status === 'running').length
  return (
    <button className="smn-trigger" type="button" title={t('trigger.title')} onClick={() => commit({ open: !state.open })}>
      <span className="smn-trigger-label">{t('trigger.label')}</span>
      {running > 0 ? <span className="smn-trigger-badge">{running}</span> : null}
    </button>
  )
}

// ---- floating panel ----

type PanelProps = PropsRuntime<'shell.overlay'>

export function Panel(props: PanelProps): ReactElement | null {
  const monitor = useMonitor()
  const subagentParent = props.useSessions(select => (
    select.currentAddress === undefined ? undefined : select.currentAddress.parentSessionId
  ))

  // Hooks MUST run before the early return below: React #310 (more hooks than
  // the previous render) otherwise crashes the slot when the panel opens.
  const panelRef = useRef<HTMLDivElement | null>(null)
  // Mirrors the collapse state for the mount-only resize listener below,
  // whose closure would otherwise capture the first render's value.
  const collapsedRef = useRef(monitor.collapse !== 'none')
  collapsedRef.current = monitor.collapse !== 'none'

  useEffect(() => {
    clampLayout()
    const onResize = (): void => {
      clampLayout()
      if (panelRef.current !== null) applyLayoutStyle(panelRef.current, collapsedRef.current)
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [])

  // React's style diff cannot clear styles the drag handlers mutated directly
  // on the DOM: the last rendered style object never contained them, so a
  // collapse re-render sees "no diff" and leaves e.g. the dragged height on
  // the collapsed box. Reconcile imperatively when collapse flips.
  useEffect(() => {
    if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.collapse !== 'none')
  }, [monitor.collapse])

  if (!monitor.open) return null

  const t = translator(monitor.locale)

  // Shared position (once per page) + per-session height: rebind the height
  // slot to the current session before computing styles.
  loadPosition()
  bindHeight(monitor.sessionId)

  // Newest first; sortKey covers catalog rows the host has not observed run.
  const ordered = [...monitor.rows].sort((a, b) => {
    const ka = a.startedAt ?? a.sortKey ?? Number.NEGATIVE_INFINITY
    const kb = b.startedAt ?? b.sortKey ?? Number.NEGATIVE_INFINITY
    return kb - ka
  })
  const running = ordered.filter(row => row.status === 'running').length
  const visible = ordered.filter(row => !monitor.hidden.includes(row.id))
  const done = visible.filter(row => row.status === 'completed').length
  const failed = visible.filter(row =>
    row.status === 'error' || row.status === 'aborted' || row.status === 'max-tokens' || row.status === 'refusal',
  ).length
  const sessionId = monitor.sessionId

  // Overall dashboard: totals across usage-bearing rows plus the hottest
  // context-window utilization.
  const usageRows = visible.filter((row): row is MonitorRow & { usage: MonitorUsage } => row.usage !== undefined)
  const totals = usageRows.reduce(
    (acc, row) => ({
      inputTokens: acc.inputTokens + row.usage.inputTokens,
      outputTokens: acc.outputTokens + row.usage.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + row.usage.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + row.usage.cacheWriteTokens,
      contextTokens: acc.contextTokens + row.usage.contextTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, contextTokens: 0 },
  )
  const cacheHitRate = totals.inputTokens + totals.cacheReadTokens > 0
    ? totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens)
    : undefined
  const main = monitor.main
  const mainHitRate = main !== undefined && main.inputTokens + main.cacheReadTokens > 0
    ? main.cacheReadTokens / (main.inputTokens + main.cacheReadTokens)
    : undefined

  // Status histogram on the summary's right: the same running / completed /
  // failed counts as the footer, drawn as color-coded vertical bars instead
  // of duplicated text. Heights scale to the largest count so a lone run
  // still reads clearly.
  const narrow = monitor.narrow
  const statusMax = Math.max(running, done, failed, 1)
  const statusBar = (count: number, cls: string, label: string): ReactElement => (
    <div className="smn-bar">
      <div className="smn-bar-track">
        <div
          className={'smn-bar-fill ' + cls}
          style={{ height: `${(count / statusMax) * 100}%` }}
        />
      </div>
      <b className="smn-bar-count">{count}</b>
      <span className="smn-bar-label">{label}</span>
    </div>
  )

  const style = layoutStyle(monitor.collapse !== 'none')
  const panelClass = 'smn-panel' + (narrow ? ' smn-panel--narrow' : '')

  // Left grip drags the panel; bottom grip resizes its height. Handlers write
  // straight to the DOM node (no React state per pointermove — that was the
  // lag source in the first drag attempt) and persist once on release.
  // Listeners live on window during the gesture: setPointerCapture is NOT
  // reliable here (synthetic/injected pointer events can lack an active
  // pointer, so capture throws and the drag never starts).
  const onMoveGripDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    const el = panelRef.current
    if (el === null) return
    const rect = el.getBoundingClientRect()
    const offX = event.clientX - rect.left
    const offY = event.clientY - rect.top
    const move = (ev: PointerEvent): void => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      layout.left = Math.min(Math.max(EDGE, ev.clientX - offX), Math.max(EDGE, vw - rect.width - EDGE))
      layout.top = Math.min(Math.max(EDGE, ev.clientY - offY), Math.max(EDGE, vh - 60))
      applyLayoutStyle(el, monitor.collapse !== 'none')
    }
    const end = (): void => {
      savePosition()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const resetPosition = (): void => {
    layout.left = null
    layout.top = null
    savePosition()
    if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.collapse !== 'none')
  }

  const onResizeGripDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    const el = panelRef.current
    if (el === null) return
    const rect = el.getBoundingClientRect()
    const startH = rect.height
    const startTop = rect.top
    const startY = event.clientY
    const move = (ev: PointerEvent): void => {
      const maxH = Math.max(MIN_HEIGHT, window.innerHeight - startTop - 16)
      layout.height = Math.min(Math.max(MIN_HEIGHT, startH + (ev.clientY - startY)), maxH)
      applyLayoutStyle(el)
    }
    const end = (): void => {
      saveHeight()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const resetHeight = (): void => {
    layout.height = null
    saveHeight()
    if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.collapse !== 'none')
  }

  const openChild = (row: MonitorRow): void => {
    if (sessionsSvc === undefined || monitor.sessionId === undefined || row.mode === undefined) return
    // The direct parent is the authority the address needs. Every row is a
    // direct child of the viewed session, but reading parentId keeps that an
    // explicit fact rather than an assumption a future tree view would break.
    const address: SubagentAddress = {
      parentSessionId: (row.parentId ?? monitor.sessionId) as SessionId,
      childSessionId: row.id as SessionId,
      mode: row.mode as 'one-shot' | 'continuable',
    }
    sessionsSvc.openSubagent(address)
  }

  const header = (
    <div className="smn-panel-header">
      <div
        className="smn-grip-v"
        title={t('panel.moveGrip.title')}
        aria-hidden="true"
        onPointerDown={onMoveGripDown}
        onDoubleClick={resetPosition}
      >
        <svg className="smn-grip-v-icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 0.8 7.3 3.6H4.7Z" />
          <path d="M6 11.2 4.7 8.4H7.3Z" />
          <path d="M0.8 6 3.6 4.7V7.3Z" />
          <path d="M11.2 6 8.4 4.7V7.3Z" />
        </svg>
      </div>
      {/* The title and the "back one layer" button are the first things the
          narrow strip gives up: at 120px only the state badge and the three
          controls fit. */}
      {narrow ? null : <span className="smn-panel-title">{t('panel.title')}</span>}
      {!narrow && subagentParent !== undefined && sessionsSvc !== undefined
        ? (
          <button
            className="smn-btn smn-back"
            type="button"
            title={t('panel.back.title')}
            onClick={() => sessionsSvc?.open(subagentParent as SessionId)}
          >
            {t('panel.back')}
          </button>
        )
        : null}
      {running > 0 ? <span className="smn-panel-running">{running}</span> : null}
      <span className="smn-panel-spacer" />
      {/* Horizontal collapse: folds the panel left into a narrow strip that
          keeps the three rings (restacked vertically) and the subagent cards. */}
      <button
        className="smn-btn smn-icon-btn"
        type="button"
        title={narrow ? t('panel.narrowExpand.title') : t('panel.narrow.title')}
        aria-label={narrow ? t('panel.narrowExpand.aria') : t('panel.narrow.aria')}
        aria-expanded={!narrow}
        onClick={toggleNarrow}
      >
        {narrow ? '▸' : '◂'}
      </button>
      <button
        className={'smn-btn' + (narrow ? ' smn-icon-btn' : '')}
        type="button"
        title={monitor.collapse === 'none' ? t('panel.collapseRows.title') : monitor.collapse === 'rows' ? t('panel.collapseAll.title') : t('panel.expand.title')}
        aria-label={monitor.collapse === 'all' ? t('panel.collapse.aria.expand') : t('panel.collapse.aria.collapse')}
        onClick={() => {
          const next: CollapseLevel = monitor.collapse === 'none' ? 'rows' : monitor.collapse === 'rows' ? 'all' : 'none'
          commit({ collapse: next })
        }}
      >
        {narrow
          ? (monitor.collapse === 'all' ? '\u25be' : '\u25b4')
          : (monitor.collapse === 'none' ? t('panel.collapseRows') : monitor.collapse === 'rows' ? t('panel.collapseAll') : t('panel.expand'))}
      </button>
      <button
        className={'smn-btn' + (narrow ? ' smn-icon-btn' : '')}
        type="button"
        title={t('panel.close')}
        aria-label={t('panel.close.aria')}
        onClick={() => commit({ open: false })}
      >
        ✕
      </button>
    </div>
  )

  // The narrow strip keeps two of the three rings (context + main session) at
  // their FULL size — no downscale — restacked into a column via
  // .smn-panel--narrow CSS. The subagent ring drops out when narrow (the strip
  // would otherwise get too tall); the footer's counts carry that info. The
  // status histogram also needs horizontal room, so it drops out too.
  const summaryEl = (
    <div className="smn-summary">
      <div className="smn-summary-left">
        <div className="smn-summary-rings">
          <div className="smn-ring-item">
            <ContextRing usage={main} size={48} t={t} />
            <span className="smn-ring-caption">{t('summary.context')}</span>
          </div>
          <div className="smn-ring-item">
            <RingChart
              size={48}
              uncachedInput={main?.inputTokens ?? 0}
              cachedInput={main?.cacheReadTokens ?? 0}
              output={main?.outputTokens ?? 0}
              hitRate={mainHitRate}
              t={t}
            />
            <span className="smn-ring-caption">{t('summary.main')}</span>
          </div>
          {narrow
            ? null
            : (
              <div className="smn-ring-item">
                <RingChart
                  size={48}
                  uncachedInput={totals.inputTokens}
                  cachedInput={totals.cacheReadTokens}
                  output={totals.outputTokens}
                  hitRate={cacheHitRate}
                  t={t}
                />
                <span className="smn-ring-caption">{t('summary.subagents')}</span>
              </div>
            )}
        </div>
      </div>
      {narrow
        ? null
        : (
          <div className="smn-chart">
            {statusBar(running, 'smn-bar-running', t('summary.running'))}
            {statusBar(done, 'smn-bar-ok', t('summary.done'))}
            {statusBar(failed, 'smn-bar-err', t('summary.failed'))}
          </div>
        )}
    </div>
  )

  if (monitor.collapse === 'all') {
    return (
      <div className={panelClass} style={style} ref={panelRef}>
        {header}
      </div>
    )
  }

  const rowsEl = visible.length === 0
    ? (
      <div className="smn-empty">
        {sessionId === undefined ? t('rows.empty.noSession') : t('rows.empty.noActivity')}
      </div>
    )
    : (
      <div className="smn-rows">
        {visible.map(row => {
          const meta = STATUS[row.status] ?? UNKNOWN
          const elapsed = row.status === 'running'
            ? fmtDuration(row.startedAt, state.now)
            : fmtDuration(row.startedAt, row.endedAt)
          const modeText = row.mode === 'continuable' ? t('row.mode.continuable') : row.mode === 'one-shot' ? t('row.mode.oneShot') : ''
          const metaLine = [row.provider, modeText, shortId(row.id)]
            .filter(value => typeof value === 'string' && value !== '')
            .join(' · ')
          const canOpen = row.mode !== undefined && sessionsSvc !== undefined
          // Narrow mode has no room for the「打开对话」button or the provider /
          // mode / id meta line, so the whole card becomes the open affordance
          // (a real button for keyboard and screen-reader parity) and only the
          // dot, the label and the elapsed time survive.
          if (narrow) {
            const summaryTitle = `${rowLabel(row, t)} · ${t(meta.label)} · ${elapsed}`
              + (metaLine !== '' ? ` · ${metaLine}` : '')
            return canOpen
              ? (
                <button
                  key={row.id}
                  className="smn-row smn-row-compact smn-row-clickable"
                  type="button"
                  title={t('row.openHint', { summary: summaryTitle })}
                  onClick={() => openChild(row)}
                >
                  <div className="smn-row-main">
                    <StatusDot status={row.status} />
                    <span className="smn-row-label">{rowLabel(row, t)}</span>
                  </div>
                  <span className="smn-row-time">{elapsed}</span>
                </button>
              )
              : (
                <div key={row.id} className="smn-row smn-row-compact" title={summaryTitle}>
                  <div className="smn-row-main">
                    <StatusDot status={row.status} />
                    <span className="smn-row-label">{rowLabel(row, t)}</span>
                  </div>
                  <span className="smn-row-time">{elapsed}</span>
                </div>
              )
          }
          return (
            <div key={row.id} className="smn-row">
              <div className="smn-row-main">
                <StatusDot status={row.status} />
                <span className="smn-row-label" title={rowLabel(row, t)}>{rowLabel(row, t)}</span>
                {canOpen
                  ? (
                    <button className="smn-btn smn-row-open" type="button" onClick={() => openChild(row)}>
                      {t('row.open')}
                    </button>
                  )
                  : null}
              </div>
              <div className="smn-row-foot">
                <span className="smn-row-meta">{metaLine !== '' ? metaLine : '\u00A0'}</span>
                <span className="smn-row-time">
                  {row.status === 'running' ? `${elapsed} · ${t(meta.label)}` : `${t(meta.label)} · ${elapsed}`}
                </span>
              </div>
              {row.usage !== undefined
                ? (
                  <div className="smn-row-usage">
                    <span>↑{fmtTokens(row.usage.inputTokens)} ↓{fmtTokens(row.usage.outputTokens)}</span>
                    <span>{t('row.usage.cache')} {usageHitRate(row.usage)}</span>
                    <span>{t('row.usage.context')} {fmtTokens(row.usage.contextTokens)}</span>
                    {usageUtilization(row.usage) !== '' ? <span>{t('row.usage.window')} {usageUtilization(row.usage)}</span> : null}
                  </div>
                )
                : null}
            </div>
          )
        })}
      </div>
    )

  const clearFinished = (): void => {
    const hidden = [...state.hidden]
    for (const row of state.rows) {
      if (row.status !== 'running' && !hidden.includes(row.id)) hidden.push(row.id)
    }
    commit({ hidden })
  }

  // Narrow footer: the counts compress to a slash-separated triple (which also
  // stands in for the dropped histogram) and the two maintenance buttons become
  // icons on a second line. Both layouts read their copy from the dictionary.
  const footer = narrow
    ? (
      <div className="smn-panel-footer smn-panel-footer--narrow">
        <span
          className="smn-panel-stats"
          title={t('footer.stats', { running, done, failed })}
        >
          <b className="smn-stat-running">{running}</b>
          <span className="smn-stat-sep">/</span>
          <b className="smn-stat-ok">{done}</b>
          <span className="smn-stat-sep">/</span>
          <b className="smn-stat-err">{failed}</b>
        </span>
        <span className="smn-panel-spacer" />
        {monitor.hidden.length > 0
          ? (
            <button
              className="smn-btn smn-icon-btn"
              type="button"
              title={t('footer.showHidden', { count: monitor.hidden.length })}
              aria-label={t('footer.showHidden', { count: monitor.hidden.length })}
              onClick={() => commit({ hidden: [] })}
            >
              \u2924
            </button>
          )
          : null}
        <button
          className="smn-btn smn-icon-btn"
          type="button"
          title={t('footer.clearDone')}
          aria-label={t('footer.clearDone')}
          onClick={clearFinished}
        >
          \u232b
        </button>
      </div>
    )
    : (
      <div className="smn-panel-footer">
        <span className="smn-panel-stats">
          {t('footer.stats', { running, done, failed })}
        </span>
        <span className="smn-panel-spacer" />
        {monitor.hidden.length > 0
          ? (
            <button className="smn-btn" type="button" onClick={() => commit({ hidden: [] })}>
              {t('footer.showHidden', { count: monitor.hidden.length })}
            </button>
          )
          : null}
        <button className="smn-btn" type="button" onClick={clearFinished}>
          {t('footer.clearDone')}
        </button>
      </div>
    )
  return (
    <div className={panelClass} style={style} ref={panelRef}>
      {header}
      {summaryEl}
      {/* Stage-one collapse hides only the subagent cards; the overview
          summary, the status footer and the height grip stay. */}
      {monitor.collapse !== 'rows' ? rowsEl : null}
      {footer}
      <div
        className="smn-grip-h"
        title={t('panel.resizeGrip.title')}
        aria-hidden="true"
        onPointerDown={onResizeGripDown}
        onDoubleClick={resetHeight}
      >
        <span className="smn-grip-h-bar" />
      </div>
    </div>
  )
}
