<script setup lang="ts">
import { computed, ref } from 'vue'
import { personal, selectHexGames } from '@renderer/services/hexaram'
import { auditHistory, isEarlyEnd } from '@renderer/services/historyAudit'
const opened = ref(false),
  selected = ref('')
const rows = computed(() =>
  auditHistory(selectHexGames(personal.value?.games || [], 0, 0, 0, 0, true))
)
const early = computed(() => rows.value.reduce((n, r) => n + r.early, 0))
const normal = computed(() => rows.value.reduce((n, r) => n + r.completed, 0))
const details = computed(
  () => rows.value.find(r => r.season === selected.value)?.games.filter(isEarlyEnd) || []
)
</script>
<template>
  <div class="audit-entry">
    <p>
      正常对局 {{ normal }} 场；另保留
      {{ early }} 场重开局，不计入场次、胜率、KDA、英雄和海克斯统计。
    </p>
    <n-button size="small" @click="opened = true">按赛段核对场数</n-button>
  </div>
  <n-modal
    v-model:show="opened"
    preset="card"
    title="历史场数核对"
    style="width: min(900px, 94vw); max-height: 85vh; overflow: auto"
  >
    <p>
      全部海克斯模式 · 默认统计正常对局。重开依据客户端提前结束标记，原始记录保留，不按时长猜测。
    </p>
    <div style="overflow-x: auto">
      <table>
        <thead>
          <tr>
            <th>赛段</th>
            <th>正常对局</th>
            <th>普通 / 巅峰 / 经典</th>
            <th>重开局（不计统计）</th>
            <th>原始记录</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.season">
            <td>{{ r.season }}</td>
            <td>
              <strong>{{ r.completed }}</strong>
            </td>
            <td>{{ r.ordinary }} / {{ r.peak }} / {{ r.classic }}</td>
            <td>
              <n-button text @click="selected = r.season">{{ r.early }} · 明细</n-button>
            </td>
            <td>{{ r.total }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      自动核对已归档记录；尚未接入掌盟官方统计接口。客户端结算累计胜负的计数范围独立，不作为跨赛段总数。
    </p>
    <details>
      <summary>赛段依据</summary>
      <p>
        S15 第三赛段：15.17–15.24；S16
        第一赛段：16.1–16.8；第二赛段：16.9–16.14；第三赛段：16.15–16.24。版本未知单列。
      </p>
    </details>
    <section v-if="selected">
      <h3>{{ selected }} · 重开局</h3>
      <p v-if="!details.length">无重开局</p>
      <div v-for="g in details" :key="g.gameId" class="early-row">
        {{ new Date(g.gameCreationDate).toLocaleString() }} ·
        {{ Math.floor(g.gameDuration / 60) }}分{{ g.gameDuration % 60 }}秒 · 对局 {{ g.gameId }}
      </div>
    </section>
  </n-modal>
</template>
<style scoped>
.audit-entry p {
  font-size: 12px;
  color: var(--text-secondary);
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 12px 8px;
  text-align: left;
  border-bottom: 1px solid #4445;
}
strong {
  color: var(--primary-color);
}
p,
.early-row {
  line-height: 1.7;
}
.early-row {
  padding: 8px;
  border-bottom: 1px solid #4444;
}
</style>
