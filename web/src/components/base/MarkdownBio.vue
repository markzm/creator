<template>
  <div class="md-bio-content">
    <template v-for="(block, bIdx) in blocks" :key="bIdx">
      <!-- Heading 1 -->
      <h3 v-if="block.type === 'h1'" class="md-h1">
        <WikiText :text="block.text" />
      </h3>

      <!-- Heading 2 -->
      <h4 v-else-if="block.type === 'h2'" class="md-h2">
        <WikiText :text="block.text" />
      </h4>

      <!-- Heading 3 -->
      <h5 v-else-if="block.type === 'h3'" class="md-h3">
        <WikiText :text="block.text" />
      </h5>

      <!-- Blockquote -->
      <blockquote v-else-if="block.type === 'quote'" class="md-quote">
        <WikiText :text="block.text" />
      </blockquote>

      <!-- List item -->
      <div v-else-if="block.type === 'list'" class="md-list-item">
        <span class="md-bullet">•</span>
        <div class="md-list-text">
          <WikiText :text="block.text" />
        </div>
      </div>

      <!-- Horizontal Divider -->
      <hr v-else-if="block.type === 'hr'" class="md-hr" />

      <!-- Paragraph -->
      <p v-else class="md-p">
        <WikiText :text="block.text" />
      </p>
    </template>

    <p v-if="!blocks.length" class="hint" style="font-style: italic">
      暂未填写个人设定简介。点击编辑即可使用 Markdown 记录您的设定世界观体系、创作主页与代表角色。
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import WikiText from './WikiText.vue';

const props = defineProps<{
  content: string;
}>();

interface MdBlock {
  type: 'h1' | 'h2' | 'h3' | 'quote' | 'list' | 'hr' | 'p';
  text: string;
}

const blocks = computed<MdBlock[]>(() => {
  const raw = props.content || '';
  const lines = raw.split(/\r?\n/);
  const result: MdBlock[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('### ')) {
      result.push({ type: 'h3', text: trimmed.slice(4).trim() });
    } else if (trimmed.startsWith('## ')) {
      result.push({ type: 'h2', text: trimmed.slice(3).trim() });
    } else if (trimmed.startsWith('# ')) {
      result.push({ type: 'h1', text: trimmed.slice(2).trim() });
    } else if (trimmed.startsWith('> ')) {
      result.push({ type: 'quote', text: trimmed.slice(2).trim() });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      result.push({ type: 'list', text: trimmed.slice(2).trim() });
    } else if (trimmed === '---' || trimmed === '***') {
      result.push({ type: 'hr', text: '' });
    } else {
      result.push({ type: 'p', text: trimmed });
    }
  }

  return result;
});
</script>

<style scoped>
.md-bio-content {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--ink);
}

.md-h1 {
  font-size: 18px;
  font-weight: 800;
  margin: 16px 0 8px;
  color: var(--ink);
  border-bottom: 1.5px solid var(--li2);
  padding-bottom: 4px;
}

.md-h2 {
  font-size: 15.5px;
  font-weight: 700;
  margin: 14px 0 6px;
  color: var(--ac);
}

.md-h3 {
  font-size: 14px;
  font-weight: 700;
  margin: 12px 0 4px;
  color: var(--ink2);
}

.md-quote {
  margin: 8px 0;
  padding: 6px 14px;
  background: var(--acs);
  border-left: 3px solid var(--ac);
  border-radius: 0 6px 6px 0;
  color: var(--ink2);
  font-size: 13px;
}

.md-list-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0;
}

.md-bullet {
  color: var(--ac);
  font-weight: 800;
  user-select: none;
}

.md-list-text {
  flex: 1;
}

.md-hr {
  border: 0;
  border-top: 1px solid var(--li2);
  margin: 14px 0;
}

.md-p {
  margin: 6px 0;
}
</style>
