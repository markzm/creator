import { onMounted, onUnmounted } from 'vue';
import { useUIStore } from '../stores/ui';

export function useHotkeys() {
  const ui = useUIStore();

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      ui.modals.commandPalette = !ui.modals.commandPalette;
      return;
    }
    if (e.key === 'Escape') {
      ui.closeTopModal();
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown);
  });
}
