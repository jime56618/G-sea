export const emptySelection = scope => ({ scope, all: false, ids: [], excluded: [] });

export function selectionReducer(state, action) {
  const current = state.scope === action.scope ? state : emptySelection(action.scope);
  if (action.type === 'clear') return emptySelection(action.scope);
  if (action.type === 'all') return { ...emptySelection(action.scope), all: true };
  if (action.type !== 'toggle') return current;
  const ids = new Set(current.ids);
  const excluded = new Set(current.excluded);
  for (const id of action.ids) {
    if (current.all) { if (action.checked) excluded.delete(id); else excluded.add(id); }
    else if (action.checked) ids.add(id); else ids.delete(id);
  }
  return { ...current, ids: [...ids], excluded: [...excluded] };
}

export const isRecordSelected = (selection, id) => selection.all ? !selection.excluded.includes(id) : selection.ids.includes(id);
export const selectionCount = (selection, total) => selection.all ? (total == null ? null : Math.max(0, total - selection.excluded.length)) : selection.ids.length;
