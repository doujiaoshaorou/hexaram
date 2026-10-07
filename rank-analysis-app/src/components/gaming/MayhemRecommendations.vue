<template>
  <section class="mayhem-panel">
    <header>
      <strong>海克斯强化推荐</strong
      ><span>OP.GG · {{ data?.patch || '加载中' }}{{ data?.stale ? ' · 缓存已过期' : '' }}</span>
    </header>
    <p v-if="error">{{ error }}</p>
    <p v-else-if="!championId">选定英雄后显示对应强化推荐</p>
    <div v-else :class="['augment-strip', { 'augment-list': detailed }]">
      <article v-for="a in recommendations" :key="a.id" :title="plain(a.desc)">
        <span v-if="detailed" class="augment-grade">{{ augmentTier(a.champions.find(c => c.id === championId)?.tier ?? a.tier) }}<small>{{ rarityLabels[a.rarity] }}</small></span>
        <img :src="assetPrefix+'/perk/'+a.id" :alt="a.name" />
        <div>
          <b>{{ a.name }}</b
          ><small v-if="!detailed"
            >{{ augmentTier(a.champions.find(c => c.id === championId)?.tier ?? a.tier) }} 级 ·
            {{ rarityLabels[a.rarity] || '强化' }}</small
          >
          <p v-if="detailed" class="augment-description">{{ plain(a.desc) || '该强化暂未提供说明' }}</p>
        </div>
      </article>
      <p v-if="data && !recommendations.length">该英雄暂无强化推荐数据</p>
    </div>
    <small>评级来自 OP.GG 海克斯大乱斗；个人强化胜率请在「英雄表现」查看。</small>
  </section>
</template>
<script setup lang="ts">
import { getAssetDetailsByIpc, type AssetDetail } from '@renderer/services/ipc'
import { assetPrefix } from '@renderer/services/http'
import { computed, onMounted, ref } from 'vue'
import { getMayhem, augmentTier, type MayhemData } from '@renderer/services/mayhem'
const props = defineProps<{ championId: number; detailed?: boolean }>()
const metadata = ref<Record<number, AssetDetail>>({})
const data = ref<MayhemData | null>(null),
  error = ref('')
const rarityLabels: Record<number, string> = { 1: '白银', 2: '白银', 4: '黄金', 8: '棱彩' }
const plain = (s?: string) => (s || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
const recommendations = computed(() =>
  [...(data.value?.augments || [])]
    .filter(a => a.champions.some(c => c.id === props.championId))
    .sort((a, b) => {
      const x = a.champions.find(c => c.id === props.championId)!,
        y = b.champions.find(c => c.id === props.championId)!
      return x.tier - y.tier || y.performance - x.performance
    })
    .slice(0, props.detailed ? undefined : 9)
    .map(a => ({ ...a, name: a.name || metadata.value[a.id]?.name || `海克斯 #${a.id}`, desc: a.desc || metadata.value[a.id]?.description || '', rarity: a.rarity || ({ kSilver: 2, kGold: 4, kPrismatic: 8 } as Record<string, number>)[metadata.value[a.id]?.rarity || ''] }))
)
onMounted(async () => {
  try {
    data.value = await getMayhem()
    const missing = data.value.augments.filter(a => !a.name || !a.desc || !a.rarity).map(a => a.id)
    if (missing.length) {
      const details = await getAssetDetailsByIpc('perk', missing).catch(() => [])
      metadata.value = Object.fromEntries(details.map(d => [d.id, d]))
    }
  } catch {
    error.value = '暂时无法加载 OP.GG 海克斯推荐'
  }
})
</script>
<style scoped>
.mayhem-panel {
  padding: 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  margin-bottom: 12px;
}
.mayhem-panel header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
.mayhem-panel small,
.mayhem-panel header span {
  color: var(--text-secondary);
}
.augment-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  margin-bottom: 10px;
}
.augment-strip article {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 160px;
  background: var(--surface-sunken);
  padding: 10px;
  border-radius: 8px;
}
.augment-strip img {
  width: 36px;
  height: 36px;
}
.augment-strip small {
  display: block;
}
.augment-list { flex-direction: column; overflow-x: visible; }
.augment-list article { display: grid; grid-template-columns: 52px 40px minmax(0, 1fr); align-items: start; gap: 12px; }
.augment-grade { color: var(--primary-color); font-size: 22px; font-weight: 700; text-align: center; }
.augment-grade small { font-size: 12px; font-weight: 400; }
.augment-description { color: var(--text-secondary); white-space: pre-line; margin: 6px 0 0; line-height: 1.6; }
</style>
