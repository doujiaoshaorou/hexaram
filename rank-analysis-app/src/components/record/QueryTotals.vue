<script setup lang="ts">
import { computed, inject, ref, watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { queryTotals } from '@renderer/services/queryState'
import { summary, championStats } from '@renderer/services/hexaram'
import type { MatchHistory, Game } from './match'
import WyRating from './WyRating.vue'
const route = useRoute()
const name = String(route.query.name || '')
const region = String(route.query.region || '')
const queue = inject('queryQueue', ref(0))
const state = ref({ games: [] as Game[], next: 0, exhausted: false })
const loading = ref(false),
  error = ref('')
const total = computed(() => summary(state.value.games))
const heroes = computed(() => championStats(state.value.games).length)
let generation = 0
onBeforeUnmount(() => {
  generation++
})
async function loadMore() {
  if (loading.value || state.value.exhausted) return
  const token = generation,
    key = JSON.stringify([name, region, queue.value])
  loading.value = true
  error.value = ''
  try {
    const response = await invoke<MatchHistory>('query_hex_history', {
      name,
      region,
      queue: queue.value,
      champion: -1,
      begIndex: state.value.next,
      pageSize: 100
    })
    if (token !== generation) return
    const rows = response.games?.games || []
    const merged = new Map(state.value.games.map(g => [g.gameId, g]))
    rows.forEach(g => merged.set(g.gameId, g))
    const added = merged.size - state.value.games.length
    state.value = {
      games: [...merged.values()],
      next: response.endIndex + 1,
      exhausted: rows.length < 100 || added === 0
    }
    queryTotals.set(key, state.value)
    if (queryTotals.size > 20) queryTotals.delete(queryTotals.keys().next().value!)
  } catch (e) {
    if (token === generation) error.value = '历史统计加载失败，可点击重试。'
  } finally {
    if (token === generation) loading.value = false
  }
}
watch(
  queue,
  () => {
    generation++
    loading.value = false
    error.value = ''
    state.value = queryTotals.get(JSON.stringify([name, region, queue.value])) || {
      games: [],
      next: 0,
      exhausted: false
    }
    if (!state.value.games.length) void loadMore()
  },
  { immediate: true }
)
</script>
<template>
  <n-card title="历史表现" size="small" :bordered="false" class="query-totals">
    <div class="totals-grid">
      <span
        >正常对局场数<b>{{ total.games }}</b></span
      >
      <span
        >胜率<b>{{
          total.winRate === null ? '—' : (total.winRate * 100).toFixed(2) + '%'
        }}</b></span
      >
      <span
        >综合 KDA<b>{{ total.kda.toFixed(2) }}</b></span
      >
      <span
        >使用英雄<b>{{ heroes }}</b></span
      >
    </div>
    <p>{{ total.wins }} 胜 / {{ total.losses }} 负 · 与右侧模式一致</p>
    <p>
      {{
        state.exhausted
          ? '接口未返回更多记录，仍不代表生涯全部。'
          : '每次获取最多 100 场；仅统计已获取明细。'
      }}
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <n-button v-if="!state.exhausted" size="small" :loading="loading" @click="loadMore">{{
      error ? '重试' : '继续加载历史'
    }}</n-button>
  </n-card>
  <WyRating :games="state.games" :queue="queue" />
</template>
<style scoped>
.query-totals {
  margin-top: 12px;
}
.totals-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.totals-grid span,
p {
  color: var(--text-secondary);
}
b {
  display: block;
  font-size: 22px;
  color: var(--primary-color, #80d9b8);
  margin-top: 4px;
}
p {
  font-size: 12px;
  line-height: 1.6;
}
</style>
