<template>
  <n-card title="常规设置">
    <n-form label-placement="left" label-width="120">
      <n-form-item label="对局卡片场数">
        <n-input-number
          v-model:value="matchCount"
          :min="1"
          :max="20"
          @update:value="handleUpdate"
        />
      </n-form-item>
      <p class="setting-help">
        对局页每位玩家展示的近期记录数，默认 4 场、最多 20 场；不影响左侧最近 20
        场统计或个人归档总量。
      </p>
      <n-form-item label="匿名错误上报">
        <n-space vertical :size="4">
          <n-switch
            v-model:value="errorReporting"
            :disabled="!reportingAvailable && !errorReporting"
            @update:value="handleReportingUpdate"
          />
          <n-text :depth="3" style="font-size: var(--font-size-sm)">
            {{
              reportingAvailable
                ? '开启后发送脱敏错误信息，重启生效。可随时在此关闭。'
                : '本版本未接入错误上报服务，不会上报，也不再弹出征求同意窗口。若旧版保存了开启偏好，可在此关闭。'
            }}
          </n-text>
        </n-space>
      </n-form-item>
      <n-form-item label="AI 服务"><AIConnectionSettings /></n-form-item>
      <n-form-item label="AI 分析携带玩家备注">
        <n-space vertical :size="4">
          <n-switch v-model:value="aiUseNotes" @update:value="handleAiUseNotesUpdate" />
          <n-text :depth="3" style="font-size: var(--font-size-sm)">
            开启后你的玩家备注会随分析请求发送到 AI 服务。
          </n-text>
        </n-space>
      </n-form-item>
    </n-form>
  </n-card>
</template>

<script setup lang="ts">
import AIConnectionSettings from '../../components/AIConnectionSettings.vue'
import { invoke } from '@tauri-apps/api/core'
import { ref, onMounted } from 'vue'
import { getConfigByIpc, putConfigByIpc } from '@renderer/services/ipc'
import { CONFIG_KEYS } from '@renderer/services/configKeys'
import { useMessage } from 'naive-ui'

const matchCount = ref(4)
const errorReporting = ref(false)
const reportingAvailable = ref(false)

/** AI 分析是否携带玩家备注（默认开：键不存在时视为 true） */
const aiUseNotes = ref(false)
const message = useMessage()

onMounted(async () => {
  reportingAvailable.value = await invoke<{ errorReportingAvailable: boolean }>(
    'get_service_capabilities'
  )
    .then(v => v.errorReportingAvailable)
    .catch(() => false)
  try {
    const val = await getConfigByIpc<number>('matchHistoryCount')
    if (typeof val === 'number') {
      matchCount.value = val
    }
  } catch (e) {
    console.error(e)
  }
  try {
    const enabled = await getConfigByIpc<boolean>(CONFIG_KEYS.errorReportingEnabled)
    if (typeof enabled === 'boolean') {
      errorReporting.value = enabled
    }
  } catch (e) {
    console.error(e)
  }
  try {
    const useNotes = await getConfigByIpc<boolean>(CONFIG_KEYS.aiUsePlayerNotes)
    if (typeof useNotes === 'boolean') {
      aiUseNotes.value = useNotes
    }
  } catch (e) {
    console.error(e)
  }
})

const handleUpdate = async (value: number | null) => {
  if (!value) return
  try {
    await putConfigByIpc('matchHistoryCount', value)
    message.success('设置已保存，下次获取数据时生效')
  } catch (e) {
    message.error('保存失败')
  }
}

const handleReportingUpdate = async (value: boolean) => {
  try {
    await putConfigByIpc(CONFIG_KEYS.errorReportingEnabled, value)
    message.success('设置已保存，重启后生效')
  } catch (e) {
    message.error('保存失败')
  }
}

const handleAiUseNotesUpdate = async (value: boolean) => {
  try {
    await putConfigByIpc(CONFIG_KEYS.aiUsePlayerNotes, value)
    message.success('设置已保存')
  } catch (e) {
    message.error('保存失败')
  }
}
</script>
