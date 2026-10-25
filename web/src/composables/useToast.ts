import { ref } from 'vue';

export type ToastType = 'ok' | 'warn' | 'err' | 'info' | '';

const toastMessage = ref('');
const toastType = ref<ToastType>('');
const toastVisible = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string, type: ToastType = ''): void {
  toastMessage.value = msg;
  toastType.value = type;
  toastVisible.value = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    toastVisible.value = false;
  }, 2500);
}

export function useToast() {
  return {
    toastMessage,
    toastType,
    toastVisible,
    toast: showToast
  };
}
