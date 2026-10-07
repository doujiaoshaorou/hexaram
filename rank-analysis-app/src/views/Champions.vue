<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NInput, NDrawer, NDrawerContent } from 'naive-ui'
import {
  listChampionMetas,
  getOpggStatus,
  type ChampionMeta,
  type OpggStatus
} from '@renderer/services/opgg'
import { loadChampionNames, getChampionName } from '@renderer/services/ai/champion-names'
import ChampionTierTable from '@renderer/components/champions/ChampionTierTable.vue'
import MayhemRecommendations from '@renderer/components/gaming/MayhemRecommendations.vue'
import { toRows, type TierRow } from '@renderer/components/champions/championTier'
const metas = ref<ChampionMeta[]>([]),
  status = ref<OpggStatus | null>(null),
  loading = ref(false),
  keyword = ref(''),
  selected = ref<TierRow | null>(null)
const rows = computed(() =>
  toRows(metas.value, '', getChampionName)
    .filter(r => r.name.includes(keyword.value))
    .sort((a, b) => a.rank - b.rank)
)
async function refresh() {
  loading.value = true
  await loadChampionNames()
  metas.value = await listChampionMetas('mayhem')
  status.value = await getOpggStatus('mayhem')
  loading.value = false
}
onMounted(refresh)
</script>
<template>
  <div class="champions-page">
    <header class="champions-header">
      <div>
        <h1 class="champions-title">海克斯英雄强度</h1>
        <span class="champions-meta"
          >OP.GG 海克斯大乱斗 · {{ status?.patch || '数据未就绪'
          }}{{ status?.stale ? ' · 数据滞后' : '' }} · 榜单评级不代表个人胜率</span
        >
      </div>
      <n-button :loading="loading" @click="refresh">刷新</n-button>
    </header>
    <div class="champions-toolbar"><n-input v-model:value="keyword" placeholder="搜索英雄" /></div>
    <ChampionTierTable
      :rows="rows"
      :loading="loading"
      :tiers-only="true"
      @select="selected = $event"
    /><n-drawer
      :show="!!selected"
      :width="640"
      @update:show="
        v => {
          if (!v) selected = null
        }
      "
      ><n-drawer-content :title="selected?.name" closable
        ><MayhemRecommendations
          v-if="selected"
          detailed
          :champion-id="selected.championId" /></n-drawer-content
    ></n-drawer>
  </div>
</template>
<style scoped>
.champions-page {
  padding: var(--space-20) var(--space-24) 0;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 宽屏下不无限拉伸：列间距过大时一行数字对不上英雄 */
  max-width: 1180px;
  margin: 0 auto;
  width: 100%;
}

.champions-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-12);
  margin-bottom: var(--space-16);
  flex: none;
}

.champions-heading {
  display: flex;
  align-items: baseline;
  gap: var(--space-12);
}

.champions-title {
  margin: 0;
  font-size: var(--font-size-2xl);
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--text-primary);
}

.champions-meta {
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

.toolbar-stale {
  color: var(--semantic-loss);
}

.champions-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  margin-bottom: var(--space-16);
  flex-wrap: wrap;
  flex: none;
}

/* 分路是最常切换的维度：分段标签一眼看全五条路，比下拉少点一次 */
.position-tabs {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: var(--radius-md);
  background: var(--glass-bg-mid);
  border: 1px solid var(--glass-border);
}

.position-tab {
  min-width: 60px;
  height: 28px;
  padding: 0 var(--space-12);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-expo),
    color var(--dur-fast) var(--ease-expo);
}

.position-tab:hover {
  color: var(--text-primary);
}

.position-tab-active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm), var(--glass-highlight);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.toolbar-select {
  width: 128px;
}

.toolbar-search {
  width: 220px;
}

.champions-empty {
  padding: var(--space-28);
  text-align: center;
  color: var(--text-secondary);
}

.champions-empty-hint {
  margin-top: var(--space-6);
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}
</style>
