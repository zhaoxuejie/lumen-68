/**
 * Tiny application-wide event bus used to keep the DOM UI and the Three.js
 * scene decoupled. Both sides only exchange small, serialisable payloads.
 */
const bus = new EventTarget();

/**
 * Dispatch a namespaced application event.
 * @param {string} type Event name, e.g. "lumen:toast".
 * @param {unknown} [detail] Event payload.
 */
export function emit(type, detail) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

/**
 * Subscribe to an application event.
 * @param {string} type Event name.
 * @param {(event: CustomEvent) => void} handler Listener.
 * @returns {() => void} Unsubscribe function.
 */
export function on(type, handler) {
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
}
