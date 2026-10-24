<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDocStore } from './stores/doc'
import { useUIStore } from './stores/ui'
import { useAuthStore } from './stores/auth'
import { useSyncStore } from './stores/sync'
import { useHotkeys } from './composables/useHotkeys'
import AppSidebar from './components/app/AppSidebar.vue'
import AppTopbar from './components/app/AppTopbar.vue'
import AuthModal from './components/app/AuthModal.vue'
import ConflictDialog from './components/app/ConflictDialog.vue'
import RevisionHistoryModal from './components/app/RevisionHistoryModal.vue'
import CommandPalette from './components/app/CommandPalette.vue'
import BackupModal from './components/app/BackupModal.vue'
import TutorialModal from './components/app/TutorialModal.vue'
import FieldGuideModal from './components/editor/FieldGuideModal.vue'
import ToastHost from './components/base/ToastHost.vue'
import ConfirmHost from './components/base/ConfirmHost.vue'

const doc = useDocStore()
const ui = useUIStore()
const auth = useAuthStore()
const sync = useSyncStore()
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

onMounted(async () => {
  await doc.init()
  await sync.init()
  ui.checkFirstRunTutorial()
  const user = await auth.initSession()
  if (user) {
    await sync.onAuthSuccess(getFocusLabel)
  }
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  sync.stopPresenceHeartbeat()
})
</script>

<template>
  <div class="app-layout" :class="{ 'sidebar-collapsed': ui.sidebarCollapsed }">
    <AppSidebar />
    <div class="app-main">
      <AppTopbar />
      <main class="app-viewport">
        <RouterView />
      </main>
    </div>

    <!-- Global Modals & Overlays -->
    <AuthModal />
    <ConflictDialog />
    <RevisionHistoryModal />
    <CommandPalette />
    <BackupModal />
    <TutorialModal />
    <FieldGuideModal />
    <ToastHost />
    <ConfirmHost />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
  color: var(--ink);
}
.app-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.app-viewport {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  position: relative;
}
</style>
