<template>
  <div class="page landing">
    <section class="landing-hero">
      <div class="landing-copy">
        <div class="page-eyebrow" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
          <span>LORELAB · YOUR NEXT STORY STARTS HERE</span>
          <span class="domain-badge">
            <Globe2 style="width: 13px; height: 13px" />
            hi.lorelab.cc
          </span>
        </div>
        <h1 class="display landing-title">
          {{ tr('让想象有迹可循，', 'Give your imagination a home.') }}<br />
          <span>{{ tr('让故事自由生长。', 'Let your stories grow.') }}</span>
        </h1>
        <p class="landing-sub">
          {{
            tr(
              '从一位角色、一处风景，到一个完整的世界。收集灵感，串联设定，在这里写下只属于你的故事。',
              'A worldbuilding studio where worlds, orgs, characters, timelines, plots and stories link to each other. Data lives on your device; sign in to sync across devices, share to the lobby and co-create.'
            )
          }}
        </p>
        <div class="landing-actions">
          <button type="button" class="btn primary lg" @click="uiStore.openModal('auth')">
            <PenLine /> {{ tr('开始我的创作', 'Start creating') }}
          </button>
          <button type="button" class="btn lg" @click="router.push('/inspiration')">
            <Compass /> {{ tr('寻找一点灵感', 'Find inspiration') }}
          </button>
        </div>
        <p class="landing-note">
          <Eye /> {{ tr('自由浏览灵感与社区，登录后开启自己的创作空间。', 'Explore freely. Sign in to start your own studio.') }}
        </p>
      </div>
      <div class="landing-art">
        <VisualImage :src="hero?.src" :srcset="heroThumb && hero ? `${heroThumb.src} ${heroThumb.width}w, ${hero.src} ${hero.width}w` : undefined" sizes="(max-width: 700px) 90vw, 44vw" :width="hero?.width" :height="hero?.height" :alt="originalHero ? '星空下的屋顶创作室，远处连接浮岛与轨道城市' : '晨雾穿过森林，远处的山脊若隐若现'" priority />
        <div class="hero-caption"><span>{{ originalHero ? '星空下，每个故事都有自己的光' : '每一处风景，都藏着一个故事' }}</span><small>{{ originalHero ? 'LORELAB ORIGINAL / 01' : 'PHOTOGRAPHIC INSPIRATION / 01' }}</small></div>
        <span class="hero-corner" aria-hidden="true"><Sparkles :size="16" /> CREATE YOUR OWN UNIVERSE</span>
      </div>
    </section>

    <div class="landing-paths"><RouterLink to="/world"><Globe2 /><span><strong>构筑一个世界</strong><small>从规则与风景开始</small></span><ArrowUpRight /></RouterLink><RouterLink to="/char"><Users /><span><strong>遇见一位角色</strong><small>赋予动机、关系与秘密</small></span><ArrowUpRight /></RouterLink><RouterLink to="/inspiration"><Compass /><span><strong>寻找故事的起点</strong><small>十二种灵感，无限种续写</small></span><ArrowUpRight /></RouterLink></div>

    <InspirationShelf />

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

    <section class="landing-community"><div><span class="page-eyebrow">STORIES ARE BETTER TOGETHER</span><h2>你的世界，也会成为别人的灵感。</h2><p>在创作大厅认识同路人，读一段故事，或加入一场共创。</p></div><RouterLink class="btn primary" to="/lobby">逛逛创作大厅 <ArrowRight :size="16" /></RouterLink></section>

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
          {{ tr('灵感有出处，创作有归处。', 'A place for inspiration. A home for your stories.') }}
        </span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, ArrowUpRight, Bot, CloudUpload, Compass, Eye, Globe2, Link2, PenLine, Radio, Share2, Sparkles, Type, Users } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import StatTile from '../components/base/StatTile.vue';
import VisualImage from '../components/base/VisualImage.vue';
import InspirationShelf from '../components/inspiration/InspirationShelf.vue';
import { inspirationAsset } from '../data/inspiration';
import { useI18n } from '../composables/useI18n';
import { KIND_META } from '../core/entityMeta';
import { api, type GlobalDashboardStats } from '../data/api';
import { useUIStore } from '../stores/ui';

const uiStore = useUIStore();
const router = useRouter();
const { tr } = useI18n();

const originalHero = inspirationAsset('rooftop-studio', 'detail');
const hero = originalHero || inspirationAsset('mist-forest', 'detail');
const heroThumb = inspirationAsset(originalHero ? 'rooftop-studio' : 'mist-forest');
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
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 38px;
  align-items: center;
  padding: 36px 0 42px;
}
.landing-title {
  font-size: clamp(29px, 3.4vw, 44px);
  font-family: var(--font-ui);
  font-weight: 800;
  line-height: 1.45;
  letter-spacing: -.045em;
  margin: 20px 0 16px;
}
.landing-title > span { color: var(--ac); }
.landing-sub { color: var(--mu); font-size: var(--fs-15); line-height: 1.75; margin: 0 0 20px; max-width: 58ch; }
.landing-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.landing-note { display: flex; align-items: flex-start; gap: 6px; color: var(--mu); font-size: var(--fs-12); margin: 16px 0 0; line-height: 1.7; }
.landing-note svg { width: 14px; height: 14px; }
.landing-art {
  position: relative;
  min-width: 0;
  aspect-ratio: 1.12;
  border-radius: 24px 24px 64px 24px;
  box-shadow: var(--el-3);
  background: var(--soft);
}
.landing-art > .visual-image { width: 100%; height: 100%; border-radius: inherit; }
.hero-caption { position: absolute; inset: auto 0 0; padding: 54px 22px 24px; background: linear-gradient(transparent, #11172dd9); color: #fff; border-radius: 0 0 64px 24px; }
.hero-caption span { font-size: 13px; font-weight: 600; } .hero-caption small { display: block; font-size: 9px; letter-spacing: .13em; margin-top: 7px; opacity: .8; }
.hero-corner { position: absolute; top: 18px; left: -20px; display: inline-flex; gap: 8px; align-items: center; padding: 11px 14px; background: var(--card); color: var(--ac); font-size: 9px; font-weight: 700; letter-spacing: .07em; border: 1px solid var(--li); border-radius: 9px; box-shadow: var(--el-2); transform: rotate(-3deg); }
.landing-paths { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; padding: 22px 0; border-top: 1px solid var(--li); border-bottom: 1px solid var(--li); }
.landing-paths a { display: flex; align-items: center; gap: 12px; text-decoration: none; color: var(--ink); padding: 5px 12px; min-width: 0; }
.landing-paths a > svg:first-child { color: var(--ac); background: var(--acs); padding: 9px; width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; }
.landing-paths a > svg:last-child { width: 15px; color: var(--mu); margin-left: auto; }
.landing-paths strong { display: block; font-size: 13px; margin-bottom: 5px; } .landing-paths small { color: var(--mu); font-size: 10px; }
.landing-community { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 28px; margin-top: 30px; border-radius: 18px; background: var(--acs); border: 1px solid var(--li); }
.landing-community h2 { font-size: 21px; margin: 10px 0; letter-spacing: -.03em; } .landing-community p { color: var(--mu); font-size: 12px; line-height: 1.8; margin: 0; }
@media (max-width: 1050px) { .landing-hero { gap: 24px; } .landing-paths { gap: 5px; } .landing-paths a { padding: 5px 0; gap: 8px; } }
@media (max-width: 700px) { .landing-hero { grid-template-columns: 1fr; padding-top: 14px; } .landing-art { aspect-ratio: 1.5; margin: 0 4px; } .hero-corner { left: -8px; top: 12px; } .landing-paths { grid-template-columns: 1fr; gap: 12px; } .landing-paths a { padding: 3px 4px; } .landing-community { align-items: start; flex-direction: column; padding: 22px; } }
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
  .landing-art { aspect-ratio: 1.6; }
  .landing-footer { flex-direction: column; align-items: flex-start; }
}
</style>
