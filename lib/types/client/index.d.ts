/**
 * Subagent run monitor, browser half entry: the plugin body only (no JSX —
 * tsdown pins the client bundle entry to src/client/index.ts). Components
 * live in ./panel.tsx.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
