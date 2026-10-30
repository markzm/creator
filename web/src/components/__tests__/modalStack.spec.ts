import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetModalStackForTests,
  closeTopLayer,
  isTopLayer,
  layerCount,
  layerIndex,
  lockScroll,
  popLayer,
  pushLayer,
  scrollLockCount,
  subscribeLayers,
  trapTab,
  unlockScroll
} from '../../composables/useModalStack';

describe('useModalStack — overlay bookkeeping', () => {
  afterEach(() => __resetModalStackForTests());

  it('Escape semantics: only the top-most, non-persistent layer closes', () => {
    const closed: string[] = [];
    const a = pushLayer(() => closed.push('a'));
    const b = pushLayer(() => closed.push('b'), true); // persistent (conflict dialog)
    expect(isTopLayer(a)).toBe(false);
    expect(isTopLayer(b)).toBe(true);
    expect(closeTopLayer()).toBe(false); // persistent top -> nothing closes
    popLayer(b);
    expect(closeTopLayer()).toBe(true);
    expect(closed).toEqual(['a']);
    expect(layerCount()).toBe(1); // closing is the component's job; the stack entry is popped on close
  });

  it('scroll lock is reference counted', () => {
    lockScroll();
    lockScroll();
    expect(scrollLockCount()).toBe(2);
    expect(document.documentElement.style.overflow).toBe('hidden');
    unlockScroll();
    expect(document.documentElement.style.overflow).toBe('hidden');
    unlockScroll();
    expect(document.documentElement.style.overflow).toBe('');
    unlockScroll(); // never negative
    expect(scrollLockCount()).toBe(0);
  });

  it('notifies visual layers when lower dialogs close so the next overlay stays on top', () => {
    const updates: number[][] = [];
    const a = pushLayer(() => {}), b = pushLayer(() => {});
    const off = subscribeLayers(() => updates.push([layerIndex(a), layerIndex(b)]));
    popLayer(a);
    expect(updates.at(-1)).toEqual([-1, 0]);
    const c = pushLayer(() => {});
    expect(layerIndex(c)).toBeGreaterThan(layerIndex(b));
    off(); popLayer(c); popLayer(b);
  });

  it('trapTab cycles focus inside the root', () => {
    const root = document.createElement('div');
    root.innerHTML = '<button id="a">a</button><input id="b" /><button id="c">c</button>';
    document.body.appendChild(root);
    // jsdom has no layout: make offsetParent non-null
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { get: () => document.body, configurable: true });
    const a = root.querySelector<HTMLButtonElement>('#a')!;
    const c = root.querySelector<HTMLButtonElement>('#c')!;
    c.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    expect(trapTab(root, tab)).toBe(true);
    expect(document.activeElement).toBe(a);
    const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    expect(trapTab(root, shiftTab)).toBe(true);
    expect(document.activeElement).toBe(c);
    const other = new KeyboardEvent('keydown', { key: 'Enter' });
    expect(trapTab(root, other)).toBe(false);
    root.remove();
  });
});
