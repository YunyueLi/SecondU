/** Stable identities shared by the canonical seeds and public example navigation. */
export const decisionExampleTaskId = language => language === 'en' ? 'demo-decision-task-en' : 'demo-decision-task-zh';
export const isDecisionExampleTask = taskId => ['demo-decision-task-zh', 'demo-decision-task-en'].includes(taskId);
