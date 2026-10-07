<template>
  <n-space vertical>
    <n-select
      v-model:value="provider"
      :options="providers"
      aria-label="AI 服务商"
      @update:value="changeProvider"
    />
    <n-input
      v-model:value="model"
      :placeholder="
        provider === 'deepseek'
          ? '模型：deepseek-flash（留空使用默认）'
          : '模型：自动选择通义千问模型（可留空）'
      "
      @update:value="saved = false"
    />
    <n-input
      v-model:value="apiKey"
      type="password"
      show-password-on="click"
      placeholder="所选服务商的 API Key"
      @update:value="saved = false"
    />
    <n-text depth="3"
      >{{
        provider === 'deepseek'
          ? 'DeepSeek · api.deepseek.com'
          : '通义千问 · dashscope.aliyuncs.com'
      }}。Key 必须来自所选服务商。旧版已填写的 Key 会保留，请选择对应服务商后保存。AI
      消耗你的额度，并发送相关对局数据；本版本不内置公共
      Key。海斗复盘通常包含生成与机制核对两次请求；格式不合格时最多额外重试一次。</n-text
    >
    <n-button type="primary" :loading="saving" :disabled="!ready" @click="save"
      >保存 AI 配置</n-button
    >
    <n-text v-if="saved" type="success"
      >已保存，立即生效。可返回复盘点击「重新分析」；保存不会发送 AI 请求。</n-text
    >
  </n-space>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { NInput, NSelect, NSpace, NText, NButton, useMessage } from 'naive-ui'
import { getConfigByIpc, putConfigByIpc } from '@renderer/services/ipc'
const provider = ref('dashscope'),
  model = ref(''),
  apiKey = ref('')
const ready = ref(false),
  saving = ref(false),
  saved = ref(false)
const message = useMessage()
const providers = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: '通义千问（DashScope）', value: 'dashscope' }
]
onMounted(async () => {
  try {
    const c = await getConfigByIpc<{ provider: string; model: string; apiKey: string }>(
      'aiConnection'
    )
    if (c && typeof c === 'object') {
      provider.value = c.provider || 'dashscope'
      model.value = c.model || ''
      apiKey.value = c.apiKey || ''
    } else apiKey.value = (await getConfigByIpc<string>('dashscopeApiKey')) || ''
    ready.value = true
  } catch {
    message.error('读取 AI 配置失败，请重新打开设置')
  }
})
function changeProvider() {
  model.value = ''
  saved.value = false
}
async function save() {
  saving.value = true
  try {
    await putConfigByIpc('aiConnection', {
      provider: provider.value,
      model: model.value.trim(),
      apiKey: apiKey.value.trim()
    })
    saved.value = true
  } catch {
    message.error('保存失败，请重试')
  } finally {
    saving.value = false
  }
}
</script>
