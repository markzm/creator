import { onMounted, onUnmounted } from 'vue';
import { useUIStore } from '../stores/ui';
import { closeTopLayer, layerCount } from './useModalStack';

export function useHotkeys() {
  const ui = useUIStore();

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      ui.modals.commandPalette = !ui.modals.commandPalette;
      return;
    }
    if (e.key === 'Escape') {
      // Dynamic dialog content can remove the focused control. The shared stack
      // still knows which local or global overlay owns Escape in that case.
      if (layerCount()) closeTopLayer();
      else ui.closeTopModal();
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown);
  });
}
