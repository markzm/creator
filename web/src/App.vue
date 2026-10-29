<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDocStore } from './stores/doc'
import { useUIStore } from './stores/ui'
import { useAuthStore } from './stores/auth'
import { useSyncStore } from './stores/sync'
import { useAIStore } from './stores/ai'
import { useHotkeys } from './composables/useHotkeys'
import { showToast } from './composables/useToast'
import { SESSION_EXPIRED_EVENT } from './data/api'
import AppSidebar from './components/app/AppSidebar.vue'
import AppTopbar from './components/app/AppTopbar.vue'
import AppMobileNav from './components/app/AppMobileNav.vue'
import GuestBanner from './components/app/GuestBanner.vue'
import AuthModal from './components/app/AuthModal.vue'
import ConflictDialog from './components/app/ConflictDialog.vue'
import RevisionHistoryModal from './components/app/RevisionHistoryModal.vue'
import CommandPalette from './components/app/CommandPalette.vue'
import BackupModal from './components/app/BackupModal.vue'
import TutorialModal from './components/app/TutorialModal.vue'
import AICreativeModal from './components/app/AICreativeModal.vue'
import AIConfigModal from './components/app/AIConfigModal.vue'
import FieldGuideModal from './components/editor/FieldGuideModal.vue'
import AnimeArtModal from './components/editor/AnimeArtModal.vue'
import CreatorProfileModal from './components/app/CreatorProfileModal.vue'
import AdminConsoleModal from './components/app/AdminConsoleModal.vue'
import CocreationManageModal from './components/app/CocreationManageModal.vue'
import ToastHost from './components/base/ToastHost.vue'
import ConfirmHost from './components/base/ConfirmHost.vue'

const doc = useDocStore()
const ui = useUIStore()
const auth = useAuthStore()
const sync = useSyncStore()
const ai = useAIStore()
const route = useRoute()

useHotkeys()

function getFocusLabel(): string {
  const rName = String(route.name || 'dashboard')
  if (rName === 'world' && doc.activeWorld) return `世界 · ${doc.activeWorld.name}`
  if (rName === 'org' && doc.activeOrg) return `组织 · ${doc.activeOrg.name}`
  if (rName === 'char' && doc.activeChar) return `角色 · ${doc.activeChar.name}`
  return rName
}

function handleBeforeUnload() {
  void doc.flushSave(false)
}

function handleSessionExpired() {
  void auth.onSessionExpired().then(() => {
    showToast(ui.lang === 'zh' ? '登录已过期，请重新登录以继续同步' : 'Session expired – sign in to keep syncing', 'warn')
    ui.openModal('auth')
  })
}

function handleOnline() {
  if (!auth.isLoggedIn && auth.sessionState === 'unknown') {
    void auth.reprobeSession().then((u) => {
      if (u) void sync.onAuthSuccess()
    })
  }
}

onMounted(async () => {
  await doc.init()
  await sync.init()
  sync.setFocusLabelProvider(getFocusLabel)
  // Session must be known before AI init so the account's AI settings can be loaded.
  const user = await auth.initSession()
  await ai.init()
  ui.checkFirstRunTutorial()
  if (user) {
    await sync.onAuthSuccess()
  }
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
  window.addEventListener('online', handleOnline)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired)
  window.removeEventListener('online', handleOnline)
  sync.stopPresenceHeartbeat()
})
</script>

<template>
  <div class="app-layout" :class="{ 'sidebar-collapsed': ui.sidebarCollapsed }">
    <AppSidebar />
    <div class="app-main">
      <AppTopbar />
      <GuestBanner />

      <main class="app-viewport">
        <RouterView v-slot="{ Component }">
          <Transition name="route" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
      <AppMobileNav />
    </div>

    <!-- Global Modals & Overlays -->
    <AuthModal />
    <ConflictDialog />
    <RevisionHistoryModal />
    <CommandPalette />
    <BackupModal />
    <AIConfigModal />
    <AICreativeModal />
    <TutorialModal />
    <FieldGuideModal />
    <AnimeArtModal />
    <CreatorProfileModal />
    <AdminConsoleModal />
    <CocreationManageModal />
    <ToastHost />
    <ConfirmHost />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg);
  color: var(--ink);
}
.app-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
}
.app-viewport {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}
@media (max-width: 900px) {
  .app-viewport {
    padding-bottom: calc(58px + env(safe-area-inset-bottom));
  }
}
</style>
