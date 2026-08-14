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
type TriggerProps = PropsRuntime<'sidebar.footer.action'>;
export declare function Trigger(props: TriggerProps): ReactElement;
type PanelProps = PropsRuntime<'shell.overlay'>;
export declare function Panel(props: PanelProps): ReactElement | null;
export {};
