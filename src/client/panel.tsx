/**
 * Subagent run monitor, browser half: the sidebar footer trigger and the
 * floating panel. The panel polls the node half's snapshot route once per
 * second while the trigger stays mounted, so a page refresh recovers
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

// ---- wire shape shared with the node half ----

interface MonitorRow {
  id: string
  label?: string
  mode?: string
  depth?: number
  parentId?: string
  runId?: string
  provider?: string
  local?: boolean
  startedAt?: number
  endedAt?: number
  status: string
  sortKey?: number
}

interface SnapshotPayload {
  sessionId?: string
  now?: number
  rows?: MonitorRow[]
}

// ---- page-local store (one instance per page) ----

interface MonitorState {
  sessionId: string | undefined
  now: number
  rows: MonitorRow[]
  open: boolean
  minimized: boolean
  hidden: string[]
}

const listeners = new Set<() => void>()
let state: MonitorState = { sessionId: undefined, now: Date.now(), rows: [], open: false, minimized: false, hidden: [] }
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
    commit({ rows: data.rows ?? [], now: data.now ?? Date.now() })
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

// ---- helpers ----

interface StatusMeta {
  cls: string
  label: string
}

const UNKNOWN: StatusMeta = { cls: 'smn-dot-off', label: '已结束' }

const STATUS: Record<string, StatusMeta> = {
  running: { cls: 'smn-dot-running', label: '运行中' },
  completed: { cls: 'smn-dot-ok', label: '完成' },
  error: { cls: 'smn-dot-error', label: '失败' },
  aborted: { cls: 'smn-dot-warn', label: '已打断' },
  'max-tokens': { cls: 'smn-dot-warn', label: '令牌上限' },
  refusal: { cls: 'smn-dot-warn', label: '已拒绝' },
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

function rowLabel(row: MonitorRow): string {
  if (typeof row.label === 'string' && row.label !== '') return row.label
  if (typeof row.provider === 'string' && row.provider !== '') return `[${row.provider}] 子代理`
  return `子代理 ${shortId(row.id)}`
}

const MOBILE_QUERY = '(max-width: 768px)'

// ---- persisted panel layout (drag / resize survive reloads) ----

interface PanelLayout {
  left: number | null
  top: number | null
  height: number | null
}

const LAYOUT_KEY_PREFIX = 'dsh-smn.panel-layout.v2.'
const DEFAULT_TOP = 80
const EDGE = 8
const MIN_HEIGHT = 160

// One layout bucket per session (position / height memory is per-session);
// sessions without an id share the '__global__' bucket.
const layouts = new Map<string, PanelLayout>()
let layoutKey = ''
let layout: PanelLayout = { left: null, top: null, height: null }

/** Bind the module-level layout to the current session's bucket. */
function bindLayout(sessionId: string | undefined): void {
  const key = sessionId ?? '__global__'
  if (key === layoutKey) return
  layoutKey = key
  const cached = layouts.get(key)
  if (cached !== undefined) {
    layout = cached
    clampLayout()
    return
  }
  const fresh: PanelLayout = { left: null, top: null, height: null }
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY_PREFIX + key)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<PanelLayout>
      if (typeof parsed.left === 'number' && Number.isFinite(parsed.left)) fresh.left = parsed.left
      if (typeof parsed.top === 'number' && Number.isFinite(parsed.top)) fresh.top = parsed.top
      if (typeof parsed.height === 'number' && Number.isFinite(parsed.height)) fresh.height = parsed.height
      // A half position makes no sense: fall back to the default corner anchor.
      if (fresh.left === null || fresh.top === null) { fresh.left = null; fresh.top = null }
    }
  } catch {
    // Corrupt layout: keep defaults.
  }
  layouts.set(key, fresh)
  layout = fresh
  clampLayout()
}

function saveLayout(): void {
  try {
    window.localStorage.setItem(LAYOUT_KEY_PREFIX + layoutKey, JSON.stringify(layout))
  } catch {
    // Storage unavailable: layout still lives for this page.
  }
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

function applyLayoutStyle(el: HTMLElement, minimized = false): void {
  if (layout.left !== null && layout.top !== null) {
    el.style.left = `${layout.left}px`
    el.style.top = `${layout.top}px`
    el.style.right = 'auto'
  } else {
    el.style.left = 'auto'
    el.style.top = `${DEFAULT_TOP}px`
    el.style.right = '16px'
  }
  // A minimized panel collapses to its header: the remembered height only
  // applies while expanded, and returns when the panel expands again.
  if (layout.height !== null && !minimized) {
    el.style.height = `${layout.height}px`
    el.style.maxHeight = 'none'
  } else {
    el.style.height = ''
    el.style.maxHeight = ''
  }
}

function layoutStyle(minimized = false): CSSProperties {
  const style: CSSProperties = layout.left !== null && layout.top !== null
    ? { left: `${layout.left}px`, top: `${layout.top}px` }
    : { top: `${DEFAULT_TOP}px`, right: '16px' }
  if (layout.height !== null && !minimized) {
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

  useEffect(() => {
    if (polling) return
    polling = true
    const timer = window.setInterval(() => {
      const sid = state.sessionId
      if (sid !== undefined) void refresh(sid)
    }, 1000)
    return () => {
      window.clearInterval(timer)
      polling = false
    }
  }, [])

  useEffect(() => {
    if (autoOpened) return
    autoOpened = true
    // Mobile viewports default to hidden; the trigger stays for explicit open.
    if (!window.matchMedia(MOBILE_QUERY).matches) commit({ open: true })
  }, [])

  const running = monitor.rows.filter(row => row.status === 'running').length
  return (
    <button className="smn-trigger" type="button" title="运行中的子代理" onClick={() => commit({ open: !state.open })}>
      <span className="smn-trigger-label">子代理</span>
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
  // Mirrors the minimized state for the mount-only resize listener below,
  // whose closure would otherwise capture the first render's value.
  const minimizedRef = useRef(monitor.minimized)
  minimizedRef.current = monitor.minimized

  useEffect(() => {
    clampLayout()
    const onResize = (): void => {
      clampLayout()
      if (panelRef.current !== null) applyLayoutStyle(panelRef.current, minimizedRef.current)
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [])

  // React's style diff cannot clear styles the drag handlers mutated directly
  // on the DOM: the last rendered style object never contained them, so a
  // minimize re-render sees "no diff" and leaves e.g. the dragged height on
  // the collapsed box. Reconcile imperatively when minimized flips.
  useEffect(() => {
    if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.minimized)
  }, [monitor.minimized])

  if (!monitor.open) return null

  // Per-session layout: rebind the module-level layout to the current session
  // before computing styles, so switching sessions swaps position/height too.
  bindLayout(monitor.sessionId)

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

  const style = layoutStyle(monitor.minimized)

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
      applyLayoutStyle(el, monitor.minimized)
    }
    const end = (): void => {
      saveLayout()
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
    saveLayout()
    if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.minimized)
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
      saveLayout()
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
    saveLayout()
    if (panelRef.current !== null) applyLayoutStyle(panelRef.current, monitor.minimized)
  }

  const openChild = (row: MonitorRow): void => {
    if (sessionsSvc === undefined || monitor.sessionId === undefined || row.mode === undefined) return
    const address: SubagentAddress = {
      parentSessionId: monitor.sessionId as SessionId,
      childSessionId: row.id as SessionId,
      mode: row.mode as 'one-shot' | 'continuable',
    }
    sessionsSvc.openSubagent(address)
  }

  const header = (
    <div className="smn-panel-header">
      <div
        className="smn-grip-v"
        title="拖动调整位置 · 双击复位"
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
      <span className="smn-panel-title">运行中的子代理</span>
      {subagentParent !== undefined && sessionsSvc !== undefined
        ? (
          <button
            className="smn-btn smn-back"
            type="button"
            title="返回主会话"
            onClick={() => sessionsSvc?.open(subagentParent as SessionId)}
          >
            ← 主会话
          </button>
        )
        : null}
      {running > 0 ? <span className="smn-panel-running">{running}</span> : null}
      <span className="smn-panel-spacer" />
      <button
        className="smn-btn"
        type="button"
        title={monitor.minimized ? '展开面板' : '收起面板'}
        onClick={() => commit({ minimized: !state.minimized })}
      >
        {monitor.minimized ? '展开 ▾' : '收起 ▴'}
      </button>
      <button className="smn-btn" type="button" title="关闭" onClick={() => commit({ open: false })}>
        ✕
      </button>
    </div>
  )

  if (monitor.minimized) {
    return (
      <div className="smn-panel" style={style} ref={panelRef}>
        {header}
      </div>
    )
  }

  const rowsEl = visible.length === 0
    ? (
      <div className="smn-empty">
        {sessionId === undefined ? '尚未选择会话' : '本会话暂无子代理活动'}
      </div>
    )
    : (
      <div className="smn-rows">
        {visible.map(row => {
          const meta = STATUS[row.status] ?? UNKNOWN
          const elapsed = row.status === 'running'
            ? fmtDuration(row.startedAt, state.now)
            : fmtDuration(row.startedAt, row.endedAt)
          const depth = typeof row.depth === 'number' ? row.depth : 1
          const indent = Math.max(0, depth - 1) * 14
          const modeText = row.mode === 'continuable' ? '连续对话' : row.mode === 'one-shot' ? '一次性' : ''
          const metaLine = [row.provider, modeText, shortId(row.id)]
            .filter(value => typeof value === 'string' && value !== '')
            .join(' · ')
          return (
            <div key={row.id} className="smn-row" style={{ marginLeft: indent }}>
              <div className="smn-row-main">
                <StatusDot status={row.status} />
                <span className="smn-row-label" title={rowLabel(row)}>{rowLabel(row)}</span>
                {row.mode !== undefined && sessionsSvc !== undefined
                  ? (
                    <button className="smn-btn smn-row-open" type="button" onClick={() => openChild(row)}>
                      打开对话
                    </button>
                  )
                  : null}
              </div>
              <div className="smn-row-foot">
                <span className="smn-row-meta">{metaLine !== '' ? metaLine : '\u00A0'}</span>
                <span className="smn-row-time">
                  {row.status === 'running' ? `${elapsed} · ${meta.label}` : `${meta.label} · ${elapsed}`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    )

  const footer = (
    <div className="smn-panel-footer">
      <span className="smn-panel-stats">
        {`运行 ${running} · 完成 ${done} · 异常 ${failed}`}
      </span>
      <span className="smn-panel-spacer" />
      {monitor.hidden.length > 0
        ? (
          <button className="smn-btn" type="button" onClick={() => commit({ hidden: [] })}>
            {`显示已隐藏 ${monitor.hidden.length}`}
          </button>
        )
        : null}
      <button
        className="smn-btn"
        type="button"
        onClick={() => {
          const hidden = [...state.hidden]
          for (const row of state.rows) {
            if (row.status !== 'running' && !hidden.includes(row.id)) hidden.push(row.id)
          }
          commit({ hidden })
        }}
      >
        清空已完成
      </button>
    </div>
  )

  return (
    <div className="smn-panel" style={style} ref={panelRef}>
      {header}
      {rowsEl}
      {footer}
      <div
        className="smn-grip-h"
        title="拖动调整高度 · 双击复位"
        aria-hidden="true"
        onPointerDown={onResizeGripDown}
        onDoubleClick={resetHeight}
      >
        <span className="smn-grip-h-bar" />
      </div>
    </div>
  )
}
