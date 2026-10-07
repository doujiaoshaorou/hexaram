<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getConfigByIpc, putConfigByIpc } from '@renderer/services/ipc'
import { useMessage } from 'naive-ui'
import HexChampionPool from '@renderer/components/gaming/HexChampionPool.vue'
const accept = ref(false),
  start = ref(false),
  message = useMessage()
onMounted(async () => {
  accept.value = (await getConfigByIpc<boolean>('settings.auto.acceptMatchSwitch')) === true
  start.value = (await getConfigByIpc<boolean>('settings.auto.startMatchSwitch')) === true
})
async function save(key: string, value: boolean) {
  try {
    await putConfigByIpc('settings.auto.' + key, value)
    message.success('已保存')
  } catch {
    message.error('保存失败')
  }
}
</script>
<template>
  <n-space vertical
    ><n-card title="匹配设置"
      ><n-space vertical size="large"
        ><n-flex justify="space-between"
          ><span>自动接受对局</span
          ><n-switch
            v-model:value="accept"
            @update:value="(v: boolean) => save('acceptMatchSwitch', v)" /></n-flex
        ><n-flex justify="space-between"
          ><span>自动开始匹配</span
          ><n-switch
            v-model:value="start"
            @update:value="(v: boolean) => save('startMatchSwitch', v)" /></n-flex
        ><n-text depth="3"
          >按需开启，默认关闭。英雄选择和交换由你在游戏客户端操作。</n-text
        ></n-space
      ></n-card
    ><HexChampionPool
  /></n-space>
</template>
