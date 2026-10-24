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
