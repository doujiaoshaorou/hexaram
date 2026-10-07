<template>
  <div class="ratio-container">
    <n-flex vertical class="content-wrapper match-history-wrap">
      <n-flex class="match-history-toolbar" align="center" :size="8">
        <n-checkbox v-model:checked="showRemakes" @update:checked="page = 1">显示重开局</n-checkbox>
        <n-select
          v-model:value="filterQueueId"
          placeholder="按模式筛选"
          :options="modeOptions"
          size="small"
          class="filter-select filter-mode"
          @update:value="handleUpdateValue"
        />
        <n-select
          v-model:value="filterChampionId"
          filterable
          :filter="filterChampionFunc"
          placeholder="按英雄筛选"
          :render-tag="renderSingleSelectTag"
          :render-label="renderLabel"
          :options="championOptions"
          size="small"
          class="filter-select filter-champion"
          @update:value="handleUpdateValue"
        />
        <n-tooltip trigger="hover">
          <template #trigger>
            <n-button quaternary circle size="small" class="toolbar-reset" @click="resetFilter">
              <n-icon><RepeatOutline /></n-icon>
            </n-button>
          </template>
          复位
        </n-tooltip>
      </n-flex>

      <!-- 首屏无数据即骨架：onMounted 先 await 模式/英雄选项，那段时间请求尚未发出，
           旧条件（requesting && !matchHistory）为假，列表区是一片空白 -->
      <template v-if="!isMine && !matchHistory && !loadError">
        <div class="match-history-list">
          <RecordCardSkeleton v-for="i in 10" :key="`skel-${i}`" />
        </div>
      </template>
      <template v-else-if="loadError">
        <n-empty description="加载失败" class="match-history-empty">
          <template #extra>
            <n-button size="small" @click="retry">重试</n-button>
          </template>
        </n-empty>
      </template>
      <template v-else-if="games.length === 0 && hasFilter">
        <n-empty description="没有匹配的对局" class="match-history-empty">
          <template #extra>
            <n-button size="small" @click="resetFilter">清除筛选</n-button>
          </template>
        </n-empty>
      </template>
      <TransitionGroup
        v-else
        name="list"
        tag="div"
        class="match-history-list"
        :class="{ 'match-history-list--refreshing': isRefreshing }"
      >
        <div
          v-for="(game, index) in games"
          :key="game.gameId"
          :style="{ '--stagger-i': index }"
          class="list-item"
        >
          <RecordCard
            :record-type="true"
            :games="game"
            :opening="detailOpener.isOpening(game.gameId)"
            @open-detail="detailOpener.open(game)"
          />
        </div>
      </TransitionGroup>

      <div class="pagination">
        <n-pagination
          v-model:page="page"
          :page-count="pageCount"
          :page-slot="10"
          :disabled="isRequestingMatchHostory"
        />
        <span class="pagination-summary">每页 10 场 · 最近 {{ visibleGames.length }} 场</span>
        <n-spin v-if="isRefreshing" :size="14" />
      </div>
    </n-flex>
  </div>
</template>

<script setup lang="ts">
import { personal, personalQueue, selectHexGames } from '@renderer/services/hexaram'
import { isEarlyEnd } from '@renderer/services/historyAudit'
import { queryPages } from '@renderer/services/queryState'
import RecordCard from './RecordCard.vue'
import RecordCardSkeleton from './RecordCardSkeleton.vue'
import { RepeatOutline } from '@vicons/ionicons5'
import { computed, onMounted, onBeforeUnmount, provide, inject, ref, watch } from 'vue'
import { NEmpty, NButton, NCheckbox } from 'naive-ui'
import { useRoute } from 'vue-router'
import { renderSingleSelectTag, renderLabel, filterChampionFunc } from '../composition'
import { modeOptions, initModeOptions } from './composition'
import { invoke } from '@tauri-apps/api/core'
import { championOption } from '../type'
import type { Game, MatchHistory } from './match'
import { useDetailOpener } from './detailWindow'
import { collectAssetIds } from './collectAssetIds'
import { useRecordAssets } from '@renderer/composables/useRecordAssets'
import { recordAssetsKey } from '@renderer/composables/recordAssetsKey'

/**
 * 父级批量加载：一次性收集当前页所有战绩的 item/spell/perk ID 去重后下发 IPC
 * 子 RecordCard 通过 inject 共享，跳过自身 preload
 */
const recordAssets = useRecordAssets()
provide(recordAssetsKey, recordAssets)

/** 详情窗打开中态（点击后到窗口亮出之间卡片保持按下 + 转圈） */
const detailOpener = useDetailOpener()

const route = useRoute()
const showRemakes = ref(false)
const isMine = ref(route.path === '/MyRecords')
const localQueue = inject('queryQueue', ref(0))
const filterQueueId = computed({
  get: () => (isMine.value ? personalQueue.value : localQueue.value),
  set: v => {
    if (isMine.value) personalQueue.value = v
    else localQueue.value = v
  }
})
const filterChampionId = ref(-1)
const championOptions = ref<championOption[]>([])

const resetFilter = () => {
  filterQueueId.value = 0
  filterChampionId.value = -1
  handleUpdateValue()
}
const handleUpdateValue = () => {
  page.value = 1
  void getHistoryMatch()
}

const matchHistory = ref<MatchHistory>()
const isRequestingMatchHostory = ref(false)
const loadError = ref(false)
const page = ref(1)
let requestGeneration = 0
let disposed = false

const name = ref((route.query.name as string) ?? '')
/** 跨区查询目标大区 platformId（空 = 当前区，走本地 LCU；非空走 SGP 跨区） */
const region = ref((route.query.region as string) ?? '')

/** 当前页对局列表（响应式扁平化，便于空态判断） */
const ownGames = computed(() =>
  selectHexGames(
    personal.value?.games || [],
    filterQueueId.value,
    Math.max(0, filterChampionId.value),
    Number(route.query.days || 0) ? Date.now() - Number(route.query.days) * 86400000 : 0,
    Number(route.query.recent || 0),
    showRemakes.value
  ).filter(
    g =>
      !route.query.augment ||
      [1, 2, 3, 4, 5, 6].some(
        i => (g.participants[0].stats as any)[`playerAugment${i}`] === Number(route.query.augment)
      )
  )
)
// 这里只限制列表展示；个人归档和累计统计仍使用全部记录。
const visibleGames = computed<Game[]>(() =>
  (isMine.value ? ownGames.value : (matchHistory.value?.games?.games ?? []))
    .filter(g => showRemakes.value || !isEarlyEnd(g))
    .slice(0, 100)
)
const pageCount = computed(() => Math.max(1, Math.ceil(visibleGames.value.length / 10)))
const games = computed(() => visibleGames.value.slice((page.value - 1) * 10, page.value * 10))
watch(pageCount, count => {
  page.value = Math.min(page.value, count)
})
watch([personalQueue, () => personal.value], () => {
  if (isMine.value) page.value = 1
})

/** 是否启用了任何筛选条件（用于区分"无数据"与"筛选无结果"） */
const hasFilter = computed(() => filterChampionId.value > 0 || filterQueueId.value > 0)

/**
 * 翻页/筛选请求中且已有旧列表：旧列表就地变淡 + 分页旁小转圈，
 * 替代原先顶部的全局加载条（只有首屏无数据时才显示骨架）
 */
const isRefreshing = computed(() => isRequestingMatchHostory.value && !!matchHistory.value)

// 一次获取最多 100 场筛选结果，页码跳转不重复请求，也不会漏掉过滤后的对局。
const getHistoryMatch = async () => {
  if (isMine.value || !name.value || disposed) return
  const generation = ++requestGeneration
  isRequestingMatchHostory.value = true
  loadError.value = false
  try {
    const result = await invoke<MatchHistory>('query_hex_history', {
      region: region.value,
      name: name.value,
      begIndex: 0,
      queue: filterQueueId.value,
      champion: filterChampionId.value,
      pageSize: 100
    })
    if (disposed || generation !== requestGeneration) return
    matchHistory.value = result
  } catch (err) {
    if (disposed || generation !== requestGeneration) return
    loadError.value = true
    console.error('[MatchHistory] getHistoryMatch failed', err)
  } finally {
    if (!disposed && generation === requestGeneration) isRequestingMatchHostory.value = false
  }
}

async function retry() {
  await getHistoryMatch()
}

watch(
  () => games.value,
  rows => {
    const { items, spells, perks } = collectAssetIds(rows)
    recordAssets.preload([
      { kind: 'item', ids: items },
      { kind: 'spell', ids: spells },
      { kind: 'perk', ids: perks }
    ])
  },
  { immediate: true }
)

const queryCacheKey = computed(() => JSON.stringify([name.value, region.value]))
onBeforeUnmount(() => {
  disposed = true
  requestGeneration++
  if (!isMine.value && matchHistory.value && !isRequestingMatchHostory.value && !loadError.value) {
    queryPages.set(queryCacheKey.value, {
      match: matchHistory.value,
      page: page.value,
      queue: filterQueueId.value,
      champion: filterChampionId.value
    })
    if (queryPages.size > 10) queryPages.delete(queryPages.keys().next().value!)
  }
})
onMounted(async () => {
  filterChampionId.value = Number(route.query.champion || -1)
  if (isMine.value && route.query.queue) personalQueue.value = Number(route.query.queue)
  try {
    await initModeOptions()
    championOptions.value = await invoke<championOption[]>('get_champion_options')
  } catch {
    // 选项加载失败不应阻断战绩列表。
  }
  if (disposed) return
  const saved = !isMine.value && queryPages.get(queryCacheKey.value)
  if (saved) {
    matchHistory.value = saved.match
    page.value = Math.min(saved.page, Math.max(1, Math.ceil(saved.match.games.games.length / 10)))
    filterQueueId.value = saved.queue
    filterChampionId.value = saved.champion
    return
  }
  await getHistoryMatch()
})
</script>

<style lang="css" scoped>
.ratio-container {
  width: 100%;
  height: 100%;
  padding: 0;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.match-history-wrap.content-wrapper {
  height: 100%;
  position: relative;
  gap: var(--space-20);
}

.match-history-toolbar {
  flex-shrink: 0;
}

.match-history-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  transition: opacity var(--dur-fast) var(--ease-expo);
}

/* 翻页/筛选请求中：旧列表立即变淡且不可点（顶部加载条移除后的就地反馈） */
.match-history-list--refreshing {
  opacity: 0.5;
  pointer-events: none;
}

.match-history-empty {
  padding: var(--space-24) 0;
}

.list-item {
  /* TransitionGroup child; stagger via --stagger-i */
}

.list-enter-active {
  transition:
    opacity var(--dur-normal) var(--ease-expo),
    transform var(--dur-normal) var(--ease-expo);
  transition-delay: calc(var(--stagger) * var(--stagger-i, 0));
}

.list-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.list-move {
  transition: transform var(--dur-normal) var(--ease-expo);
}

.filter-select.filter-mode {
  width: 100px;
  margin-left: var(--space-8);
}

.filter-select.filter-champion {
  width: 170px;
}

.filter-select :deep(.n-input),
.filter-select :deep(.n-input-wrapper) {
  transition:
    border-color var(--dur-fast) var(--ease-expo),
    box-shadow var(--dur-fast) var(--ease-expo);
}

.filter-select:focus-within :deep(.n-input-wrapper) {
  box-shadow: 0 0 0 1px var(--border-subtle);
}

.filter-select :deep(.n-base-selection) {
  background: var(--surface-control) !important;
  border-color: var(--glass-border) !important;
  transition: border-color var(--dur-fast) var(--ease-expo) !important;
}
.filter-select :deep(.n-base-selection:hover) {
  border-color: var(--glass-bg-high) !important;
}

.toolbar-reset {
  color: var(--text-secondary);
  transition:
    transform var(--dur-fast) var(--ease-expo),
    color var(--dur-fast) var(--ease-expo);
}

.toolbar-reset:hover {
  transform: scale(1.05) rotate(180deg);
  transition:
    transform var(--dur-normal) var(--ease-expo),
    color var(--dur-fast) var(--ease-expo);
  color: var(--text-primary);
}

.toolbar-reset:active {
  transform: scale(0.98) rotate(180deg);
}

.content-wrapper {
  aspect-ratio: 1.1 / 1;
  width: 100%;
  max-width: calc(100vh * 1.1);
  max-height: calc(100vw / 1.1);
  margin: auto;
  position: relative;
}

.pagination-summary {
  color: var(--text-secondary);
  font-size: 12px;
}

.pagination {
  flex-wrap: wrap;
  position: sticky;
  bottom: 0;
  background: var(--bg-base);
  padding: var(--space-8) 0;
  margin-top: var(--space-8);
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.pagination :deep(.n-button) {
  background: var(--surface-control) !important;
  border: 1px solid var(--glass-border) !important;
  transition:
    transform var(--dur-fast) var(--ease-spring),
    background var(--dur-fast) var(--ease-expo) !important;
}

.pagination :deep(.n-button:hover:not(:disabled)) {
  transform: scale(1.05);
  background: var(--glass-bg-mid) !important;
}

.pagination :deep(.n-button:active:not(:disabled)) {
  transform: scale(0.97);
  transition-duration: var(--dur-instant) !important;
}
</style>
