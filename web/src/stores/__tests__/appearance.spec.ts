import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../../../index.html?raw';
import { useUIStore } from '../ui';

let pinia: Pinia;
beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  delete document.documentElement.dataset.skin;
  delete document.documentElement.dataset.decorations;
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => { disposePinia(pinia); vi.restoreAllMocks(); });

describe('appearance preferences stay local and tolerate old or corrupt storage', () => {
  it('keeps light/dark independent while remembering skin and ornaments', () => {
    localStorage.setItem('cc_dark', 'true');
    localStorage.setItem('creator_document_sentinel', '{"title":"untouched"}');
    const ui = useUIStore();
    ui.setSkin('anime');
    ui.decorations = false;
    expect(ui.dark).toBe(true);
    expect(document.documentElement.dataset.skin).toBe('anime');
    expect(document.documentElement.dataset.decorations).toBe('off');
    ui.setSkin('classic');
    expect(ui.dark).toBe(true);
    expect(localStorage.getItem('cc_skin')).toBe('"classic"');
    expect(localStorage.getItem('cc_theme_decorations')).toBe('false');
    expect(localStorage.getItem('creator_document_sentinel')).toBe('{"title":"untouched"}');
  });
  it('rejects unknown skin IDs and malformed persisted values', () => {
    localStorage.setItem('cc_skin', '"untrusted-theme"');
    localStorage.setItem('cc_theme_decorations', '{broken');
    const ui = useUIStore();
    expect(ui.skin).toBe('classic');
    expect(ui.decorations).toBe(true);
    ui.setSkin('untrusted-theme' as any);
    expect(document.documentElement.dataset.skin).toBe('classic');
  });
  it('reflects another tab and removes its listener on store disposal', () => {
    const ui = useUIStore();
    localStorage.setItem('cc_skin', '"anime"');
    window.dispatchEvent(new StorageEvent('storage', { key: 'cc_skin', storageArea: localStorage }));
    expect(ui.skin).toBe('anime');
    ui.$dispose();
    localStorage.setItem('cc_skin', '"classic"');
    window.dispatchEvent(new StorageEvent('storage', { key: 'cc_skin', storageArea: localStorage }));
    expect(ui.skin).toBe('anime');
  });
  it('continues to work when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const ui = useUIStore();
    expect(() => ui.setSkin('anime')).not.toThrow();
    expect(document.documentElement.dataset.skin).toBe('anime');
  });
  it.each(['"anime"', '"classic"', '"unknown"', '{broken'])('matches the pre-paint skin for %s', stored => {
    localStorage.setItem('cc_skin', stored);
    localStorage.setItem('cc_dark', 'true');
    localStorage.setItem('cc_theme_decorations', 'false');
    const script = indexHtml.match(/<script>([\s\S]*?)<\/script>/)![1]!;
    window.eval(script);
    const before = { skin: document.documentElement.dataset.skin, decorations: document.documentElement.dataset.decorations };
    const ui = useUIStore();
    expect(before.skin).toBe(ui.skin);
    expect(document.documentElement.dataset.skin).toBe(before.skin);
    expect(document.documentElement.dataset.decorations).toBe(before.decorations);
    // Corrupt skin JSON must not prevent other preferences from being restored.
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(ui.decorations).toBe(false);
  });
});
