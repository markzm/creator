<template>
  <Teleport to="body">
    <div v-if="confirmVisible" class="tut-mask show" @click.self="resolveConfirm(false)">
      <div class="tut-box" style="max-width: 460px">
        <h3 style="margin: 0 0 10px">{{ confirmTitle }}</h3>
        <p
          style="
            margin: 0 0 22px;
            color: var(--mu);
            font-size: 13.5px;
            line-height: 1.7;
            white-space: pre-wrap;
          "
        >
          {{ confirmMessage }}
        </p>
        <div class="tut-actions">
          <button type="button" class="btn sm" @click="resolveConfirm(false)">
            {{ tr('取消', 'Cancel') }}
          </button>
          <button type="button" class="btn primary sm" @click="resolveConfirm(true)">
            {{ tr('确定', 'OK') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useConfirm } from '../../composables/useConfirm';
import { useI18n } from '../../composables/useI18n';

const { confirmVisible, confirmTitle, confirmMessage, resolveConfirm } = useConfirm();
const { tr } = useI18n();
</script>
