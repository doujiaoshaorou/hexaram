<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useMessage } from 'naive-ui'
import { useAppUpdate, PROJECT_URL, RELEASES_URL } from '../../composables/useAppUpdate'
const version = ref('0.9.1')
const update = useAppUpdate()
const {
  checking,
  downloading,
  installing,
  latest,
  releases,
  readyVersion,
  error,
  checkedAt,
  autoCheck,
  autoDownload,
  preferencesLoaded,
  received,
  total,
  availableUpdate
} = update
const message = useMessage()
async function preference(kind: 'check' | 'download', value: boolean) {
  try {
    await (kind === 'check' ? update.setAutoCheck(value) : update.setAutoDownload(value))
  } catch {
    message.error('设置保存失败，请重试')
  }
}
onMounted(async () => {
  version.value = await getVersion()
  await update.loadPreferences()
})
</script>
<template>
  <n-space vertical :size="16">
    <n-card>
      <div class="brand">
        <img src="../../assets/wy-logo.svg" alt="WY" />
        <div>
          <h1>海斗助手 <small>Hexaram</small></h1>
          <n-tag type="success">v{{ version }}</n-tag>
          <p>海克斯大乱斗助手 · 查战绩、选海克斯、复盘每一局</p>
        </div>
      </div>
      <n-space
        ><n-button type="primary" @click="openUrl(PROJECT_URL)">项目仓库</n-button
        ><n-button @click="openUrl(`${PROJECT_URL}/issues`)">问题反馈</n-button
        ><n-button @click="openUrl(RELEASES_URL)">更新记录 / Releases</n-button></n-space
      >
    </n-card>
    <n-card title="应用更新">
      <div class="setting-row">
        <div>
          <strong>自动检查更新</strong>
          <p>启动后及运行期间每 6 小时检查，有新版本时提醒。</p>
        </div>
        <n-switch
          :value="autoCheck"
          :disabled="!preferencesLoaded"
          @update:value="(v: boolean) => preference('check', v)"
        />
      </div>
      <div class="setting-row">
        <div>
          <strong>自动下载更新</strong>
          <p>发现新版后后台下载并校验；安装重启由你确认，保留本机设置和战绩。</p>
        </div>
        <n-switch
          :value="autoDownload"
          :disabled="!preferencesLoaded"
          @update:value="(v: boolean) => preference('download', v)"
        />
      </div>
      <div class="version-row">
        <span
          >已安装 <b>v{{ version }}</b></span
        ><span
          >最新版本 <b>{{ latest ? `v${latest.version}` : '尚未获取' }}</b></span
        >
      </div>
      <n-space>
        <n-button :loading="checking" @click="update.checkForUpdates('manual')">检查更新</n-button>
        <n-button @click="openUrl(latest?.url || `${RELEASES_URL}/latest`)">查看 Release</n-button>
        <n-button
          v-if="availableUpdate && readyVersion !== availableUpdate.version"
          type="primary"
          :loading="downloading"
          :disabled="!availableUpdate.downloadable"
          @click="update.downloadUpdate(availableUpdate)"
          >下载更新</n-button
        >
        <n-button
          v-if="readyVersion"
          type="primary"
          :loading="installing"
          :disabled="downloading"
          @click="update.installUpdate()"
          >重启安装 v{{ readyVersion }}</n-button
        >
      </n-space>
      <div v-if="downloading" class="download-state">
        <n-progress
          v-if="total"
          type="line"
          :percentage="Math.min(100, Math.floor((received / total) * 100))"
        />
        <p>
          {{
            total && received >= total
              ? '正在校验签名并保存…'
              : `已下载 ${(received / 1048576).toFixed(1)} MB`
          }}
        </p>
      </div>
      <n-alert v-if="error" type="warning" class="notice">{{ error }}</n-alert>
      <p v-if="availableUpdate && !availableUpdate.downloadable" class="muted">
        此版本未提供签名更新包，请通过 Release 手动下载。
      </p>
      <p v-if="checkedAt" class="muted">上次检查：{{ checkedAt }}</p>
      <n-collapse class="release-history"
        ><n-collapse-item title="更新记录" name="history">
          <p v-if="!releases.length">点击“检查更新”获取版本列表，也可直接打开 Releases。</p>
          <div v-for="release in releases" :key="release.version" class="release-row">
            <n-button text type="primary" @click="openUrl(release.url)"
              >{{ release.title || `v${release.version}` }} ↗</n-button
            >
            <span class="muted">{{ release.publishedAt.slice(0, 10) }}</span>
            <details>
              <summary>展开更新内容</summary>
              <pre>{{ release.notes || '暂无更新说明，请查看 Release。' }}</pre>
            </details>
          </div>
        </n-collapse-item></n-collapse
      >
    </n-card>
    <n-card title="项目与开源来源">
      <p>作者：doujiaoshaorou。使用 GPT-6 Astra 辅助二次开发，WY 为本项目标志。</p>
      <p>
        基于 wnzzer/Rank Analysis 二次开发，沿用 Vue / Tauri 架构、客户端连接和战绩能力，保留 MIT
        许可证及原作者版权声明。这是独立衍生版本，并非 RA 官方发布。
      </p>
      <n-button text @click="openUrl('https://github.com/wnzzer/rank-analysis')"
        >查看 Rank Analysis 上游 ↗</n-button
      >
      <n-collapse class="release-history"
        ><n-collapse-item title="数据与 AI 说明" name="data"
          ><p>
            战绩来自客户端接口及本机归档，可能缺少早期对局。OP.GG 梯队与个人胜率分别展示；MVP / SVP
            沿用 RA 七维加权评分，WY 海斗表现分不是官方隐藏分。
          </p>
          <p>
            AI 复盘需自行配置 DeepSeek 或通义千问
            Key，点击分析会发送本场数据到所选服务并消耗额度。分析基于结算和可用事件数据，没有录像，仅供参考。
          </p></n-collapse-item
        ></n-collapse
      >
    </n-card>
  </n-space>
</template>
<style scoped>
.brand {
  display: flex;
  gap: 24px;
  align-items: center;
  margin-bottom: 24px;
}
.brand img {
  width: 80px;
  height: 80px;
}
h1 {
  margin: 0 0 12px;
  font-size: 26px;
}
small,
.muted {
  color: var(--text-secondary);
}
p {
  line-height: 1.7;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}
.setting-row p {
  margin: 6px 0;
  color: var(--text-secondary);
}
.version-row {
  display: flex;
  gap: 40px;
  margin: 20px 0;
}
.version-row b {
  margin-left: 12px;
}
.release-history,
.notice,
.download-state {
  margin-top: 20px;
}
.release-row {
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
}
.release-row > span {
  margin-left: 16px;
}
summary {
  cursor: pointer;
  margin-top: 8px;
  color: var(--text-secondary);
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
  line-height: 1.7;
  margin: 12px 0;
}
</style>
