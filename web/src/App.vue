<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDocStore } from './stores/doc'
import { useUIStore } from './stores/ui'
import { useAuthStore } from './stores/auth'
import { useSyncStore } from './stores/sync'
import { useAIStore } from './stores/ai'
import { useHotkeys } from './composables/useHotkeys'
import AppSidebar from './components/app/AppSidebar.vue'
import AppTopbar from './components/app/AppTopbar.vue'
import AppMobileNav from './components/app/AppMobileNav.vue'
import AuthModal from './components/app/AuthModal.vue'
import ConflictDialog from './components/app/ConflictDialog.vue'
import RevisionHistoryModal from './components/app/RevisionHistoryModal.vue'
import CommandPalette from './components/app/CommandPalette.vue'
import BackupModal from './components/app/BackupModal.vue'
import TutorialModal from './components/app/TutorialModal.vue'
import AIConfigModal from './components/app/AIConfigModal.vue'
import FieldGuideModal from './components/editor/FieldGuideModal.vue'
import AnimeArtModal from './components/editor/AnimeArtModal.vue'
import CreatorProfileModal from './components/app/CreatorProfileModal.vue'
import AdminConsoleModal from './components/app/AdminConsoleModal.vue'
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

onMounted(async () => {
  await doc.init()
  await sync.init()
  await ai.init()
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
      <!-- Offline Guest Reminder Banner -->
      <aside
        v-if="!auth.isLoggedIn"
        class="offline-banner"
      >
        <div class="offline-banner-content">
          <span class="offline-icon">⚠️</span>
          <span>
            <strong>{{ ui.lang === 'zh' ? '离线体验版（未登录）：' : 'Offline Guest Mode:' }}</strong>
            {{
              ui.lang === 'zh'
                ? '当前设定仅存储于本地临时缓存。登录账号即可解锁个人创作看板、大厅互动、企划共创及云端隔离存储。'
                : 'Data is saved in local temporary cache. Sign in to unlock personal dashboard, community lobby, and cloud isolation.'
            }}
          </span>
        </div>
        <button
          type="button"
          class="btn sm offline-banner-btn"
          @click="ui.openModal('auth')"
        >
          {{ ui.lang === 'zh' ? '立即登录 / 注册' : 'Sign In / Register' }}
        </button>
      </aside>

      <main class="app-viewport">
        <RouterView />
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
    <TutorialModal />
    <FieldGuideModal />
    <AnimeArtModal />
    <CreatorProfileModal />
    <AdminConsoleModal />
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
.offline-banner {
  background: linear-gradient(90deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
  font-size: 12.5px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  z-index: 20;
}
.offline-banner-content {
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.4;
}
.offline-icon {
  font-size: 16px;
  flex-shrink: 0;
}
.offline-banner-btn {
  background: #ffffff !important;
  color: #b45309 !important;
  font-weight: 700 !important;
  border: none !important;
  white-space: nowrap !important;
  padding: 3px 12px !important;
  cursor: pointer;
}
.offline-banner-btn:hover {
  background: #fef3c7 !important;
}
@media (max-width: 900px) {
  .offline-banner {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 12px;
    font-size: 11.5px;
  }
  .app-viewport {
    padding-bottom: 58px;
  }
}
</style>
