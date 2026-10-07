<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { personal, championStats, selectHexGames, hexModes } from '@renderer/services/hexaram'
import { assetPrefix } from '@renderer/services/http'
import { loadChampionNames, getChampionName } from '@renderer/services/ai/champion-names'
interface Pool {
  phase: string
  queue: number
  current: number
  bench: number[]
  allies: number[]
}
const pool = ref<Pool | null>(null),
  error = ref(''),
  queue = ref(2400),
  namesReady = ref(false)
let timer: ReturnType<typeof setInterval> | undefined,
  busy = false,
  disposed = false
async function refresh() {
  if (busy) return
  busy = true
  try {
    const v = await invoke<Pool>('get_hex_champion_pool')
    if (!disposed) {
      pool.value = v
      error.value = ''
      if ([2400, 2410, 2450].includes(v.queue)) queue.value = v.queue
    }
  } catch {
    if (!disposed) {
      pool.value = null
      error.value = '当前未读取到选人英雄池，以下展示个人历史表现'
    }
  } finally {
    busy = false
  }
}
onMounted(async () => {
  await loadChampionNames()
  if (disposed) return
  namesReady.value = true
  void refresh()
  timer = setInterval(refresh, 5000)
})
onUnmounted(() => {
  disposed = true
  if (timer) clearInterval(timer)
})
const live = computed(
  () => pool.value?.phase === 'ChampSelect' && [2400, 2410, 2450].includes(pool.value.queue)
)
const available = computed(() =>
  [...new Set([pool.value?.current || 0, ...(pool.value?.bench || [])])].filter(Boolean)
)
const stats = computed(() =>
  championStats(selectHexGames(personal.value?.games || [], queue.value))
)
const rows = computed(() =>
  live.value
    ? available.value.map(
        id =>
          stats.value.find(h => h.id === id) || {
            id,
            games: 0,
            wins: 0,
            losses: 0,
            winRate: null,
            kda: 0
          }
      )
    : stats.value
)
const groups = computed(() => [
  {
    label: live.value ? '池内常用英雄' : '我的常用英雄',
    rows: [...rows.value].sort((a, b) => b.games - a.games).slice(0, 5)
  },
  {
    label: '高胜率 · 至少 5 场',
    rows: rows.value
      .filter(h => h.games >= 5 && (h.winRate || 0) >= 0.5)
      .sort((a, b) => (b.winRate || 0) - (a.winRate || 0) || b.games - a.games)
      .slice(0, 5)
  },
  {
    label: '低胜率 · 至少 5 场',
    rows: rows.value
      .filter(h => h.games >= 5 && h.winRate !== null && h.winRate < 0.5)
      .sort((a, b) => (a.winRate || 0) - (b.winRate || 0) || b.games - a.games)
      .slice(0, 5)
  }
])
const name = (id: number) => (namesReady.value ? getChampionName(id) : String(id))
</script>
<template>
  <n-card class="pool-panel" title="推荐英雄" size="small"
    ><template #header-extra
      ><n-select
        v-model:value="queue"
        :options="hexModes"
        :disabled="live"
        size="small"
        style="width: 140px"
    /></template>
    <p>
      {{
        live
          ? '正在选人：按当前英雄与共享池筛选，每 5 秒刷新。英雄交换由你在客户端完成。'
          : error || '进入海克斯选人阶段后，将自动显示当前英雄池。现在展示所选模式个人历史。'
      }}
    </p>
    <div v-if="live" class="pool-available">
      <span v-for="id in available" :key="id"
        ><img :src="assetPrefix + '/champion/' + id" :alt="name(id)" />{{ name(id) }} ·
        {{ id === pool?.current ? '当前英雄' : '共享池' }}</span
      >
    </div>
    <div class="pool-groups">
      <section v-for="group in groups" :key="group.label">
        <h4>{{ group.label }}</h4>
        <div v-for="h in group.rows" :key="h.id" class="pool-row">
          <img :src="assetPrefix + '/champion/' + h.id" :alt="name(h.id)" />
          <div>
            <b>{{ name(h.id) }}</b
            ><small
              >{{ h.games }} 场 ·
              {{ h.winRate === null ? '暂无胜率' : (h.winRate * 100).toFixed(1) + '%'
              }}{{ h.games < 5 ? ' · 低样本' : '' }}</small
            >
          </div>
        </div>
        <p v-if="!group.rows.length">暂无符合条件的样本</p>
      </section>
    </div>
    <p v-if="live && pool?.allies.length">
      队友当前英雄（需要对方同意交换）：{{ pool.allies.map(name).join('、') }}
    </p>
    <small>基于本人已归档海克斯战绩；高低胜率仅代表历史样本，不保证下一局表现。</small></n-card
  >
</template>
<style scoped>
.pool-panel {
  margin-bottom: 16px;
}
.pool-panel p,
.pool-panel small {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.pool-groups {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.pool-groups section {
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 12px;
}
h4 {
  margin: 0 0 12px;
}
.pool-row {
  display: flex;
  gap: 10px;
  margin: 10px 0;
  align-items: center;
}
.pool-row img,
.pool-available img {
  width: 32px;
  height: 32px;
  border-radius: 5px;
}
.pool-row small {
  display: block;
}
.pool-available {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0;
}
.pool-available span {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
@media (max-width: 900px) {
  .pool-groups {
    grid-template-columns: 1fr;
  }
}
</style>
