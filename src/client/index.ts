/**
 * Subagent run monitor, browser half entry: the plugin body only (no JSX —
 * tsdown pins the client bundle entry to src/client/index.ts). Components
 * live in ./panel.tsx.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { Panel, Trigger, setLocale, setSessionsService, type MonitorSessionsService } from './panel'

export const inject = ['slots', 'sessions']

/**
 * The host locale service, narrowed to the two reads the panel needs (same
 * loose-resolution reason as the sessions service below). `active` is the
 * host's UI language — the one Settings > General > Language writes.
 */
interface MonitorLocaleService {
  getLocale(): { active: string }
  subscribe(fn: () => void): () => void
}

export function apply(ctx: ClientContext): void {
  // The host-side dsh-session augmentation shadows the client sessions
  // contract inside this dual-face package's program, so resolve the runtime
  // service loosely and keep only the two methods the panel calls.
  setSessionsService(ctx.get('sessions') as unknown as MonitorSessionsService | undefined)

  // Follow the host UI language. 'locale' stays OUT of `inject` on purpose:
  // a cordis inject is a hard requirement, and a composition without the
  // locale plugin must still get the panel — it keeps the Chinese copy that
  // has always shipped (see ./locales.ts). The nested inject fiber activates
  // only while the service is there, and its unload restores the default.
  ctx.inject(['locale'], (localeCtx: ClientContext) => {
    localeCtx.effect(() => {
      const locale = localeCtx.get('locale') as unknown as MonitorLocaleService | undefined
      if (locale === undefined) return () => {}
      const adopt = (): void => { setLocale(locale.getLocale().active) }
      try {
        adopt()
        const unsubscribe = locale.subscribe(adopt)
        return () => {
          unsubscribe()
          setLocale(undefined)
        }
      } catch {
        // A locale service that does not answer these two reads leaves the
        // panel on its default copy rather than taking the plugin down.
        setLocale(undefined)
        return () => {}
      }
    }, 'ui-subagent-monitor: host locale')
  })

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
/* ---- horizontal collapse: the panel folds left into a narrow strip ----
   The width shrinks while the right edge stays anchored (the panel is
   right-anchored by default; a dragged panel gets its explicit left shifted by
   the same delta in toggleNarrow), so the box visibly folds toward the left.
   What survives: the context + main-session rings at full size, restacked
   top-to-bottom, and the subagent card list underneath in compact form.
   NARROW_WIDTH in panel.tsx mirrors this width — change both together. */
.smn-panel--narrow { width: 120px; }
.smn-panel--narrow .smn-panel-header { gap: 2px; padding: 8px 6px; }
.smn-panel--narrow .smn-grip-v { width: 14px; }
/* Icon-only control: the narrow header has no room for a text label. */
.smn-icon-btn { flex: none; width: 20px; padding: 1px 0; text-align: center; }
.smn-panel--narrow .smn-panel-running { font-size: 11px; font-weight: 600; }
.smn-panel--narrow .smn-summary { padding: 8px 6px; }
/* Row -> column: the whole point of the narrow layout. */
.smn-panel--narrow .smn-summary-left { width: 100%; }
.smn-panel--narrow .smn-summary-rings {
  flex-direction: column; align-items: center; gap: 10px; width: 100%;
}
.smn-panel--narrow .smn-rows { padding: 6px; gap: 5px; }
.smn-panel--narrow .smn-empty { padding: 16px 8px; font-size: 11px; }
/* Compact card: dot + label on one line, elapsed time right-aligned under it.
   Rendered as a <button> when the child can be opened, so it needs the button
   defaults reset back to the surrounding card look. */
.smn-row-compact {
  display: flex; flex-direction: column; align-items: stretch; gap: 2px;
  width: 100%; padding: 6px 8px; text-align: left;
  font: inherit; color: inherit;
}
.smn-row-compact .smn-row-main { gap: 6px; justify-content: flex-start; }
.smn-row-compact .smn-row-label { font-size: 12px; line-height: 16px; }
.smn-row-compact .smn-row-time { align-self: flex-end; font-size: 10px; }
.smn-row-clickable { cursor: pointer; }
.smn-row-clickable:hover {
  border-color: var(--dsw-alias-border-l2, rgba(15, 23, 42, 0.3));
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.04));
}
.smn-row-clickable:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, #2563eb); outline-offset: 1px;
}
.smn-panel-footer--narrow { flex-wrap: wrap; gap: 4px; padding: 6px; }
.smn-panel-footer--narrow .smn-panel-stats {
  display: inline-flex; align-items: center; gap: 2px;
  font-size: 11px; font-variant-numeric: tabular-nums;
}
.smn-stat-sep { color: var(--dsw-alias-label-tertiary, #cbd5e1); }
.smn-stat-running { color: var(--dsw-alias-brand-primary, #2563eb); }
.smn-stat-ok { color: var(--dsw-alias-state-success-primary, rgb(34, 197, 94)); }
.smn-stat-err { color: var(--dsw-alias-state-error-primary, rgb(236, 19, 19)); }
@media (max-width: 768px) {
  .smn-panel { width: min(340px, calc(100vw - 24px)); }
  /* The strip already fits every mobile viewport: keep it fixed so the ring
     column never reflows on small screens. */
  .smn-panel--narrow { width: 120px; }
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
