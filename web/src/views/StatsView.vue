<template>
  <div class="page-container" style="max-width: 960px; margin: 0 auto; padding: 20px">
    <div class="row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px">
      <div>
        <h2 style="margin: 0; font-size: 20px">📊 {{ tr('写作看板', 'Writing Stats & Analytics') }}</h2>
        <p class="hint" style="margin: 4px 0 0">
          {{ tr('实时统计设定总字数、角色完成度、连续创作天数与近 14 天趋势。', 'Track total character counts, completion rate, streak days, and 14-day progress.') }}
        </p>
      </div>
      <button class="btn sm" @click="refreshStats">↺ {{ tr('刷新统计', 'Refresh') }}</button>
    </div>

    <!-- Metric Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px">
      <div v-for="(m, idx) in metrics" :key="idx" class="card" style="padding: 16px; text-align: center">
        <div style="font-size: 24px; font-weight: 800; color: var(--ac)">{{ m.value }}</div>
        <div class="hint" style="font-size: 12.5px; margin-top: 4px">{{ m.label }}</div>
      </div>
    </div>

    <!-- 14-Day SVG Trend Chart -->
    <div class="card open" style="margin-bottom: 20px">
      <div class="card-h" style="cursor: default">
        <span class="idx">📈</span>
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
              :fill="item.stat ? '#6366f1' : 'var(--li2)'"
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
            stroke="#059669"
            stroke-width="2"
            stroke-linejoin="round"
          />

          <template v-for="(item, i) in chartSeries" :key="'pt_' + item.day">
            <circle
              v-if="item.stat"
              :cx="PL + i * CW + CW / 2"
              :cy="item.lineY"
              r="3"
              fill="#059669"
            >
              <title>{{ item.day }} · {{ item.stat.done ?? 0 }}%</title>
            </circle>
          </template>

          <text :x="W - 10" :y="PT + 10" text-anchor="end" font-size="10.5" fill="#059669">
            {{ tr('— 完成度 %', '— Done %') }}
          </text>
          <text :x="W - 10" :y="PT + 24" text-anchor="end" font-size="10.5" fill="#6366f1">
            {{ tr('▮ 总字数', '▮ Total Chars') }}
          </text>
        </svg>
      </div>
    </div>

    <AgeCalculator />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
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
  { value: fmtNum(totalCount.value), label: tr('总字数', 'Total Chars') },
  { value: `${doneRate.value}%`, label: tr('角色完成度', 'Char Completion') },
  { value: String(entryCount.value), label: tr('核心条目总数', 'Total Entities') },
  { value: `${streak.value} ${tr('天', 'd')}`, label: tr('连续创作', 'Day Streak') },
  { value: fmtNum(todayCount.value), label: tr('今日字数', 'Today') }
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
