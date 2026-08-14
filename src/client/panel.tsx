/**
 * Subagent run monitor, browser half: the sidebar footer trigger and the
 * floating panel. The panel polls the node half's snapshot route once per
 * second while the trigger stays mounted, so a page refresh recovers
 * everything without any model interaction.
 */
import {
  useEffect, useSyncExternalStore, type CSSProperties, type ReactElement,
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
  if (!monitor.open) return null

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

  const style: CSSProperties = {
    top: '80px',
    right: '16px',
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
    return <div className="smn-panel" style={style}>{header}</div>
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
                <span className={`smn-dot ${meta.cls}`} />
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
    <div className="smn-panel" style={style}>
      {header}
      {rowsEl}
      {footer}
    </div>
  )
}
