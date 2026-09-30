import type { AgentRoom, Task } from '../../shared/contracts';

/** A retained task owns continuation settings; the room owns the next new turn. */
export function roomRuntimeControls(room: AgentRoom | undefined, task: Task | undefined, busy = false) {
  return {
    digitalTwinEnabled: (task ? task.digitalTwinEnabled : room?.digitalTwinEnabled) !== false,
    locked: busy || !!task && ['queued', 'running', 'awaiting_approval'].includes(task.status),
  };
}
