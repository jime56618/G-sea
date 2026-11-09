// Solo solicitudes en curso: sin caché de respuestas ni datos entre usuarios/workspaces.
export function createDashboardRequestPool(fetcher) {
  const pending = new Map();
  return (scope, path) => {
    const key = JSON.stringify([scope, path]);
    let entry = pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, subscribers: 0, timer: null };
      entry.promise = Promise.resolve().then(() => fetcher(path, { signal: controller.signal }))
        .finally(() => { if (pending.get(key) === entry) pending.delete(key); });
      pending.set(key, entry);
    }
    clearTimeout(entry.timer); entry.subscribers++;
    let released = false;
    return { promise: entry.promise, release() {
      if (released) return;
      released = true; entry.subscribers--;
      if (!entry.subscribers) entry.timer = setTimeout(() => {
        entry.controller.abort();
        if (pending.get(key) === entry) pending.delete(key);
      }, 300);
    } };
  };
}
