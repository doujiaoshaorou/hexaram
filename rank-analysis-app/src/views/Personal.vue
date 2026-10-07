<template>
  <main class="personal-page">
    <header class="personal-header">
      <div class="identity">
        <img
          v-if="personal"
          :src="assetPrefix + '/profile/' + personal.account.profileIconId"
          alt="头像"
        />
        <div>
          <h1>{{ performance ? '英雄表现' : '我的战绩' }}</h1>
          <span>{{ personal?.account.riotId || '登录英雄联盟后自动加载' }}</span>
        </div>
      </div>
      <n-button :loading="syncing" @click="sync">{{
        syncing ? '正在更新历史' : '更新战绩'
      }}</n-button>
    </header>
    <p v-if="syncError" class="notice">{{ syncError }}</p>
    <p v-if="personal" class="notice">
      原始归档 {{ personal.games.length }} 条记录 · 当前筛选正常对局 {{ filtered.length }} 场 ·
      {{
        personal.recovery
          ? '已合并本机日志找回的历史对局'
          : personal.sync.warning || '可在我的战绩中补齐本机历史'
      }}。统计覆盖已取得的明细。
    </p>
    <ClientTotals />
    <HistoryAudit />
    <div class="filters">
      <n-select v-model:value="queue" :options="hexModes" /><n-select
        v-model:value="days"
        :options="[
          { label: '全部日期', value: 0 },
          { label: '最近 30 天', value: 30 },
          { label: '最近 90 天', value: 90 },
          { label: '最近一年', value: 365 }
        ]"
      /><n-select
        v-model:value="recent"
        :options="[
          { label: '累计表现', value: 0 },
          { label: '最近 20 场', value: 20 },
          { label: '最近 50 场', value: 50 },
          { label: '最近 100 场', value: 100 }
        ]"
      />
    </div>
    <div class="stat-grid">
      <article>
        <small>归档胜率</small><strong>{{ percent(total.winRate) }}</strong
        ><span>{{ total.wins }} 胜 / {{ total.losses }} 负</span>
      </article>
      <article>
        <small>正常对局场数</small><strong>{{ total.games }}</strong
        ><span>所选模式与日期</span>
      </article>
      <article>
        <small>使用英雄</small><strong>{{ heroes.length }}</strong
        ><span>每位英雄独立统计</span>
      </article>
      <article>
        <small>综合 KDA</small><strong>{{ total.kda.toFixed(2) }}</strong
        ><span>总击杀与助攻 / 总死亡</span>
      </article>
    </div>
    <details v-if="!performance" class="relations">
      <summary>近期好友 / 宿敌 · 当前模式最近 20 场</summary>
      <div class="relations-grid">
        <RelationshipPanel
          variant="friend"
          :summoners="relations.friendsSummoner"
          :is-dark="isDark"
        /><RelationshipPanel
          variant="dispute"
          :summoners="relations.disputeSummoner"
          :is-dark="isDark"
        />
      </div>
    </details>
    <template v-if="performance">
      <div class="filters">
        <n-button :type="tab === 'heroes' ? 'primary' : 'default'" @click="tab = 'heroes'"
          >英雄表现</n-button
        ><n-button :type="tab === 'augments' ? 'primary' : 'default'" @click="tab = 'augments'"
          >我的海克斯</n-button
        ><n-select v-model:value="champion" filterable :options="championOptions" /><n-input
          v-model:value="search"
          placeholder="搜索英雄或强化"
        /><n-select
          v-model:value="minimum"
          :options="[
            { label: '至少 1 场', value: 1 },
            { label: '至少 5 场', value: 5 },
            { label: '至少 10 场', value: 10 }
          ]"
        /><n-select
          v-model:value="sort"
          :options="[
            { label: '按场数', value: 'games' },
            { label: '按胜率', value: 'winRate' },
            { label: '按胜率差', value: 'delta' }
          ]"
        />
      </div>
      <div v-if="tab === 'heroes'" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>英雄</th>
              <th>场数</th>
              <th>胜 / 负</th>
              <th>胜率</th>
              <th>KDA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in heroRows" :key="h.id">
              <td><img :src="assetPrefix + '/champion/' + h.id" />{{ getChampionName(h.id) }}</td>
              <td>{{ h.games }}</td>
              <td>{{ h.wins }} / {{ h.losses }}</td>
              <td :class="rateClass(h.winRate)">{{ percent(h.winRate) }}</td>
              <td>{{ h.kda.toFixed(2) }}</td>
              <td><n-button size="small" @click="showHero(h.id)">查看对局</n-button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <template v-else>
        <p class="notice">
          胜率差按相同英雄的整体胜率加权比较，表示历史相关性。每场同一强化只计一次，多枚强化分别计入。少于
          10 场标记低样本。
        </p>
        <div class="augment-grid">
          <article v-for="a in augmentRows" :key="a.id" class="augment-card">
            <header>
              <img :src="assetPrefix + '/perk/' + a.id" :alt="augmentName(a.id)" />
              <div>
                <h3>{{ augmentName(a.id) }}</h3>
                <small
                  >{{ a.games }} 场 · {{ a.wins }} 胜 {{ a.losses }} 负
                  <b v-if="a.games < 10">· 低样本</b></small
                >
              </div>
            </header>
            <div class="augment-numbers">
              <strong :class="rateClass(a.winRate)">{{ percent(a.winRate) }}</strong
              ><span :class="(a.delta ?? 0) > 0 ? 'good' : 'bad'"
                >{{ difference(a.delta) }} 个百分点</span
              >
            </div>
            <small>相对同英雄整体胜率</small>
            <div class="used-heroes">
              <button
                v-for="h in expanded.includes(a.id) ? a.heroes : a.heroes.slice(0, 6)"
                :key="h.id"
                :title="getChampionName(h.id) + ' · ' + h.games + ' 场 · ' + percent(h.winRate)"
                @click="champion = h.id"
              >
                <img :src="assetPrefix + '/champion/' + h.id" /><span
                  >{{ getChampionName(h.id)
                  }}<small>{{ h.games }} 场 · {{ percent(h.winRate) }}</small></span
                >
              </button>
            </div>
            <n-button
              v-if="a.heroes.length > 6"
              size="small"
              quaternary
              @click="
                expanded = expanded.includes(a.id)
                  ? expanded.filter(id => id !== a.id)
                  : [...expanded, a.id]
              "
              >{{
                expanded.includes(a.id) ? '收起英雄' : '全部 ' + a.heroes.length + ' 位英雄'
              }}</n-button
            >
            <n-button size="small" @click="showAugment(a.id)">查看选择过的对局</n-button>
          </article>
        </div>
        <p v-if="!augmentRows.length" class="empty">
          当前条件下没有强化记录。可降低最少场数或调整筛选。
        </p>
      </template>
    </template>
    <template v-else>
      <div class="filters">
        <n-select v-model:value="champion" filterable :options="championOptions" /><n-button
          v-if="augment"
          @click="augment = 0"
          >清除强化筛选：{{ augmentName(augment) }}</n-button
        >
      </div>
      <div class="records">
        <RecordCard
          v-for="g in pageGames"
          :key="g.platformId + ':' + g.gameId"
          :games="g"
          @open-detail="detail = g"
        />
      </div>
      <n-pagination
        v-model:page="page"
        :page-count="Math.max(1, Math.ceil(recordGames.length / 20))"
      />
      <p v-if="!recordGames.length" class="empty">
        {{ syncing ? '正在获取战绩…' : '暂无符合条件的对局' }}
      </p>
    </template>
    <n-modal
      v-model:show="detailOpen"
      preset="card"
      title="对局详情"
      style="width: min(1500px, 96vw)"
      :content-style="{ padding: '0' }"
      ><MatchDetailModal :game="detail"
    /></n-modal>
  </main>
</template>
<script setup lang="ts">
import ClientTotals from '../components/record/ClientTotals.vue'
import HistoryAudit from '../components/record/HistoryAudit.vue'
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import RelationshipPanel from '@renderer/components/record/RelationshipPanel.vue'
import { defaultFriendAndDispute, type UserTag } from '@renderer/types/domain/analysis'
import { useTheme } from '@renderer/composables/useTheme'

import { NButton, NSelect, NInput, NPagination, NModal } from 'naive-ui'
import {
  usePersonalHistory,
  selectHexGames,
  summary,
  championStats,
  augmentStats,
  hexModes
} from '@renderer/services/hexaram'
import { assetPrefix } from '@renderer/services/http'
import { loadChampionNames, getChampionName } from '@renderer/services/ai/champion-names'
import { useRecordAssets } from '@renderer/composables/useRecordAssets'
import { getMayhem, type MayhemData } from '@renderer/services/mayhem'
import RecordCard from '@renderer/components/record/RecordCard.vue'
import MatchDetailModal from '@renderer/components/record/MatchDetailModal.vue'
import type { Game } from '@renderer/types/domain/match'
const { personal, syncing, syncError, sync } = usePersonalHistory()
const relations = ref(defaultFriendAndDispute()),
  { isDark } = useTheme()
let relationshipRequest = 0
const route = useRoute(),
  router = useRouter(),
  performance = computed(() => route.path === '/Performance')
const queue = ref(Number(route.query.queue ?? 2400)),
  days = ref(Number(route.query.days ?? 0)),
  recent = ref(Number(route.query.recent ?? 0)),
  champion = ref(Number(route.query.champion ?? 0)),
  minimum = ref(1),
  sort = ref('games'),
  search = ref(''),
  tab = ref('heroes'),
  page = ref(1),
  augment = ref(Number(route.query.augment ?? 0))
const expanded = ref<number[]>([])
const namesLoaded = ref(false),
  mayhem = ref<MayhemData | null>(null)
watch(
  () => [personal.value?.account.puuid, queue.value] as const,
  async ([puuid, mode]) => {
    const seq = ++relationshipRequest
    relations.value = defaultFriendAndDispute()
    if (!puuid) return
    try {
      const tag = await invoke<UserTag>('get_user_tag_by_puuid', { puuid, mode, championId: null })
      if (seq === relationshipRequest) relations.value = tag.recentData.friendAndDispute
    } catch {
      /* Offline records are still available. */
    }
  },
  { immediate: true }
)
const filtered = computed(() =>
  selectHexGames(
    personal.value?.games || [],
    queue.value,
    0,
    days.value ? Date.now() - days.value * 86400000 : 0,
    recent.value
  )
)
const scoped = computed(() =>
  champion.value
    ? filtered.value.filter(g => g.participants[0].championId === champion.value)
    : filtered.value
)
const total = computed(() => summary(filtered.value)),
  heroes = computed(() => championStats(filtered.value))
const championOptions = computed(() => {
  void namesLoaded.value
  return [
    { label: '全部英雄', value: 0 },
    ...heroes.value.map(h => ({ label: getChampionName(h.id), value: h.id }))
  ]
})
const heroRows = computed(() => {
  void namesLoaded.value
  return heroes.value
    .filter(
      h =>
        h.games >= minimum.value &&
        (!champion.value || champion.value === h.id) &&
        getChampionName(h.id).includes(search.value)
    )
    .sort((a, b) =>
      sort.value === 'winRate' ? (b.winRate ?? -1) - (a.winRate ?? -1) : b.games - a.games
    )
})
const { augmentDetails, preload } = useRecordAssets()
const augmentName = (id: number) =>
  augmentDetails.value[id]?.name ||
  mayhem.value?.augments.find(a => a.id === id)?.name ||
  `强化 ${id}`
const augments = computed(() => augmentStats(scoped.value))
watch(augments, rows => preload([{ kind: 'perk', ids: rows.map(a => a.id) }]), { immediate: true })
const augmentRows = computed(() =>
  augments.value
    .filter(a => a.games >= minimum.value && augmentName(a.id).includes(search.value))
    .sort((a, b) =>
      sort.value === 'delta'
        ? (b.delta ?? -1) - (a.delta ?? -1)
        : sort.value === 'winRate'
          ? (b.winRate ?? -1) - (a.winRate ?? -1)
          : b.games - a.games
    )
)
const recordGames = computed(() =>
  scoped.value.filter(
    g =>
      !augment.value ||
      [
        g.participants[0].stats.playerAugment1,
        g.participants[0].stats.playerAugment2,
        g.participants[0].stats.playerAugment3,
        g.participants[0].stats.playerAugment4,
        g.participants[0].stats.playerAugment5,
        g.participants[0].stats.playerAugment6
      ].includes(augment.value)
  )
)
const pageGames = computed(() => recordGames.value.slice((page.value - 1) * 20, page.value * 20))
watch([queue, days, recent, champion, augment], () => (page.value = 1))
const percent = (n: number | null) => (n === null ? '—' : (n * 100).toFixed(2) + '%')
const difference = (n: number | null) =>
  n === null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(2)
const rateClass = (n: number | null) => (n !== null && n >= 0.5 ? 'good' : 'bad')
const detail = ref<Game | null>(null),
  detailOpen = computed({
    get: () => !!detail.value,
    set: (v: boolean) => {
      if (!v) detail.value = null
    }
  })
function showHero(id: number) {
  champion.value = id
  augment.value = 0
  router.push({
    path: '/MyRecords',
    query: {
      champion: champion.value,
      augment: augment.value,
      queue: queue.value,
      days: days.value,
      recent: recent.value
    }
  })
}
function showAugment(id: number) {
  augment.value = id
  router.push({
    path: '/MyRecords',
    query: {
      champion: champion.value,
      augment: augment.value,
      queue: queue.value,
      days: days.value,
      recent: recent.value
    }
  })
}
onMounted(async () => {
  await loadChampionNames()
  namesLoaded.value = true
  try {
    mayhem.value = await getMayhem()
  } catch {
    /* Local stats remain usable without OP.GG. */
  }
})
</script>
<style scoped>
.relations {
  margin: 16px 0;
  padding: 14px;
  border-radius: 10px;
  background: var(--bg-elevated);
}
.relations summary {
  cursor: pointer;
}
.relations-grid {
  display: flex;
  gap: 24px;
  padding-top: 15px;
}
.personal-page {
  padding: 24px;
  max-width: 1600px;
  margin: auto;
}
.personal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.identity {
  display: flex;
  gap: 12px;
  align-items: center;
}
.identity > img {
  width: 58px;
  height: 58px;
  border-radius: 50%;
}
h1 {
  font-size: 23px;
  margin: 0 0 5px;
}
.notice {
  color: var(--text-secondary);
  line-height: 1.7;
  font-size: 12px;
}
.filters {
  display: flex;
  gap: 10px;
  margin: 18px 0;
  flex-wrap: wrap;
}
.filters > .n-select,
.filters > .n-input {
  width: 170px;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.stat-grid article,
.augment-card,
.table-wrap {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 20px;
}
.stat-grid strong {
  display: block;
  font-size: 32px;
  color: #87dcb8;
  margin: 8px 0;
}
.stat-grid small,
.stat-grid span {
  color: var(--text-secondary);
}
table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
td,
th {
  padding: 14px;
  border-bottom: 1px solid var(--border-color);
}
td img {
  width: 40px;
  height: 40px;
  vertical-align: middle;
  margin-right: 12px;
  border-radius: 6px;
}
.good {
  color: #87dcb8;
}
.bad {
  color: #ed8f99;
}
.augment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.augment-card header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.augment-card header img {
  width: 48px;
  height: 48px;
}
.augment-card h3 {
  margin: 0 0 6px;
}
.augment-card small {
  color: var(--text-secondary);
}
.augment-numbers {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
}
.augment-numbers strong {
  font-size: 30px;
}
.used-heroes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 18px 0;
}
.used-heroes button {
  display: flex;
  align-items: center;
  gap: 6px;
  color: inherit;
  background: var(--surface-sunken);
  border: 0;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
}
.used-heroes img {
  width: 30px;
  height: 30px;
}
.used-heroes small {
  display: block;
}
.records {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}
.empty {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}
@media (max-width: 900px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .personal-page {
    padding: 16px;
  }
}
</style>
