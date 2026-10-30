<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="tut-mask show"
        :style="{ zIndex: zIndex }"
        @mousedown.self="onBackdrop"
      >
        <div
          ref="boxRef"
          class="tut-box"
          :class="{ 'no-foot': !$slots.footer }"
          :style="{ maxWidth: maxWidth || '540px' }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
          tabindex="-1"
          @keydown="onKeydown"
        >
          <div v-if="title || stepLabel || !persistent" class="modal-head">
            <div style="flex: 1; min-width: 0">
              <div v-if="stepLabel" class="tut-step">{{ stepLabel }}</div>
              <h3 v-if="title" :id="titleId">{{ title }}</h3>
            </div>
            <button
              v-if="!persistent"
              type="button"
              class="icon-btn"
              :aria-label="closeLabel"
              @click="close"
            >
              <X />
            </button>
          </div>
          <div class="modal-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="modal-foot">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  focusableIn,
  isTopLayer,
  layerIndex,
  lockScroll,
  popLayer,
  pushLayer,
  subscribeLayers,
  trapTab,
  unlockScroll
} from '../../composables/useModalStack';
import { useUIStore } from '../../stores/ui';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    stepLabel?: string;
    maxWidth?: string;
    persistent?: boolean;
    /** Use a higher layer (confirm dialogs stack above normal modals). */
    level?: 'modal' | 'confirm';
  }>(),
  { level: 'modal' }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void;
  (e: 'close'): void;
}>();

const uiStore = useUIStore();
const boxRef = ref<HTMLElement | null>(null);
const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
const depth = ref(0);
const zIndex = computed(() => `calc(${props.level === 'confirm' ? 'var(--z-confirm)' : 'var(--z-modal)'} + ${depth.value})`);
const closeLabel = uiStore.lang === 'zh' ? '关闭' : 'Close';

let layerId: number | null = null;
const unsubscribeLayers = subscribeLayers(() => { depth.value = layerId === null ? 0 : Math.max(0, layerIndex(layerId)); });
let restoreFocusTo: HTMLElement | null = null;

function close() {
  if (props.persistent) return;
  emit('update:modelValue', false);
  emit('close');
}

function onBackdrop() {
  if (layerId !== null && !isTopLayer(layerId)) return;
  close();
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    if (layerId !== null && isTopLayer(layerId)) {
      ev.stopPropagation();
      close();
    }
    return;
  }
  if (boxRef.value && layerId !== null && isTopLayer(layerId)) trapTab(boxRef.value, ev);
}

function onOpen() {
  restoreFocusTo = (document.activeElement as HTMLElement | null) || null;
  layerId = pushLayer(close, Boolean(props.persistent));
  depth.value = layerIndex(layerId);
  lockScroll();
  void nextTick(() => {
    const box = boxRef.value;
    if (!box) return;
    const first = focusableIn(box).find((el) => !el.classList.contains('icon-btn')) || focusableIn(box)[0];
    (first || box).focus({ preventScroll: true });
  });
}

function onClose() {
  const wasTop = layerId !== null && isTopLayer(layerId);
  if (layerId !== null) {
    popLayer(layerId);
    layerId = null;
    unlockScroll();
  }
  const target = restoreFocusTo;
  restoreFocusTo = null;
  if (wasTop && target && typeof target.focus === 'function' && document.contains(target)) {
    target.focus({ preventScroll: true });
  }
}

watch(
  () => props.modelValue,
  (open, was) => {
    if (open && !was) onOpen();
    else if (!open && was) onClose();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (props.modelValue) onClose();
  unsubscribeLayers();
});
</script>
