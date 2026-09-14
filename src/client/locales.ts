/**
 * Panel copy, one dictionary per shipped language. `zh` is the key-set source
 * of truth (Chinese-first repo convention) and the default: a host that names
 * no UI language — or names one this plugin ships no copy for — keeps the
 * Chinese panel it has always rendered. `en` is a key-for-key mirror, checked
 * by the compiler.
 */

/** Simplified Chinese copy (key-set source of truth). */
export const zh = {
  'trigger.label': '子代理',
  'trigger.title': '子代理看板',
  'panel.title': '子代理看板',
  'panel.back': '← 上一层',
  'panel.back.title': '返回上一层会话',
  'panel.close': '关闭',
  'panel.collapseRows': '收起 ▴',
  'panel.collapseRows.title': '收起子代理卡片，保留总览',
  'panel.collapseAll': '全部收起 ▴',
  'panel.collapseAll.title': '全部收起，仅留标题栏',
  'panel.expand': '展开 ▾',
  'panel.expand.title': '展开面板',
  'panel.collapse.aria.collapse': '向上收起面板',
  'panel.collapse.aria.expand': '向下展开面板',
  'panel.narrow.title': '向左收起为窄栏，保留上下文与主会话环、子代理卡片',
  'panel.narrow.aria': '向左收起为窄栏',
  'panel.narrowExpand.title': '向右展开面板',
  'panel.narrowExpand.aria': '向右展开面板',
  'panel.close.aria': '关闭子代理看板',
  'panel.moveGrip.title': '拖动调整位置 · 双击复位',
  'panel.resizeGrip.title': '拖动调整高度 · 双击复位',
  'summary.context': '上下文',
  'summary.main': '主会话',
  'summary.subagents': '子代理',
  'summary.running': '运行',
  'summary.done': '完成',
  'summary.failed': '异常',
  'ring.cache': '缓存',
  'ring.window': '窗口',
  'ring.usage.aria': '模型用量构成，缓存命中率 {rate}%',
  'ring.usage.aria.empty': '模型用量构成，无用量数据',
  'ring.context.aria': '主会话上下文，当前 {rate}% 窗口',
  'ring.context.aria.empty': '主会话上下文，无用量数据',
  'rows.empty.noSession': '尚未选择会话',
  'rows.empty.noActivity': '本会话暂无子代理活动',
  'row.label.provider': '[{provider}] 子代理',
  'row.label.fallback': '子代理 {id}',
  'row.mode.continuable': '连续对话',
  'row.mode.oneShot': '一次性',
  'row.open': '打开对话',
  'row.openHint': '{summary}（点击打开对话）',
  'row.usage.cache': '缓存',
  'row.usage.context': '上下文',
  'row.usage.window': '窗口',
  'status.running': '运行中',
  'status.completed': '完成',
  'status.error': '失败',
  'status.aborted': '已打断',
  'status.maxTokens': '令牌上限',
  'status.refusal': '已拒绝',
  'status.ended': '已结束',
  'footer.stats': '运行 {running} · 完成 {done} · 异常 {failed}',
  'footer.showHidden': '显示已隐藏 {count}',
  'footer.clearDone': '清空已完成',
}

/** Every copy key the panel reads. */
export type MonitorKey = keyof typeof zh

/**
 * English copy, key-for-key complete against `zh`. Wording follows
 * README.en.md (the repo's own English surface): "Subagents", "Open chat",
 * "Clear done", "Collapse" / "Collapse all" / "Expand". Header and footer
 * labels stay short because the panel is a fixed 340px wide and neither row
 * wraps.
 */
export const en: Record<MonitorKey, string> = {
  'trigger.label': 'Subagents',
  'trigger.title': 'Subagent dashboard',
  'panel.title': 'Subagents',
  'panel.back': '← Parent',
  'panel.back.title': 'Back to the parent session',
  'panel.close': 'Close',
  'panel.collapseRows': 'Collapse ▴',
  'panel.collapseRows.title': 'Collapse the subagent cards, keep the overview',
  'panel.collapseAll': 'Collapse all ▴',
  'panel.collapseAll.title': 'Collapse everything but the title bar',
  'panel.expand': 'Expand ▾',
  'panel.expand.title': 'Expand the panel',
  'panel.collapse.aria.collapse': 'Collapse the panel',
  'panel.collapse.aria.expand': 'Expand the panel',
  'panel.narrow.title': 'Fold left into a narrow strip, keeping the context and main-session rings and the subagent cards',
  'panel.narrow.aria': 'Fold the panel left into a narrow strip',
  'panel.narrowExpand.title': 'Expand the panel to the right',
  'panel.narrowExpand.aria': 'Expand the panel to the right',
  'panel.close.aria': 'Close the subagent dashboard',
  'panel.moveGrip.title': 'Drag to reposition · double-click to reset',
  'panel.resizeGrip.title': 'Drag to resize · double-click to reset',
  'summary.context': 'Context',
  'summary.main': 'Main',
  'summary.subagents': 'Subagents',
  'summary.running': 'Running',
  'summary.done': 'Done',
  'summary.failed': 'Failed',
  'ring.cache': 'cache',
  'ring.window': 'window',
  'ring.usage.aria': 'Model usage breakdown, cache hit rate {rate}%',
  'ring.usage.aria.empty': 'Model usage breakdown, no usage data',
  'ring.context.aria': 'Main session context, {rate}% of the window',
  'ring.context.aria.empty': 'Main session context, no usage data',
  'rows.empty.noSession': 'No session selected',
  'rows.empty.noActivity': 'No subagent activity in this session',
  'row.label.provider': '[{provider}] subagent',
  'row.label.fallback': 'Subagent {id}',
  'row.mode.continuable': 'continuable',
  'row.mode.oneShot': 'one-shot',
  'row.open': 'Open chat',
  'row.openHint': '{summary} (click to open this chat)',
  'row.usage.cache': 'cache',
  'row.usage.context': 'ctx',
  'row.usage.window': 'window',
  'status.running': 'Running',
  'status.completed': 'Done',
  'status.error': 'Failed',
  'status.aborted': 'Interrupted',
  'status.maxTokens': 'Token limit',
  'status.refusal': 'Rejected',
  'status.ended': 'Ended',
  'footer.stats': 'Running {running} · Done {done} · Failed {failed}',
  'footer.showHidden': 'Unhide {count}',
  'footer.clearDone': 'Clear done',
}

/** Id of a language this plugin ships copy for. */
export type LocaleId = 'zh' | 'en'

/** Every shipped language, each a complete dictionary. */
const DICTS: Record<LocaleId, Record<MonitorKey, string>> = { zh, en }

/** The language the panel falls back to whenever the host names no other. */
export const DEFAULT_LOCALE: LocaleId = 'zh'

/** Reads one copy key, filling `{name}` placeholders from `params`. */
export type Translate = (key: MonitorKey, params?: Record<string, string | number>) => string

/**
 * Narrow a host locale id to a shipped language. Regional variants ride their
 * primary subtag (`en-US` reads English); anything else — including an absent
 * id — keeps the default.
 * @param id - the host's active locale id, when it names one.
 * @returns the language whose copy the panel renders.
 */
export function resolveLocale(id: string | undefined): LocaleId {
  const primary = (id ?? '').split('-')[0]?.toLowerCase() ?? ''
  return Object.hasOwn(DICTS, primary) ? primary as LocaleId : DEFAULT_LOCALE
}

/**
 * Bind a translate function to one language.
 * @param locale - the language to read.
 * @returns the reader for that language's dictionary.
 */
export function translator(locale: LocaleId): Translate {
  const dict = DICTS[locale]
  return (key, params) => {
    const template = dict[key]
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (raw, name: string) => String(params[name] ?? raw))
  }
}
