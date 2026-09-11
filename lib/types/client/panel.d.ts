/**
 * Subagent run monitor, browser half: the sidebar footer trigger and the
 * floating panel. The panel polls the node half's snapshot route once per
 * second while the trigger stays mounted, so a page refresh recovers
 * everything without any model interaction.
 */
import { type ReactElement } from 'react';
import type { SessionId, SubagentAddress } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
export interface MonitorSessionsService {
    open(id: SessionId): void;
    openSubagent(address: SubagentAddress): void;
}
export declare function setSessionsService(service: MonitorSessionsService | undefined): void;
/**
 * Adopt the host's UI language. The plugin body calls this whenever the host
 * publishes its active locale; a language this plugin ships no copy for — and
 * a host naming none at all — leaves the panel on its default Chinese copy.
 */
export declare function setLocale(id: string | undefined): void;
type TriggerProps = PropsRuntime<'sidebar.footer.action'>;
export declare function Trigger(props: TriggerProps): ReactElement;
type PanelProps = PropsRuntime<'shell.overlay'>;
export declare function Panel(props: PanelProps): ReactElement | null;
export {};
