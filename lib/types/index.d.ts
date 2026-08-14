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
import type { Context } from '@deepseek-ai/cordis';
export declare const inject: string[];
export declare function apply(ctx: Context): void;
