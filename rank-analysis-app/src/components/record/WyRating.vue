<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Game } from '@renderer/types/domain/match'
import { estimateWyRating } from '@renderer/services/wyRating'
import { useDetailOpener } from './detailWindow'
const props = defineProps<{ games: Game[]; queue?: number }>()
const mode = ref(2400),
  expanded = ref(false)
const result = computed(() => estimateWyRating(props.games, props.queue || mode.value))
const detail = useDetailOpener()
const open = (id: number) => {
  const g = props.games.find(g => g.gameId === id)
  if (g) detail.open(g)
}
const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`
const pct = (v: number) => (v * 100).toFixed(1) + '%'
</script>
<template>
  <n-card title="WY 海斗表现分" size="small" :bordered="false" class="wy-rating">
    <n-select
      v-if="!queue"
      v-model:value="mode"
      size="small"
      :options="[
        { label: '普通海克斯', value: 2400 },
        { label: '巅峰赛', value: 2410 },
        { label: '经典版', value: 2450 }
      ]"
    />
    <div class="score">
      <strong>{{ result.ready ? result.score : '暂无样本' }}</strong
      ><span>{{ result.confidence }}</span>
    </div>
    <p>
      最近 {{ result.games }} / 200 场正常对局 · 有效样本 {{ result.effective.toFixed(1) }}。以 1000
      为中性基准，场数不累加分数。
    </p>
    <div class="metrics">
      <span
        >窗口胜率<b>{{ pct(result.recentWinRate) }}</b></span
      >
      <span
        >队内贡献修正<b>{{ signed(result.performanceComponent) }}</b></span
      >
    </div>
    <div class="breakdown">
      1000 基准<br />胜负 {{ signed(result.winComponent) }} · 贡献
      {{ signed(result.performanceComponent) }}<br />MVP/SVP {{ signed(result.honorComponent) }} ·
      低贡献 {{ signed(result.penaltyComponent) }}
    </div>
    <p>胜率为主，输出、承伤、参团、支援等参与修正。无对手真实段位/官方 MMR，不能等同排位段位。</p>
    <details>
      <summary>最近逐局依据</summary>
      <div v-for="r in result.ledger" :key="r.gameId" class="ledger">
        <n-button text size="small" @click="open(r.gameId)"
          >{{ new Date(r.date).toLocaleDateString() }} · {{ r.win ? '胜' : '负' }}
          {{ r.badge }}</n-button
        >
        <p>
          队内贡献位置 {{ ((r.performance + 1) * 50).toFixed(0) }}% · 样本权重
          {{ r.weight.toFixed(2) }}<span v-if="r.penalty"> · 多项低贡献</span>
        </p>
        <p>输出 {{ pct(r.damage) }} · 承伤 {{ pct(r.taken) }} · 参团 {{ pct(r.participation) }}</p>
      </div>
    </details>
    <n-button text size="small" @click="expanded = !expanded">{{
      expanded ? '收起评分规则' : '查看评分规则'
    }}</n-button>
    <div v-if="expanded" class="method">
      <p>
        {{ result.version }}：只取同模式最近 200 场正常记录，剔除阵容或核心数据不完整的
        {{ result.excluded }} 场；不是全部生涯累积分。
      </p>
      <p>
        胜负项权重 700、队内贡献项 220、MVP/SVP 项 80，低贡献项最多扣
        100。所有项按样本加权平均；加入 20 场中性先验，少量胜局不会直接冲到顶分。
      </p>
      <p>
        贡献沿用 RA
        七维基础，并加入有实际量级的控制/队友治疗/护盾，比较本队五人的相对位置，同分并列。自疗不计支援；少量治疗独占队伍治疗量不会拿满加成。MVP/SVP
        原算法不变。
      </p>
      <p>
        重复同队权重最低
        0.5，同时降低胜负及表现的证据权重，不确认是否组排。不同模式独立，旧局滑出窗口；长期相同表现不会靠刷场无限涨分。
      </p>
      <p>
        低贡献须输出 &lt;12%、参团 &lt;45%、承伤及各支援占比 &lt;20%、推塔 &lt;10%，死亡 ≥6
        且团队死亡占比 ≥25%，未获 MVP/SVP；支援数据缺失不扣此项。
      </p>
      <p>
        这是可解释的项目估分，未经过全服样本校准；不能证明真实实力或还原官方隐藏分，海克斯触发收益未知时不编造评分。
      </p>
    </div>
  </n-card>
</template>
<style scoped>
.wy-rating {
  margin-top: 12px;
}
.score {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 12px;
}
.score strong {
  font-size: 32px;
  color: #80d9b8;
}
.score span,
p,
.breakdown {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
}
.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 12px 0;
}
.metrics span {
  font-size: 12px;
}
.metrics b {
  display: block;
  font-size: 18px;
}
.ledger,
.method {
  border-top: 1px solid #4446;
  margin-top: 8px;
  padding-top: 8px;
}
summary {
  cursor: pointer;
  font-size: 13px;
  margin: 12px 0;
}
</style>
