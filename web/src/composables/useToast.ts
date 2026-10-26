import { computed, ref } from 'vue';

export type ToastType = 'ok' | 'warn' | 'err' | 'info' | '';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const MAX_VISIBLE = 4;
const toasts = ref<ToastItem[]>([]);
let seq = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function ttlFor(type: ToastType): number {
  if (type === 'err') return 5000;
  if (type === 'warn') return 4000;
  return 2600;
}

export function dismissToast(id: number): void {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  toasts.value = toasts.value.filter((x) => x.id !== id);
}

export function showToast(msg: string, type: ToastType = ''): void {
  const text = String(msg || '').trim();
  if (!text) return;
  // Collapse exact duplicates that are still on screen.
  const dup = toasts.value.find((x) => x.message === text && x.type === type);
  if (dup) {
    dismissToast(dup.id);
  }
  const id = seq++;
  toasts.value = [...toasts.value, { id, message: text, type }].slice(-MAX_VISIBLE);
  timers.set(
    id,
    setTimeout(() => dismissToast(id), ttlFor(type))
  );
}

// Legacy single-toast accessors (kept so older code keeps compiling).
const toastMessage = computed(() => toasts.value[toasts.value.length - 1]?.message || '');
const toastType = computed(() => toasts.value[toasts.value.length - 1]?.type || '');
const toastVisible = computed(() => toasts.value.length > 0);

export function useToast() {
  return {
    toasts,
    toastMessage,
    toastType,
    toastVisible,
    toast: showToast,
    dismiss: dismissToast
  };
}
