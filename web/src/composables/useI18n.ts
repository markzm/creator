import { computed } from 'vue';
import { T, TUT } from '../core/legacy/i18n';
import { useUIStore } from '../stores/ui';

export function useI18n() {
  const ui = useUIStore();
  const lang = computed(() => ui.lang);
  const t = computed(() => T[ui.lang]);
  const tutSteps = computed(() => TUT[ui.lang]);

  function tr(zhText: string, enText: string): string {
    return ui.lang === 'zh' ? zhText : enText;
  }

  return {
    lang,
    t,
    tutSteps,
    tr
  };
}

/**
 * Language-aware string for code that runs outside a component (stores, composables).
 * Reads the UI store lazily so it is safe during store setup.
 */
export function trStatic(zhText: string, enText: string): string {
  try {
    return useUIStore().lang === 'zh' ? zhText : enText;
  } catch {
    return zhText;
  }
}
