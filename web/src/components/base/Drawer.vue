<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="modelValue"
        class="tut-mask show"
        style="justify-content: flex-end; padding: 0; z-index: var(--z-drawer)"
        @mousedown.self="close"
      >
        <aside
          ref="panelRef"
          class="drawer-panel"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          @keydown="onKeydown"
        >
          <div class="drawer-head">
            <h3 style="margin: 0; font-size: var(--fs-17); flex: 1">{{ title }}</h3>
            <button type="button" class="icon-btn" :aria-label="uiStore.lang === 'zh' ? '关闭' : 'Close'" @click="close">
              <X />
            </button>
          </div>
          <div class="drawer-body">
            <slot />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { isTopLayer, lockScroll, popLayer, pushLayer, trapTab, unlockScroll } from '../../composables/useModalStack';
import { useUIStore } from '../../stores/ui';

const props = defineProps<{
  modelValue: boolean;
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
}>();

const uiStore = useUIStore();
const panelRef = ref<HTMLElement | null>(null);
let layerId: number | null = null;

function close() {
  emit('update:modelValue', false);
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && layerId !== null && isTopLayer(layerId)) {
    ev.stopPropagation();
    close();
    return;
  }
  if (panelRef.value) trapTab(panelRef.value, ev);
}

watch(
  () => props.modelValue,
  (open, was) => {
    if (open && !was) {
      layerId = pushLayer(close);
      lockScroll();
      void nextTick(() => panelRef.value?.focus({ preventScroll: true }));
    } else if (!open && was && layerId !== null) {
      popLayer(layerId);
      layerId = null;
      unlockScroll();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (layerId !== null) {
    popLayer(layerId);
    unlockScroll();
  }
});
</script>

<style scoped>
.drawer-panel {
  background: var(--card);
  width: min(480px, 100vw);
  height: 100dvh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--el-4);
  outline: none;
}
.drawer-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 22px 12px;
  border-bottom: 1px solid var(--li2);
}
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px 24px;
}
</style>
