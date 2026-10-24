import { ref } from 'vue';

const confirmVisible = ref(false);
const confirmTitle = ref('');
const confirmMessage = ref('');
let resolver: ((ok: boolean) => void) | null = null;

export function askConfirm(title: string, message: string): Promise<boolean> {
  confirmTitle.value = title;
  confirmMessage.value = message;
  confirmVisible.value = true;
  return new Promise<boolean>((resolve) => {
    resolver = resolve;
  });
}

export function resolveConfirm(ok: boolean): void {
  confirmVisible.value = false;
  if (resolver) {
    const fn = resolver;
    resolver = null;
    fn(ok);
  }
}

export function useConfirm() {
  return {
    confirmVisible,
    confirmTitle,
    confirmMessage,
    confirm: askConfirm,
    resolveConfirm
  };
}
