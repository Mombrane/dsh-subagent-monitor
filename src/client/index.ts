/**
 * Subagent run monitor, browser half entry: the plugin body only (no JSX —
 * tsdown pins the client bundle entry to src/client/index.ts). Components
 * live in ./panel.tsx.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { Panel, Trigger, setSessionsService, type MonitorSessionsService } from './panel'

export const inject = ['slots', 'sessions']

export function apply(ctx: ClientContext): void {
  // The host-side dsh-session augmentation shadows the client sessions
  // contract inside this dual-face package's program, so resolve the runtime
  // service loosely and keep only the two methods the panel calls.
  setSessionsService(ctx.get('sessions') as unknown as MonitorSessionsService | undefined)

  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = '@leetoners/dsh-ui-subagent-monitor'
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
.smn-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.smn-dot-running {
  background: var(--dsw-static-deepseek-500, rgb(65, 118, 230));
  animation: smn-pulse 1.2s ease-in-out infinite;
}
@keyframes smn-pulse {
  0%, 100% {
    background: var(--dsw-static-deepseek-500, rgb(65, 118, 230));
    box-shadow: 0 0 0 0 rgba(65, 118, 230, 0.45);
  }
  50% {
    background: var(--dsw-static-deepseek-200, rgb(211, 226, 255));
    box-shadow: 0 0 0 4px rgba(65, 118, 230, 0);
  }
}
.smn-dot-ok { background: var(--dsw-alias-state-success-primary, #16a34a); }
.smn-dot-error { background: var(--dsw-alias-state-error-primary, #dc2626); }
.smn-dot-warn { background: var(--dsw-alias-state-warn-primary, #d97706); }
.smn-dot-off { background: var(--dsw-alias-label-tertiary, #cbd5e1); }
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
`
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'ui-subagent-monitor: styles')

  ctx.slots.inject(
    'sidebar.footer.action',
    () => ctx.slots.register(
      { name: 'sidebar.footer.action', id: 'subagent-monitor', order: 50 },
      Trigger,
    ),
  )
  ctx.slots.inject(
    'shell.overlay',
    () => ctx.slots.register(
      { name: 'shell.overlay', id: 'subagent-monitor-panel', order: 100 },
      Panel,
    ),
  )
}
