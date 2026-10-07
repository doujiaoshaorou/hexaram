<script setup lang="ts">
import ClientTotals from './ClientTotals.vue'
import HistoryAudit from './HistoryAudit.vue'
import WyRating from './WyRating.vue'
import { computed } from 'vue'
import {
  usePersonalHistory,
  selectHexGames,
  summary,
  championStats,
  personalQueue
} from '@renderer/services/hexaram'
const { personal, syncing, recovering, recoveryProgress, syncError, sync, recover } =
  usePersonalHistory()
const games = computed(() => selectHexGames(personal.value?.games || [], personalQueue.value))
const total = computed(() => summary(games.value))
const heroes = computed(() => championStats(games.value).length)
</script>
<template>
  <ClientTotals />
  <n-card title="归档累计表现" size="small" :bordered="false" class="totals-card"
    ><div class="totals-grid">
      <span
        >正常对局场数<b>{{ total.games }}</b></span
      ><span
        >胜率<b>{{
          total.winRate === null ? '—' : (total.winRate * 100).toFixed(2) + '%'
        }}</b></span
      ><span
        >综合 KDA<b>{{ total.kda.toFixed(2) }}</b></span
      ><span
        >使用英雄<b>{{ heroes }}</b></span
      >
    </div>
    <p>{{ total.wins }} 胜 / {{ total.losses }} 负 · 与右侧模式一致</p>
    <HistoryAudit />
    <p>统计来自已保存的真实对局；可从本机游戏日志找回更早明细。</p>
    <p v-if="recovering" role="status">
      {{
        recoveryProgress
          ? `已检查 ${recoveryProgress.processed} / ${recoveryProgress.total} 场，新增 ${recoveryProgress.added} 场`
          : '正在扫描本机对局索引…'
      }}
    </p>
    <p v-else-if="personal?.recovery">
      本机日志已补录 {{ personal.recovery.recoveredTotal ?? personal.recovery.added }} 场<span
        v-if="personal.recovery.failures"
        >，{{ personal.recovery.failures }} 场读取失败，可重试</span
      >。本机未保留日志的比赛仍可能缺失。
    </p>
    <p v-if="syncError">{{ syncError }}</p>
    <n-button size="small" :disabled="recovering" :loading="syncing" @click="sync">{{
      syncing ? '正在同步' : '更新战绩'
    }}</n-button>
    <n-button
      size="small"
      style="margin: 8px 0 0 8px"
      :disabled="syncing"
      :loading="recovering"
      @click="recover"
      >补齐本机历史</n-button
    ></n-card
  >
  <WyRating :games="personal?.games || []" :queue="personalQueue" />
</template>
<style scoped>
.totals-card {
  margin-top: 12px;
}
.totals-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.totals-grid span {
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
  color: var(--text-secondary);
  line-height: 1.6;
}
</style>
