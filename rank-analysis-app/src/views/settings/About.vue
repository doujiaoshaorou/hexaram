<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
const version = ref('0.8.1')
onMounted(async () => {
  version.value = await getVersion()
})
</script>
<template>
  <n-card title="关于海克斯战绩本"
    ><div class="brand">
      <img src="../../assets/wy-logo.svg" alt="WY" />
      <div>
        <h1>海克斯战绩本 <small>Hexaram</small></h1>
        <n-tag type="success">v{{ version }}</n-tag>
        <p>属于你的海克斯大乱斗战绩与复盘工具</p>
      </div>
    </div>
    <n-divider />
    <h3>本版功能</h3>
    <p>
      自动归档个人战绩、英雄与强化胜率、实时阵容、英雄池推荐、OP.GG 海克斯梯队、整局与单人 AI 复盘。
    </p>
    <h3>作者与开发</h3>
    <p>作者：doujiaoshaorou。使用 GPT-6 Astra 辅助二次开发。WY 是本项目独立标志。</p>
    <n-button @click="openUrl('https://github.com/doujiaoshaorou')">作者 GitHub</n-button>
    <h3>开源来源</h3>
    <p>
      本项目基于 wnzzer/Rank Analysis 二次开发，沿用其 Vue / Tauri
      架构、客户端连接、战绩与实时对局能力。保留上游 MIT
      许可证及版权声明。本项目是独立衍生版本，并非 RA 官方发布。
    </p>
    <n-button @click="openUrl('https://github.com/wnzzer/rank-analysis')"
      >查看 Rank Analysis 上游</n-button
    >
    <h3>数据与 AI</h3>
    <p>
      战绩来自当前客户端可访问的接口，并保存在本机；可能缺少早期对局。OP.GG
      梯队与个人胜率分别展示。MVP / SVP 沿用 RA 七维加权评分，不代表官方结算。
    </p>
    <p>
      AI 复盘可选择 DeepSeek 或通义千问，需自行配置对应的 API
      Key；点击分析时，本场数据会发送至你选择的 AI 服务并消耗相应额度。AI
      获得结算、当前技能与强化资料，以及客户端可用的事件时间线；没有录像。仅供复盘参考。
    </p>
    <h3>0.8.1 修复</h3>
    <p>历史对局详情直接在软件内打开；游戏进行中无需新建窗口。保留独立窗口入口，恢复最小化窗口，打开失败时显示提示。</p>
    <h3>0.8.0 更新</h3>
    <p>
      赛段核对改为只读；重开局保留原始记录，默认不计入场次、胜率、KDA、英雄与强化统计，可在列表勾选查看。
      WY 改为最近 200 场的海斗表现分：胜率为主，队内贡献与 MVP/SVP 修正，不再靠场数无限累积。
      玩法标签结合成装与实际作用，新增前排、奶盾及重复低效表现；保留原有自定义标签。不是官方隐藏分。
    </p>
    <p class="muted">
      项目公开仓库与下载地址将在正式发布后补充；当前版本不会自动安装 RA 上游更新。
    </p></n-card
  >
</template>
<style scoped>
.brand {
  display: flex;
  gap: 24px;
  align-items: center;
}
.brand img {
  width: 90px;
  height: 90px;
}
h1 {
  margin: 0 0 12px;
}
small,
.muted {
  color: var(--text-secondary);
}
p {
  line-height: 1.8;
}
h3 {
  margin-top: 28px;
}
</style>
