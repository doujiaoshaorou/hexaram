<script setup lang="ts">
import { computed, ref } from 'vue'
import { NModal, NButton, NAlert } from 'naive-ui'
import MatchDetailModal from './MatchDetailModal.vue'
import { inlineDetailGame, closeInlineDetail, openMatchDetailWindow } from './detailWindow'
const opened = computed({
  get: () => !!inlineDetailGame.value,
  set: (v: boolean) => {
    if (!v) closeInlineDetail()
  }
})
const creating = ref(false),
  error = ref('')
async function popOut() {
  const game = inlineDetailGame.value
  if (!game || creating.value) return
  creating.value = true
  error.value = ''
  try {
    await openMatchDetailWindow(game)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '独立窗口无法打开，请继续在当前窗口查看'
  } finally {
    creating.value = false
  }
}
</script>
<template>
  <n-modal
    v-model:show="opened"
    preset="card"
    title="历史对局详情"
    class="history-detail-dialog"
    style="width: min(1400px, 96vw); max-height: 94vh"
    :mask-closable="false"
    @after-leave="error = ''"
  >
    <template #header-extra
      ><n-button size="small" :loading="creating" @click="popOut">独立窗口</n-button></template
    >
    <n-alert v-if="error" type="warning" style="margin-bottom: 8px">{{ error }}</n-alert>
    <div class="history-detail-area">
      <MatchDetailModal
        v-if="inlineDetailGame"
        :key="inlineDetailGame.gameId"
        :game="inlineDetailGame"
      />
    </div>
  </n-modal>
</template>
<style scoped>
.history-detail-area {
  height: min(780px, calc(94vh - 105px));
  min-height: 240px;
  overflow: auto;
}
.history-detail-area :deep(.match-detail-page) {
  min-width: 1000px;
}
</style>
