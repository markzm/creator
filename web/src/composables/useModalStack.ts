/**
 * Shared bookkeeping for layered overlays (Modal / Drawer / Confirm):
 * - a stack so Escape only closes the top-most layer,
 * - a reference-counted body scroll lock,
 * - a tiny focus trap (Tab cycling + focus restore).
 * Kept framework-agnostic so it can be unit-tested without mounting components.
 */

export interface ModalLayer {
  id: number;
  close: () => void;
  persistent: boolean;
}

const stack: ModalLayer[] = [];
const listeners = new Set<() => void>();
const notifyLayers = () => listeners.forEach(listener => listener());
export function subscribeLayers(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function layerIndex(id: number): number { return stack.findIndex(layer => layer.id === id); }
let nextId = 1;
let lockCount = 0;
let prevOverflow = '';

export function pushLayer(close: () => void, persistent = false): number {
  const id = nextId++;
  stack.push({ id, close, persistent });
  notifyLayers();
  return id;
}

export function popLayer(id: number): void {
  const idx = stack.findIndex((l) => l.id === id);
  if (idx >= 0) stack.splice(idx, 1);
  notifyLayers();
}

export function isTopLayer(id: number): boolean {
  return stack.length > 0 && stack[stack.length - 1].id === id;
}

export function layerCount(): number {
  return stack.length;
}

/** Closes the top-most non-persistent layer. Returns true when something was closed. */
export function closeTopLayer(): boolean {
  const top = stack[stack.length - 1];
  if (!top || top.persistent) return false;
  top.close();
  return true;
}

export function lockScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }
  lockCount++;
}

export function unlockScroll(): void {
  if (typeof document === 'undefined') return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.documentElement.style.overflow = prevOverflow;
  }
}

export function scrollLockCount(): number {
  return lockCount;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('hidden') && el.offsetParent !== null
  );
}

/** Keeps Tab / Shift+Tab inside `root`. Returns true when the event was handled. */
export function trapTab(root: HTMLElement, ev: KeyboardEvent): boolean {
  if (ev.key !== 'Tab') return false;
  const items = focusableIn(root);
  if (!items.length) {
    ev.preventDefault();
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (ev.shiftKey && (active === first || !root.contains(active))) {
    ev.preventDefault();
    last.focus();
    return true;
  }
  if (!ev.shiftKey && active === last) {
    ev.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/** Test hook: clears all state. */
export function __resetModalStackForTests(): void {
  stack.splice(0, stack.length);
  notifyLayers();
  lockCount = 0;
  if (typeof document !== 'undefined') document.documentElement.style.overflow = '';
}
