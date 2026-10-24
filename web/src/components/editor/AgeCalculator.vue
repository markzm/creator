<template>
  <div class="card open" style="margin-bottom: 18px">
    <div class="card-h" style="cursor: default">
      <span class="idx">🎂</span>
      <h3>{{ tr('角色年龄推算器', 'Character Age Calculator') }}</h3>
    </div>
    <div class="card-b" style="display: block">
      <div class="row" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end">
        <div style="flex: 1; min-width: 120px">
          <label class="f-label">{{ tr('当前基准年', 'Current Base Year') }}</label>
          <input
            type="number"
            :value="docStore.doc.ui.nowYear"
            :placeholder="tr('例：305', 'e.g. 305')"
            @input="onNowYearChange"
          />
        </div>
        <div style="flex: 1.4; min-width: 150px">
          <label class="f-label">{{ tr('选择角色', 'Select Character') }}</label>
          <select v-model="selectedCharId" @change="onSelectChar">
            <option value="">{{ tr('（手动输入年龄）', '(manual age)') }}</option>
            <option v-for="c in namedChars" :key="c.id" :value="c.id">
              {{ c.data.name || c.name }}
            </option>
          </select>
        </div>
        <div style="flex: 1; min-width: 110px">
          <label class="f-label">{{ tr('基准年岁数', 'Age at Base Year') }}</label>
          <input v-model="charAgeInput" type="number" :placeholder="tr('例：18', 'e.g. 18')" />
        </div>
        <div style="flex: 1.5; min-width: 160px">
          <label class="f-label">{{ tr('选择事件', 'Select Event') }}</label>
          <select v-model="selectedEventYear" @change="onSelectEvent">
            <option value="">{{ tr('（手动输入年份）', '(manual year)') }}</option>
            <option v-for="(ev, idx) in datedEvents" :key="idx" :value="String(ev.yearNum)">
              {{ ev.name }}（{{ ev.year || ev.yearNum }}）
            </option>
          </select>
        </div>
        <div style="flex: 1; min-width: 110px">
          <label class="f-label">{{ tr('事件发生年', 'Event Year') }}</label>
          <input v-model="eventYearInput" type="number" :placeholder="tr('例：300', 'e.g. 300')" />
        </div>
      </div>

      <div v-if="calcResultText" style="margin-top: 12px; font-size: 13.5px" :style="{ color: calcIsWarn ? 'var(--wn)' : 'var(--ink)' }">
        {{ calcResultText }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { calculateAgeAtEvent, collectAllEvents } from '../../core/timeline';
import { useDocStore } from '../../stores/doc';

const docStore = useDocStore();
const { tr } = useI18n();

const selectedCharId = ref('');
const charAgeInput = ref('18');
const selectedEventYear = ref('');
const eventYearInput = ref('300');

const namedChars = computed(() =>
  Object.values(docStore.doc.chars || {}).filter((c) => c.data && (c.data.name || c.name))
);

const datedEvents = computed(() =>
  collectAllEvents(docStore.doc).filter((e) => e.yearNum !== null)
);

function onNowYearChange(e: Event) {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  if (!Number.isNaN(val)) {
    docStore.doc.ui.nowYear = val;
    docStore.touch(false, false);
  }
}

function onSelectChar() {
  if (!selectedCharId.value) return;
  const c = docStore.doc.chars[selectedCharId.value];
  if (!c) return;
  const m = String(c.data?.age || '').match(/\d+/);
  if (m) {
    charAgeInput.value = m[0];
  }
}

function onSelectEvent() {
  if (selectedEventYear.value !== '') {
    eventYearInput.value = selectedEventYear.value;
  }
}

const calcIsWarn = ref(false);

const calcResultText = computed(() => {
  const nowY = Number(docStore.doc.ui.nowYear);
  const age = parseInt(charAgeInput.value, 10);
  const evY = parseInt(eventYearInput.value, 10);
  if (!(nowY > 0) || !(age >= 0) || !(evY > 0) || Number.isNaN(age) || Number.isNaN(evY)) {
    calcIsWarn.value = true;
    return tr('请把三个数字填完整（年份和年龄都要有效数字）', 'Fill in all three numbers');
  }
  const res = calculateAgeAtEvent(age, nowY, evY);
  if (!res) {
    calcIsWarn.value = true;
    return '';
  }
  const cname = selectedCharId.value && docStore.doc.chars[selectedCharId.value]
    ? docStore.doc.chars[selectedCharId.value].data.name || docStore.doc.chars[selectedCharId.value].name
    : tr('该角色', 'Character');

  if (res.ageAtEvent < 0) {
    calcIsWarn.value = true;
    return tr(
      `⚠️ 事件发生时「${cname}」还没出生（${-res.ageAtEvent} 年后才于 ${res.birthYear} 年出生）`,
      `⚠️ "${cname}" wasn't born yet (born in year ${res.birthYear})`
    );
  }
  calcIsWarn.value = false;
  return tr(
    `✨ 事件发生时，「${cname}」为 ${res.ageAtEvent} 岁（出生于 ${res.birthYear} 年）`,
    `✨ At the event, "${cname}" was ${res.ageAtEvent} years old (born ${res.birthYear})`
  );
});
</script>
