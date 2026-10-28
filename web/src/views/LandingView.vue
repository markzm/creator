<template>
  <div class="page landing">
    <section class="landing-hero">
      <div class="landing-copy">
        <div class="page-eyebrow" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
          <span>{{ tr('本地优先 · 云端同步 · 创作社区', 'Local-first · Cloud sync · Community') }}</span>
          <span class="domain-badge">
            <Globe2 style="width: 13px; height: 13px" />
            hi.lorelab.cc
          </span>
        </div>
        <h1 class="display landing-title">
          {{ tr('把脑海中的世界，', 'Give the world in your head') }}<br />
          {{ tr('一条条设定写下来。', 'a place to live.') }}
        </h1>
        <p class="landing-sub">
          {{
            tr(
              '世界观、组织、角色、时间线、剧情与文章互相链接的设定工作台。数据保存在你的设备上，登录后跨设备同步，并可发布到创作大厅与他人共创。',
              'A worldbuilding studio where worlds, orgs, characters, timelines, plots and stories link to each other. Data lives on your device; sign in to sync across devices, share to the lobby and co-create.'
            )
          }}
        </p>
        <div class="landing-actions">
          <button type="button" class="btn primary lg" @click="uiStore.openModal('auth')">
            <LogIn /> {{ tr('登录 / 注册', 'Sign in / Register') }}
          </button>
          <button type="button" class="btn lg" @click="router.push('/char')">
            <BookOpen /> {{ tr('先看看官方范例', 'Browse the examples') }}
          </button>
          <button type="button" class="btn lg ghost" @click="router.push('/lobby')">
            <Users /> {{ tr('逛逛创作大厅', 'Visit the lobby') }}
          </button>
        </div>
        <p class="landing-note">
          <Eye /> {{ tr('未登录时为只读演示：可以查阅范例与大厅，创建与 AI 功能需要账号。', 'Signed-out mode is read-only: browse examples and the lobby; creating and AI need an account.') }}
        </p>
      </div>
      <div class="landing-art" aria-hidden="true">
        <div v-for="k in artKinds" :key="k" class="art-chip" :style="{ color: kindMeta(k).color, background: kindMeta(k).soft }">
          <component :is="kindMeta(k).icon" />
          <span>{{ kindLabel(k, uiStore.lang) }}</span>
        </div>
      </div>
    </section>

    <section class="landing-grid">
      <article v-for="f in features" :key="f.title" class="card flat landing-feature">
        <span class="feature-icon" :style="{ color: f.color, background: f.soft }"><component :is="f.icon" /></span>
        <h3>{{ f.title }}</h3>
        <p>{{ f.desc }}</p>
      </article>
    </section>

    <section class="landing-stats" v-if="stats">
      <StatTile :value="stats.totalUsers" :label="tr('注册创作者', 'Creators')" :icon="Users" />
      <StatTile :value="stats.totalPublicShares" :label="tr('公开创作', 'Public creations')" :icon="Share2" tone="world" />
      <StatTile :value="formatNum(stats.totalPublicWords)" :label="tr('公开创作用字', 'Public words')" :icon="Type" tone="article" />
      <StatTile :value="stats.onlineUsers" :label="tr('当前在线', 'Online now')" :icon="Radio" tone="ok" />
    </section>

    <!-- Footer Domain & Project Info -->
    <footer class="landing-footer">
      <div class="footer-brand">
        <Sparkles style="width: 16px; height: 16px; color: var(--ac)" />
        <span>设定创作器 · <strong>LoreLab</strong></span>
      </div>
      <div class="footer-links">
        <span class="footer-item">
          <Globe2 style="width: 14px; height: 14px" />
          {{ tr('官方访问入口', 'Official Domain') }}: <code>hi.lorelab.cc</code>
        </span>
        <span class="footer-sep">·</span>
        <span class="footer-item">
          {{ tr('已开启 Cloudflare 边缘安全防护与高可用云端同步', 'Protected by Cloudflare Edge & High Availability Sync') }}
        </span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { BookOpen, Bot, CloudUpload, Eye, Globe2, Link2, LogIn, Radio, Share2, Sparkles, Type, Users } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import StatTile from '../components/base/StatTile.vue';
import { useI18n } from '../composables/useI18n';
import { KIND_META, kindLabel, kindMeta } from '../core/entityMeta';
import { api, type GlobalDashboardStats } from '../data/api';
import { useUIStore } from '../stores/ui';

const uiStore = useUIStore();
const router = useRouter();
const { tr } = useI18n();

const artKinds = ['world', 'org', 'char', 'article', 'timeline', 'graph', 'plot', 'scene', 'glossary'] as const;
const stats = ref<GlobalDashboardStats | null>(null);

const features = computed(() => [
  {
    icon: Link2,
    color: KIND_META.world.color,
    soft: KIND_META.world.soft,
    title: tr('设定维基式双向链接', 'Wiki-style backlinks'),
    desc: tr('在任何字段里写下角色或组织的名字，就会自动变成可点击的引用，并在对方页面显示反向链接。', 'Mention a character or org anywhere and it becomes a link, with backlinks on the other side.')
  },
  {
    icon: CloudUpload,
    color: KIND_META.article.color,
    soft: KIND_META.article.soft,
    title: tr('本地优先，云端合并', 'Local-first, merged in the cloud'),
    desc: tr('数据先存在浏览器里，离线也能写。登录后多端同步，逐字段三路合并，冲突逐项选择。', 'Your data is saved in the browser first. Sign in to sync devices with field-level 3-way merge.')
  },
  {
    icon: Bot,
    color: 'var(--ac)',
    soft: 'var(--acs)',
    title: tr('AI 辅助但不接管', 'AI that assists, not takes over'),
    desc: tr('按字段生成、一键人设、续写与摘要；可用公共免费模型，也可接入自己的 API Key。', 'Per-field generation, personas, continuation and summaries; public free models or your own key.')
  },
  {
    icon: Users,
    color: KIND_META.org.color,
    soft: KIND_META.org.soft,
    title: tr('创作大厅与共创企划', 'Lobby & co-creation'),
    desc: tr('公开你的设定与故事，为别人的世界创作同人，经企划团队审核后转为官方正典。', 'Publish your lore, write doujin for other worlds, and get it canonised by the project team.')
  }
]);

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

onMounted(() => {
  api
    .getGlobalStats()
    .then((s) => (stats.value = s))
    .catch(() => {
      // offline: stats are optional
    });
});
</script>

<style scoped>
.landing { max-width: var(--w-wide); }
.landing-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: 32px;
  align-items: center;
  padding: 28px 8px 36px;
}
.landing-title {
  font-size: clamp(30px, 4.2vw, 44px);
  line-height: 1.15;
  margin: 8px 0 14px;
  background: linear-gradient(120deg, var(--ink) 0%, var(--ac) 70%, #ec4899 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.landing-sub { color: var(--mu); font-size: var(--fs-15); line-height: 1.75; margin: 0 0 20px; max-width: 58ch; }
.landing-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.landing-note { display: flex; align-items: center; gap: 6px; color: var(--mu2); font-size: var(--fs-12); margin: 16px 0 0; }
.landing-note svg { width: 14px; height: 14px; }
.landing-art {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  transform: rotate(-4deg);
}
.art-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 10px;
  border-radius: 16px;
  font-size: var(--fs-12);
  font-weight: 700;
  box-shadow: var(--el-1);
  animation: cardIn 0.6s var(--e) both;
}
.art-chip:nth-child(2n) { transform: translateY(10px); }
.art-chip svg { width: 24px; height: 24px; }
.landing-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}
.landing-feature { padding: 20px; }
.feature-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.feature-icon svg { width: 20px; height: 20px; }
.landing-feature h3 { margin: 0 0 6px; }
.landing-feature p { margin: 0; color: var(--mu); font-size: var(--fs-13); line-height: 1.6; }
.landing-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
.domain-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  background: var(--acs);
  color: var(--ac);
  border-radius: 99px;
  font-size: var(--fs-11);
  font-weight: 700;
  letter-spacing: 0.2px;
}
.landing-footer {
  margin-top: 48px;
  padding: 20px 8px 12px;
  border-top: 1px solid var(--li2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--mu);
  font-size: var(--fs-12);
}
.footer-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--ink);
}
.footer-links {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.footer-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.footer-item code {
  font-family: var(--font-mono, monospace);
  color: var(--ac);
  background: var(--acs);
  padding: 1px 5px;
  border-radius: 4px;
}
.footer-sep {
  color: var(--li);
}
@media (max-width: 900px) {
  .landing-hero { grid-template-columns: 1fr; padding-top: 12px; }
  .landing-art { display: none; }
  .landing-footer { flex-direction: column; align-items: flex-start; }
}
</style>
