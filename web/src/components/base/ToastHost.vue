<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast-item"
          :class="t.type"
          :role="t.type === 'err' ? 'alert' : 'status'"
        >
          <component :is="iconFor(t.type)" />
          <span>{{ t.message }}</span>
          <button type="button" class="toast-close" :aria-label="closeLabel" @click="dismiss(t.id)">
            <X style="width: 14px; height: 14px" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-vue-next';
import { useToast, type ToastType } from '../../composables/useToast';
import { useUIStore } from '../../stores/ui';

const { toasts, dismiss } = useToast();
const uiStore = useUIStore();
const closeLabel = uiStore.lang === 'zh' ? '关闭提示' : 'Dismiss';

function iconFor(type: ToastType) {
  if (type === 'ok') return CheckCircle2;
  if (type === 'warn') return AlertTriangle;
  if (type === 'err') return XCircle;
  return Info;
}
</script>
