<script setup lang="ts">
import { computed } from 'vue'
import { personal, hexModes, selectHexGames, summary } from '@renderer/services/hexaram'
const counter = computed(() => personal.value?.clientSummary)
const archived = computed(() =>
  summary(selectHexGames(personal.value?.games || [], counter.value?.queueId || 0))
)
const mode = computed(() => hexModes.find(m => m.value === counter.value?.queueId)?.label)
const total = computed(() => (counter.value?.wins || 0) + (counter.value?.losses || 0))
const gap = computed(() => Math.max(0, total.value - archived.value.games))
</script>
<template>
  <details v-if="counter" style="margin: 12px 0; padding: 12px; line-height: 1.8">
    <summary>客户端结算计数（独立口径）</summary>
    <b>{{ mode }} · {{ total.toLocaleString() }} 场</b>
    <p>
      {{ counter.wins }} 胜 / {{ counter.losses }} 负 ·
      {{ ((counter.wins / total) * 100).toFixed(2) }}%
    </p>
    <p>
      同模式已归档 {{ archived.games }} 场<span v-if="gap">，计数差 {{ gap }} 场</span
      >。英雄、海克斯与 KDA 只按归档明细计算。
    </p>
    <small
      >来源：客户端结算累计计数，截至
      {{ new Date(counter.gameCreation).toLocaleDateString() }}
      对局；独立于本页日期筛选。客户端未说明计数起点，不等同于全赛季生涯。</small
    >
  </details>
</template>
