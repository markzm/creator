import { defineStore } from 'pinia';
import { reactive, ref, watch } from 'vue';
import type { LegacyFieldGroup } from '../core/legacy/fields';
import type { EntityKind } from '../core/schema/types';

export type ModalName =
  | 'auth'
  | 'conflict'
  | 'revisions'
  | 'backup'
  | 'commandPalette'
  | 'tutorial'
  | 'guide'
  | 'aiConfig'
  | 'aiGenerate'
  | 'animeArt'
  | 'creatorProfile'
  | 'adminConsole'
  | 'cocreationManage';

function readLS<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, val: unknown): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(val));
    }
  } catch {
    // Ignore storage errors
  }
}

export const useUIStore = defineStore('ui', () => {
  const lang = ref<'zh' | 'en'>(readLS<'zh' | 'en'>('cc_lang', 'zh') === 'en' ? 'en' : 'zh');
  // null in storage = follow the system; the pre-paint script in index.html mirrors this logic.
  const storedDark = readLS<boolean | null>('cc_dark', null);
  const systemDark =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  const dark = ref<boolean>(storedDark === null ? systemDark : Boolean(storedDark));
  const sidebarCollapsed = ref<boolean>(Boolean(readLS<boolean>('cc_sidebar_collapsed', false)));

  const modals = reactive<Record<ModalName, boolean>>({
    auth: false,
    conflict: false,
    revisions: false,
    backup: false,
    commandPalette: false,
    tutorial: false,
    guide: false,
    aiConfig: false,
    aiGenerate: false,
    animeArt: false,
    creatorProfile: false,
    adminConsole: false,
    cocreationManage: false
  });

  const activeProfileUserId = ref<number | null>(null);

  function openCreatorProfile(userId: number) {
    activeProfileUserId.value = userId;
    modals.creatorProfile = true;
  }

  const guideContext = ref<{
    mode: EntityKind;
    groups: LegacyFieldGroup[];
  } | null>(null);

  function applyDarkClass(isDark: boolean) {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.classList.toggle('dark', isDark);
      root.classList.toggle('light', !isDark);
    }
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    // Follow the OS only while the user has not chosen explicitly.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
      if (readLS<boolean | null>('cc_dark', null) === null) {
        dark.value = e.matches;
      }
    });
  }

  applyDarkClass(dark.value);

  watch(dark, (val) => {
    applyDarkClass(val);
    writeLS('cc_dark', val);
  });

  watch(lang, (val) => {
    writeLS('cc_lang', val);
  });

  watch(sidebarCollapsed, (val) => {
    writeLS('cc_sidebar_collapsed', val);
  });

  function toggleDark() {
    dark.value = !dark.value;
  }

  function toggleLang() {
    lang.value = lang.value === 'zh' ? 'en' : 'zh';
  }

  function setLang(next: 'zh' | 'en') {
    lang.value = next;
  }

  function openModal(name: ModalName) {
    modals[name] = true;
  }

  function closeModal(name: ModalName) {
    modals[name] = false;
  }

  function openGuide(mode: EntityKind, groups: LegacyFieldGroup[]) {
    guideContext.value = { mode, groups };
    modals.guide = true;
  }

  function closeTopModal(): boolean {
    const order: ModalName[] = [
      'commandPalette',
      'revisions',
      'auth',
      'backup',
      'guide',
      'tutorial'
    ];
    for (const k of order) {
      if (modals[k]) {
        modals[k] = false;
        return true;
      }
    }
    return false;
  }

  function checkFirstRunTutorial() {
    if (!readLS<boolean>('cc_tut_done', false)) {
      modals.tutorial = true;
    }
  }

  function markTutorialDone() {
    writeLS('cc_tut_done', true);
    modals.tutorial = false;
  }

  return {
    lang,
    dark,
    sidebarCollapsed,
    modals,
    guideContext,
    toggleDark,
    toggleLang,
    setLang,
    openModal,
    closeModal,
    openGuide,
    closeTopModal,
    checkFirstRunTutorial,
    markTutorialDone,
    activeProfileUserId,
    openCreatorProfile
  };
});
