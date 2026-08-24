/**
 * Subagent run monitor, node half: a host-plane observer over subagent
 * lifecycle events plus the polling endpoint the browser panel reads.
 * The browser half ships via exports["./client"], discovered through the
 * package.json `dsh.client` declaration.
 *
 * Process-wide events are attributed to their DIRECT parent session, so the
 * panel serves exactly ONE layer: the subagents the viewed session delegated
 * itself, never its grandchildren. A grandchild is reached by opening its own
 * parent's session, where it is again a direct child. Durable catalog facts
 * (label, mode) come from `listChildren`.
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const inject: string[];
export declare function apply(ctx: Context): void;
