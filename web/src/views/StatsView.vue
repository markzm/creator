<template>
  <div class="page">
    <PageHeader
      :title="tr('写作看板', 'Writing stats')"
      :subtitle="tr('实时统计设定总字数、角色完成度、连续创作天数与近 14 天趋势。', 'Total words, completion rate, streak and the last 14 days.')"
      :icon="BarChart3"
      tone="var(--ok)"
    >
      <template #actions>
        <button class="btn sm" @click="refreshStats"><RefreshCw /> {{ tr('刷新统计', 'Refresh') }}</button>
      </template>
    </PageHeader>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px">
      <StatTile v-for="(m, idx) in metrics" :key="idx" :value="m.value" :label="m.label" :icon="m.icon" :tone="m.tone" />
    </div>

    <!-- 14-Day SVG Trend Chart -->
    <div class="card open" style="margin-bottom: 20px">
      <div class="card-h" style="cursor: default">
        <span class="idx"><TrendingUp style="width: 13px; height: 13px; vertical-align: -2px" /></span>
        <h3>{{ tr('近 14 天总字数与角色完成度趋势', '14-Day Total Characters & Completion Trend') }}</h3>
      </div>
      <div class="card-b" style="display: block; overflow-x: auto">
        <svg viewBox="0 0 660 210" style="width: 100%; min-width: 520px; height: 210px">
          <!-- Y Grid lines -->
          <g v-for="r in [0, 0.5, 1]" :key="r">
            <line
              :x1="PL"
              :y1="PT + (1 - r) * (H - PT - PB)"
              :x2="W - 8"
              :y2="PT + (1 - r) * (H - PT - PB)"
              stroke="var(--li)"
              stroke-width="0.7"
            />
            <text
              :x="PL - 6"
              :y="PT + (1 - r) * (H - PT - PB) + 4"
              text-anchor="end"
              font-size="10"
              fill="var(--mu)"
            >
              {{ fmtNum(Math.round(maxChars * r)) }}
            </text>
          </g>

          <!-- Bars -->
          <g v-for="(item, i) in chartSeries" :key="item.day">
            <rect
              :x="PL + i * CW + CW * 0.2"
              :y="H - PB - item.barH"
              :width="CW * 0.6"
              :height="item.barH"
              rx="3"
              :fill="item.stat ? 'var(--ac)' : 'var(--li2)'"
            >
              <title>{{ item.day }}{{ item.stat ? ` · ${item.stat.chars} 字 · 完成度 ${item.stat.done ?? 0}%` : ' · 无记录' }}</title>
            </rect>
            <text
              v-if="i % 2 === 0"
              :x="PL + i * CW + CW / 2"
              :y="H - 8"
              text-anchor="middle"
              font-size="10"
              fill="var(--mu)"
            >
              {{ item.day.slice(5) }}
            </text>
          </g>

          <!-- Completion Polyline -->
          <polyline
            :points="polylinePoints"
            fill="none"
            stroke="var(--ok)"
            stroke-width="2"
            stroke-linejoin="round"
          />

          <template v-for="(item, i) in chartSeries" :key="'pt_' + item.day">
            <circle
              v-if="item.stat"
              :cx="PL + i * CW + CW / 2"
              :cy="item.lineY"
              r="3"
              fill="var(--ok)"
            >
              <title>{{ item.day }} · {{ item.stat.done ?? 0 }}%</title>
            </circle>
          </template>

          <text :x="W - 10" :y="PT + 10" text-anchor="end" font-size="10.5" fill="var(--ok)">
            {{ tr('— 完成度 %', '— Done %') }}
          </text>
          <text :x="W - 10" :y="PT + 24" text-anchor="end" font-size="10.5" fill="var(--ac)">
            {{ tr('▮ 总字数', '▮ Total Chars') }}
          </text>
        </svg>
      </div>
    </div>

    <AgeCalculator />
  </div>
</template>

<script setup lang="ts">
import { BarChart3, CircleGauge, Flame, Layers, RefreshCw, TrendingUp, Type } from 'lucide-vue-next';
import { computed, onMounted } from 'vue';
import PageHeader from '../components/base/PageHeader.vue';
import StatTile from '../components/base/StatTile.vue';
import AgeCalculator from '../components/editor/AgeCalculator.vue';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import {
  avgDone,
  dateStr,
  recordDailyStats,
  streakDays,
  totalChars
} from '../core/stats';
import { useDocStore } from '../stores/doc';

const docStore = useDocStore();
const { tr } = useI18n();
const { toast } = useToast();

const W = 660;
const H = 200;
const PL = 46;
const PB = 26;
const PT = 14;
const CW = (W - PL - 10) / 14;

onMounted(() => {
  recordDailyStats(docStore.doc);
});

function refreshStats() {
  recordDailyStats(docStore.doc);
  docStore.touch(true, false);
  toast(tr('已刷新 ✓', 'Refreshed ✓'), 'ok');
}

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

const totalCount = computed(() => totalChars(docStore.doc));
const doneRate = computed(() => avgDone(docStore.doc));
const streak = computed(() => streakDays(docStore.doc));

const todayCount = computed(() => {
  const today = dateStr(new Date());
  const found = (docStore.doc.stats || []).find((s) => s.date === today);
  return found ? found.chars : totalCount.value;
});

const entryCount = computed(
  () =>
    Object.keys(docStore.doc.worlds || {}).length +
    Object.keys(docStore.doc.orgs || {}).length +
    Object.keys(docStore.doc.chars || {}).length
);

const metrics = computed(() => [
  { value: fmtNum(totalCount.value), label: tr('总字数', 'Total words'), icon: Type, tone: '' as const },
  { value: `${doneRate.value}%`, label: tr('角色完成度', 'Char completion'), icon: CircleGauge, tone: 'ok' as const },
  { value: String(entryCount.value), label: tr('核心条目总数', 'Entities'), icon: Layers, tone: 'world' as const },
  { value: `${streak.value} ${tr('天', 'd')}`, label: tr('连续创作', 'Day streak'), icon: Flame, tone: 'warn' as const },
  { value: fmtNum(todayCount.value), label: tr('今日字数', 'Today'), icon: TrendingUp, tone: 'article' as const }
]);

const days14 = computed(() => {
  const arr: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    arr.push(dateStr(d));
  }
  return arr;
});

const maxChars = computed(() => {
  const vals = (docStore.doc.stats || []).map((s) => s.chars || 0);
  return Math.max(100, ...vals, totalCount.value);
});

const chartSeries = computed(() =>
  days14.value.map((day) => {
    const stat = (docStore.doc.stats || []).find((s) => s.date === day) || null;
    const barH = stat ? Math.max(3, (stat.chars / maxChars.value) * (H - PT - PB)) : 3;
    const doneVal = stat ? (stat.done ?? doneRate.value) : 0;
    const lineY = PT + (1 - doneVal / 100) * (H - PT - PB);
    return { day, stat, barH, lineY };
  })
);

const polylinePoints = computed(() =>
  chartSeries.value
    .map((item, i) => `${PL + i * CW + CW / 2},${item.lineY}`)
    .join(' ')
);
</script>
