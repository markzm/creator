<template>
  <Modal v-model="ui.modals.appearance" :title="tr('外观与套装', 'Appearance & skins')" max-width="740px">
    <p class="appearance-intro">{{ tr('为你的创作空间，选择一种气质。', 'Make your studio feel like your own world.') }}</p>
    <fieldset class="appearance-fieldset">
      <legend>{{ tr('界面套装', 'Interface skin') }}</legend>
      <div class="skin-options">
        <label v-for="option in options" :key="option.id" class="skin-choice" :class="{ selected: ui.skin === option.id }">
          <input type="radio" name="skin" :value="option.id" :checked="ui.skin === option.id" @change="ui.setSkin(option.id)" />
          <span class="skin-preview" :class="option.id" aria-hidden="true">
            <span class="mini-sidebar"><Sparkles :size="15" /><i /><i /><i /></span>
            <span class="mini-canvas">
              <span class="mini-eyebrow">{{ option.id === 'anime' ? 'WORLDLINE / CHAPTER_00' : 'YOUR NEXT CHAPTER' }}</span>
              <span class="mini-heading">{{ option.id === 'anime' ? '由你改写，世界线。' : '让故事自由生长。' }}</span>
              <span class="mini-lines"><i /><i /></span>
              <span class="mini-cards"><i /><i /><i /></span>
            </span>
            <AnimeSigil v-if="option.id === 'anime'" class="mini-sigil" />
          </span>
          <span class="skin-info"><span><strong>{{ option.title }}</strong><small>{{ option.tag }}</small></span><CircleCheck v-if="ui.skin === option.id" :size="19" aria-hidden="true" /></span>
          <span class="skin-description">{{ option.description }}</span>
        </label>
      </div>
    </fieldset>
    <fieldset class="appearance-fieldset lighting">
      <legend>{{ tr('明暗模式', 'Color mode') }}</legend>
      <div class="lighting-options">
        <label :class="{ selected: !ui.dark }"><input type="radio" name="lighting" :checked="!ui.dark" @change="ui.dark = false" /><Sun :size="17" /><span>{{ tr('浅色 · 白昼', 'Light · Daybreak') }}</span></label>
        <label :class="{ selected: ui.dark }"><input type="radio" name="lighting" :checked="ui.dark" @change="ui.dark = true" /><Moon :size="17" /><span>{{ tr('深色 · 永夜', 'Dark · Nightfall') }}</span></label>
      </div>
      <p>{{ tr('两套外观都支持浅色和深色，可独立搭配。', 'Both skins support light and dark modes.') }}</p>
    </fieldset>
    <label v-if="ui.skin === 'anime'" class="decoration-toggle">
      <span><strong>{{ tr('星图装饰', 'Eclipse ornaments') }}</strong><small>{{ tr('在页面留白处显示月蚀纹章，也可以收起，专心写作。', 'Show eclipse sigils in the margins, or keep the page quiet for writing.') }}</small></span>
      <input v-model="ui.decorations" type="checkbox" />
    </label>
    <template #footer>
      <span class="appearance-saved" role="status">{{ tr('外观已自动记住', 'Appearance saved') }}</span>
      <button type="button" class="btn primary" @click="ui.closeModal('appearance')">{{ tr('完成', 'Done') }}</button>
    </template>
  </Modal>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { CircleCheck, Moon, Sparkles, Sun } from 'lucide-vue-next';
import { useI18n } from '../../composables/useI18n';
import { useUIStore, type ThemeSkin } from '../../stores/ui';
import Modal from '../base/Modal.vue';
import AnimeSigil from '../base/AnimeSigil.vue';
const ui = useUIStore();
const { tr } = useI18n();
const options = computed(() => [
  { id: 'classic' as ThemeSkin, title: tr('灵感手札', 'Studio journal'), tag: tr('经典套装', 'CLASSIC'), description: tr('柔和紫色、轻盈卡片，留白给每一个灵感。', 'Soft violet, gentle cards, room for ideas.') },
  { id: 'anime' as ThemeSkin, title: tr('绯月档案', 'Crimson moon'), tag: tr('日式中二套装', 'ANIME / CHAPTER 00'), description: tr('电光紫、绯红与月蚀纹章。下一条世界线，由你改写。', 'Electric violet, crimson and eclipse sigils. Rewrite the next worldline.') }
]);
</script>
<style scoped>
.appearance-intro { margin: 0 0 22px; color: var(--mu); font-size: 13px; }
.appearance-fieldset { border: 0; padding: 0; margin: 0 0 24px; min-width: 0; }
legend { font-size: 12px; font-weight: 700; margin-bottom: 12px; padding: 0; }
.skin-options { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.skin-choice { position: relative; display: block; min-width: 0; border: 1px solid var(--li); border-radius: 14px; padding: 8px 8px 16px; cursor: pointer; background: var(--card); }
.skin-choice.selected { border-color: var(--ac); box-shadow: 0 0 0 2px var(--glow); }
.skin-choice:focus-within { outline: 2px solid var(--ac); outline-offset: 3px; }
.skin-choice > input, .lighting-options input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.skin-preview { display: flex; height: 145px; border-radius: 8px; position: relative; overflow: hidden; }
.skin-preview.classic { background: #f5f2fc; color: #6250ca; }
.skin-preview.anime { background: linear-gradient(135deg, #242039, #181224 65%, #451f3c); color: #c5a8ff; border-top: 2px solid #f47e9f; }
.mini-sidebar { display: flex; flex-direction: column; gap: 12px; padding: 15px 9px; border-right: 1px solid currentColor; opacity: .55; width: 41px; }
.mini-sidebar i { display: block; width: 19px; height: 3px; background: currentColor; opacity: .4; }
.mini-canvas { padding: 22px 13px; flex: 1; min-width: 0; z-index: 1; }
.mini-eyebrow { display: block; font: 6px var(--font-mono); letter-spacing: .1em; }
.mini-heading { display: block; font: 600 13px var(--font-display); margin: 10px 0; white-space: nowrap; }
.anime .mini-heading { font-family: var(--font-ui); font-weight: 800; }
.mini-lines { display: block; }
.mini-lines i { display: block; width: 75%; height: 2px; background: currentColor; opacity: .2; margin-top: 5px; }
.mini-lines i + i { width: 55%; }
.mini-cards { display: flex; gap: 6px; margin-top: 13px; }
.mini-cards i { height: 23px; flex: 1; border: 1px solid currentColor; opacity: .3; border-radius: 4px; }
.anime .mini-cards i { border-radius: 0; }
.mini-sigil { position: absolute; width: 130px; right: -42px; top: -22px; opacity: .3; }
.skin-info { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 14px 7px 8px; }
.skin-info strong { font-size: 15px; }
.skin-info small { display: block; margin-top: 4px; font-size: 9px; letter-spacing: .08em; color: var(--ac); }
.skin-info svg { color: var(--ac); flex-shrink: 0; }
.skin-description { display: block; font-size: 11px; color: var(--mu); line-height: 1.8; padding: 0 7px; }
.lighting-options { display: flex; gap: 12px; flex-wrap: wrap; }
.lighting-options label { position: relative; cursor: pointer; display: inline-flex; align-items: center; gap: 9px; border: 1px solid var(--li); padding: 10px 16px; border-radius: 9px; font-size: 12px; }
.lighting-options .selected { background: var(--acs); color: var(--ac); border-color: var(--ac); }
.lighting-options label:focus-within { outline: 2px solid var(--ac); outline-offset: 3px; }
.lighting p { font-size: 11px; color: var(--mu); margin: 10px 0 0; }
.decoration-toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px; background: var(--soft); border: 1px solid var(--li); border-radius: 9px; }
.decoration-toggle strong { display: block; font-size: 12px; }
.decoration-toggle small { display: block; font-size: 11px; color: var(--mu); margin-top: 5px; line-height: 1.7; }
.decoration-toggle input { accent-color: var(--ac); width: 18px; height: 18px; flex-shrink: 0; }
.appearance-saved { margin-right: auto; font-size: 11px; color: var(--mu); }
@media (max-width: 520px) { .skin-options { gap: 10px; } .mini-sidebar { display: none; } .mini-canvas { padding: 20px 10px; } .mini-heading { font-size: 10px; letter-spacing: -.02em; } .skin-description { font-size: 10px; } .skin-info strong { font-size: 14px; } }
</style>
