<template>
  <Modal
    v-model="uiStore.modals.commandPalette"
    :title="'🔍 ' + tr('全局搜索与快捷命令', 'Global Search & Commands')"
    max-width="620px"
  >
    <input
      ref="inputRef"
      v-model="query"
      type="text"
      :placeholder="tr('搜索名称、任意设定内容，或执行快捷命令…', 'Search names, fields, or run commands…')"
      autocomplete="off"
      @keydown.enter.prevent="onEnterFirst"
    />

    <div style="max-height: 52vh; overflow-y: auto; margin-top: 12px">
      <template v-if="!query.trim()">
        <p class="hint" style="display: block; margin-bottom: 10px">
          {{ tr('快捷命令：', 'Quick Actions:') }}
        </p>
        <div
          v-for="(cmd, idx) in quickCommands"
          :key="idx"
          class="sres"
          @click="cmd.run()"
        >
          <span class="k">CMD</span>
          <strong>{{ cmd.label }}</strong>
        </div>
      </template>

      <template v-else>
        <p v-if="!hits.length" class="hint" style="display: block">
          {{ tr('没有匹配结果。', 'No matching results.') }}
        </p>
        <div
          v-for="(h, idx) in hits"
          :key="idx"
          class="sres"
          @click="jumpToHit(h)"
        >
          <span class="k">{{ kindLabel(h.kind) }}</span>
          <strong>{{ h.name }}</strong>
          <span v-if="h.where" class="m">{{ h.where }}</span>
        </div>
      </template>
    </div>

    <template #footer>
      <span class="row-help" style="margin-right: auto">⌘/Ctrl + K</span>
      <button type="button" class="btn sm" @click="uiStore.closeModal('commandPalette')">
        {{ tr('关闭', 'Close') }}
      </button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../../composables/useI18n';
import { globalSearch, type SearchHit } from '../../core/search';
import { useDocStore } from '../../stores/doc';
import { useUIStore } from '../../stores/ui';
import Modal from '../base/Modal.vue';

const uiStore = useUIStore();
const docStore = useDocStore();
const router = useRouter();
const { lang, tr } = useI18n();

const query = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

watch(
  () => uiStore.modals.commandPalette,
  (open) => {
    if (open) {
      query.value = '';
      nextTick(() => inputRef.value?.focus());
    }
  }
);

const hits = computed(() =>
  globalSearch(docStore.doc, query.value, lang.value, 40)
);

const quickCommands = computed(() => [
  {
    label: '🌍 ' + tr('新建世界观', 'New World'),
    run: () => {
      docStore.createWorld();
      uiStore.closeModal('commandPalette');
      router.push('/world');
    }
  },
  {
    label: '🏛️ ' + tr('新建组织', 'New Organization'),
    run: () => {
      docStore.createOrg();
      uiStore.closeModal('commandPalette');
      router.push('/org');
    }
  },
  {
    label: '👤 ' + tr('新建角色', 'New Character'),
    run: () => {
      docStore.createChar();
      uiStore.closeModal('commandPalette');
      router.push('/char');
    }
  },
  {
    label: '💾 ' + tr('备份 / 恢复 / 导出 Markdown 合集', 'Backup & Export Markdown'),
    run: () => {
      uiStore.closeModal('commandPalette');
      uiStore.openModal('backup');
    }
  },
  {
    label: '🎨 ' + tr('外观与套装 · 灵感手札 / 绯月档案', 'Appearance · Studio journal / Crimson moon'),
    run: () => {
      uiStore.closeModal('commandPalette');
      uiStore.openModal('appearance');
    }
  },
  {
    label: (uiStore.dark ? '☀️ ' : '🌙 ') + tr('切换浅色/暗色主题', 'Toggle Dark Theme'),
    run: () => {
      uiStore.toggleDark();
      uiStore.closeModal('commandPalette');
    }
  },
  {
    label: '🌐 ' + tr('切换中英文语言', 'Switch Language (ZH/EN)'),
    run: () => {
      uiStore.toggleLang();
      uiStore.closeModal('commandPalette');
    }
  }
]);

function kindLabel(kind: SearchHit['kind']): string {
  const map: Record<SearchHit['kind'], string> = {
    world: tr('世界观', 'World'),
    org: tr('组织', 'Org'),
    char: tr('角色', 'Char'),
    event: tr('事件', 'Event'),
    scene: tr('场景', 'Scene'),
    plot: tr('剧情', 'Plot'),
    glossary: tr('术语', 'Glossary')
  };
  return map[kind] || kind;
}

function jumpToHit(h: SearchHit) {
  uiStore.closeModal('commandPalette');
  if (h.kind === 'world') {
    docStore.selectWorld(h.id);
    router.push('/world');
  } else if (h.kind === 'org') {
    docStore.selectOrg(h.id);
    router.push('/org');
  } else if (h.kind === 'char') {
    docStore.selectChar(h.id);
    router.push('/char');
  } else if (h.kind === 'event') {
    router.push('/timeline');
  } else if (h.kind === 'scene') {
    router.push('/scenes');
  } else if (h.kind === 'plot') {
    router.push('/plots');
  } else if (h.kind === 'glossary') {
    router.push('/glossary');
  }
}

function onEnterFirst() {
  if (hits.value.length > 0) {
    jumpToHit(hits.value[0]);
  }
}
</script>
