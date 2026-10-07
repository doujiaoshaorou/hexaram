import { computed, ref, shallowRef, h } from 'vue'
import { invoke, Channel } from '@tauri-apps/api/core'
import { useDialog, useNotification } from 'naive-ui'
import { openUrl } from '@tauri-apps/plugin-opener'
import { getConfigByIpc, putConfigByIpc } from '../services/ipc'

export const PROJECT_URL = 'https://github.com/doujiaoshaorou/hexaram'
export const RELEASES_URL = `${PROJECT_URL}/releases`
export interface ReleaseInfo {
  version: string
  title: string
  notes: string
  url: string
  publishedAt: string
  downloadable: boolean
}
interface Overview {
  currentVersion: string
  latest: ReleaseInfo | null
  releases: ReleaseInfo[]
  readyVersion: string | null
}
export function isNewer(version: string, current: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^\d+\.\d+\.\d+$/.test(current)) return false
  const a = version.split('.').map(Number),
    b = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}
const checking = ref(false),
  downloading = ref(false),
  installing = ref(false)
const currentVersion = ref(''),
  releases = shallowRef<ReleaseInfo[]>([]),
  latest = shallowRef<ReleaseInfo | null>(null)
const readyVersion = ref<string | null>(null),
  error = ref(''),
  checkedAt = ref('')
const autoCheck = ref(true),
  autoDownload = ref(false),
  preferencesLoaded = ref(false)
const received = ref(0),
  total = ref<number | null>(null)
const availableUpdate = computed(() =>
  latest.value && isNewer(latest.value.version, currentVersion.value) ? latest.value : null
)
let preferencesTask: Promise<void> | null = null
const notified = new Set<string>()

export function useAppUpdate() {
  const notification = useNotification(),
    dialog = useDialog()
  async function loadPreferences() {
    if (!preferencesTask)
      preferencesTask = (async () => {
        const [check, download] = await Promise.all([
          getConfigByIpc<boolean>('hexAutoCheckUpdates').catch(() => true),
          getConfigByIpc<boolean>('hexAutoDownloadUpdates').catch(() => false)
        ])
        autoCheck.value = check !== false
        autoDownload.value = download === true
        preferencesLoaded.value = true
      })()
    await preferencesTask
  }
  async function downloadUpdate(update: ReleaseInfo) {
    if (downloading.value || installing.value) return
    if (!update.downloadable) {
      await openUrl(update.url)
      return
    }
    downloading.value = true
    received.value = 0
    total.value = null
    error.value = ''
    const channel = new Channel<{ received: number; total: number | null }>()
    channel.onmessage = event => {
      received.value = event.received
      total.value = event.total
    }
    try {
      readyVersion.value = await invoke<string>('hex_download_update', {
        version: update.version,
        onEvent: channel
      })
      notification.success({
        title: '更新已下载',
        content: `v${update.version} 已校验，前往「关于我们」点击重启安装。`,
        duration: 6000
      })
    } catch (e) {
      error.value = String(e)
      notification.error({ title: '更新下载失败', content: error.value, duration: 6000 })
    } finally {
      downloading.value = false
    }
  }
  function installUpdate() {
    if (installing.value || downloading.value) return
    dialog.warning({
      title: '重启安装更新',
      content: '将保存现有配置与战绩并重启战绩本。选人或对局进行中不会安装。',
      positiveText: '重启安装',
      negativeText: '稍后',
      onPositiveClick: async () => {
        installing.value = true
        error.value = ''
        try {
          await invoke('hex_install_update')
        } catch (e) {
          error.value = String(e)
          notification.error({ title: '暂时无法安装', content: error.value, duration: 6000 })
        } finally {
          installing.value = false
        }
      }
    })
  }
  function showUpdateDialog(update: ReleaseInfo) {
    dialog.info({
      title: `发现新版本 v${update.version}`,
      content: () =>
        h('div', [
          h('p', '更新说明可在「关于我们 → 更新记录」或 Release 查看。'),
          h(
            'p',
            readyVersion.value === update.version
              ? '更新已下载并校验，可重启安装。'
              : '可先下载更新，安装时再确认重启。'
          )
        ]),
      positiveText:
        readyVersion.value === update.version
          ? '安装更新'
          : update.downloadable
            ? '下载更新'
            : '查看 Release',
      negativeText: '稍后',
      onPositiveClick: () =>
        readyVersion.value === update.version ? installUpdate() : downloadUpdate(update)
    })
  }
  async function checkForUpdates(mode: 'manual' | 'silent' = 'manual') {
    if (checking.value) return null
    checking.value = true
    error.value = ''
    try {
      const value = await invoke<Overview>('hex_check_updates')
      currentVersion.value = value.currentVersion
      latest.value = value.latest
      releases.value = value.releases
      readyVersion.value = value.readyVersion
      checkedAt.value = new Date().toLocaleString()
      const update = availableUpdate.value
      if (update) {
        if (!notified.has(update.version) || mode === 'manual') {
          notified.add(update.version)
          notification.info({
            title: `发现新版 v${update.version}`,
            content: '点击顶部新版提示，或在「关于我们」查看更新内容。',
            duration: 6000
          })
        }
        if (autoDownload.value && update.downloadable && readyVersion.value !== update.version)
          void downloadUpdate(update)
      } else if (mode === 'manual')
        notification.info({
          title: '检查完成',
          content: value.latest ? '当前已是最新版本。' : '暂未发布正式版本。',
          duration: 3000
        })
      return update
    } catch (e) {
      error.value = String(e)
      if (mode === 'manual')
        notification.error({ title: '检查更新失败', content: error.value, duration: 6000 })
      return null
    } finally {
      checking.value = false
    }
  }
  async function setAutoCheck(value: boolean) {
    await putConfigByIpc('hexAutoCheckUpdates', value)
    autoCheck.value = value
    if (value) void checkForUpdates('silent')
  }
  async function setAutoDownload(value: boolean) {
    await putConfigByIpc('hexAutoDownloadUpdates', value)
    autoDownload.value = value
    if (value && availableUpdate.value && readyVersion.value !== availableUpdate.value.version)
      void downloadUpdate(availableUpdate.value)
  }
  async function backgroundCheck() {
    await loadPreferences()
    if (autoCheck.value) await checkForUpdates('silent')
  }
  return {
    checking,
    downloading,
    installing,
    currentVersion,
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
    availableUpdate,
    loadPreferences,
    checkForUpdates,
    showUpdateDialog,
    downloadUpdate,
    installUpdate,
    setAutoCheck,
    setAutoDownload,
    backgroundCheck
  }
}
