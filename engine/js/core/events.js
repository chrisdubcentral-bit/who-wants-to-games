// Tiny publish/subscribe bus so screens don't call each other directly.

export function createBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    emit(type, payload) {
      handlers.get(type)?.forEach((fn) => {
        try { fn(payload); } catch (err) { console.error(`[bus] ${type}`, err); }
      });
    },
  };
}

export const bus = createBus();
