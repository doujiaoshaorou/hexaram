<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getMayhem, augmentTier, type MayhemData } from '@renderer/services/mayhem'
import { assetPrefix } from '@renderer/services/http'
const props = defineProps<{ championId: number }>()
const data = ref<MayhemData | null>(null),
  error = ref(false)
const rows = computed(() =>
  [...(data.value?.augments || [])]
    .filter(a => a.champions.some(c => c.id === props.championId))
    .sort((a, b) => {
      const x = a.champions.find(c => c.id === props.championId)!,
        y = b.champions.find(c => c.id === props.championId)!
      return x.tier - y.tier || y.performance - x.performance
    })
    .slice(0, 5)
)
onMounted(async () => {
  try {
    data.value = await getMayhem()
  } catch {
    error.value = true
  }
})
const title = (
  a: (typeof rows.value)[number]
) => `${a.name} · ${augmentTier(a.champions.find(c => c.id === props.championId)?.tier ?? a.tier)} 级
${a.desc.replace(/<[^>]*>/g, '')}`
</script>
<template>
  <div class="five">
    <span v-for="a in rows" :key="a.id" :title="title(a)"
      ><img :src="assetPrefix + '/perk/' + a.id" :alt="a.name" /><small>{{ a.name }}</small></span
    ><small v-if="!rows.length">{{ error ? '暂不可用' : data ? '暂无推荐' : '加载中' }}</small>
  </div>
</template>
<style scoped>
.five {
  display: flex;
  gap: 10px;
  min-width: 0;
  align-items: center;
}
.five span {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1;
}
.five img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.five small {
  font-size: 12px;
  line-height: 1.4;
  max-width: 70px;
  color: var(--text-secondary);
}
@media (max-width: 1200px) {
  .five span {
    flex-direction: column;
  }
  .five small {
    max-width: 58px;
    font-size: 11px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
</style>
