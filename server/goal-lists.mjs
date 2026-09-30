/** Existing user goals stay in the inbox until the user chooses a list. */
export function initializeGoalLists(store, stamp) {
  if (store.get('meta', 'goal-lists-v1')) return;
  store.transaction(() => {
    store.put('goalLists', { id: 'goal-list-inbox', name: '提醒事项', color: 'blue', createdAt: stamp, updatedAt: stamp });
    if (store.meta('profile').demo) {
      store.put('goalLists', { id: 'goal-list-work', name: '工作', color: 'orange', createdAt: stamp, updatedAt: stamp });
      store.put('goalLists', { id: 'goal-list-personal', name: '个人', color: 'purple', createdAt: stamp, updatedAt: stamp });
      const assignments = {
        'goal-exhibition': 'goal-list-work', 'goal-rest': 'goal-list-work',
        'demo-v2-goal-samples': 'goal-list-work', 'demo-v2-goal-permission': 'goal-list-work',
        'demo-v2-goal-interactive': 'goal-list-work', 'demo-v2-goal-rest': 'goal-list-personal',
      };
      for (const [key, listId] of Object.entries(assignments)) {
        const goal = store.get('goals', key);
        if (goal && !goal.listId && goal.sourceIds.every(sourceId => store.get('sources', sourceId)?.demo === true)) store.put('goals', { ...goal, listId });
      }
    }
    store.put('meta', { id: 'goal-lists-v1', value: { at: stamp } });
  });
}
