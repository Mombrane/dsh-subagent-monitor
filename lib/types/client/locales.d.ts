/**
 * Panel copy, one dictionary per shipped language. `zh` is the key-set source
 * of truth (Chinese-first repo convention) and the default: a host that names
 * no UI language — or names one this plugin ships no copy for — keeps the
 * Chinese panel it has always rendered. `en` is a key-for-key mirror, checked
 * by the compiler.
 */
/** Simplified Chinese copy (key-set source of truth). */
export declare const zh: {
    'trigger.label': string;
    'trigger.title': string;
    'panel.title': string;
    'panel.back': string;
    'panel.back.title': string;
    'panel.close': string;
    'panel.collapseRows': string;
    'panel.collapseRows.title': string;
    'panel.collapseAll': string;
    'panel.collapseAll.title': string;
    'panel.expand': string;
    'panel.expand.title': string;
    'panel.moveGrip.title': string;
    'panel.resizeGrip.title': string;
    'summary.context': string;
    'summary.main': string;
    'summary.subagents': string;
    'summary.running': string;
    'summary.done': string;
    'summary.failed': string;
    'ring.cache': string;
    'ring.window': string;
    'ring.usage.aria': string;
    'ring.usage.aria.empty': string;
    'ring.context.aria': string;
    'ring.context.aria.empty': string;
    'rows.empty.noSession': string;
    'rows.empty.noActivity': string;
    'row.label.provider': string;
    'row.label.fallback': string;
    'row.mode.continuable': string;
    'row.mode.oneShot': string;
    'row.open': string;
    'row.usage.cache': string;
    'row.usage.context': string;
    'row.usage.window': string;
    'status.running': string;
    'status.completed': string;
    'status.error': string;
    'status.aborted': string;
    'status.maxTokens': string;
    'status.refusal': string;
    'status.ended': string;
    'footer.stats': string;
    'footer.showHidden': string;
    'footer.clearDone': string;
};
/** Every copy key the panel reads. */
export type MonitorKey = keyof typeof zh;
/**
 * English copy, key-for-key complete against `zh`. Wording follows
 * README.en.md (the repo's own English surface): "Subagents", "Open chat",
 * "Clear done", "Collapse" / "Collapse all" / "Expand". Header and footer
 * labels stay short because the panel is a fixed 340px wide and neither row
 * wraps.
 */
export declare const en: Record<MonitorKey, string>;
/** Id of a language this plugin ships copy for. */
export type LocaleId = 'zh' | 'en';
/** The language the panel falls back to whenever the host names no other. */
export declare const DEFAULT_LOCALE: LocaleId;
/** Reads one copy key, filling `{name}` placeholders from `params`. */
export type Translate = (key: MonitorKey, params?: Record<string, string | number>) => string;
/**
 * Narrow a host locale id to a shipped language. Regional variants ride their
 * primary subtag (`en-US` reads English); anything else — including an absent
 * id — keeps the default.
 * @param id - the host's active locale id, when it names one.
 * @returns the language whose copy the panel renders.
 */
export declare function resolveLocale(id: string | undefined): LocaleId;
/**
 * Bind a translate function to one language.
 * @param locale - the language to read.
 * @returns the reader for that language's dictionary.
 */
export declare function translator(locale: LocaleId): Translate;
