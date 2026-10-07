import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  dialog: vi.fn(),
  warning: vi.fn(),
  open: vi.fn()
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  Channel: class {
    onmessage: unknown
  }
}))
vi.mock('../services/ipc', () => ({ getConfigByIpc: mocks.get, putConfigByIpc: mocks.put }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: mocks.open }))
vi.mock('naive-ui', () => ({
  useNotification: () => ({ info: mocks.info, success: mocks.success, error: mocks.error }),
  useDialog: () => ({ info: mocks.dialog, warning: mocks.warning })
}))
const release = {
  version: '0.10.0',
  title: '新版',
  notes: '正文',
  url: 'https://github.com/doujiaoshaorou/hexaram/releases/tag/v0.10.0',
  publishedAt: '2026-10-07',
  downloadable: true
}
async function setup() {
  const module = await import('./useAppUpdate')
  return { ...module, update: module.useAppUpdate() }
}
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.get.mockResolvedValue(undefined)
  mocks.put.mockResolvedValue(undefined)
  mocks.invoke.mockResolvedValue({
    currentVersion: '0.9.0',
    latest: release,
    releases: [release],
    readyVersion: null
  })
})
describe('Hexaram releases', () => {
  it('compares versions numerically and rejects prerelease/path input', async () => {
    const { isNewer } = await setup()
    expect(isNewer('0.10.0', '0.9.0')).toBe(true)
    expect(isNewer('0.9.0', '0.9.0')).toBe(false)
    expect(isNewer('0.8.1', '0.9.0')).toBe(false)
    expect(isNewer('0.10.0-rc1', '0.9.0')).toBe(false)
  })
  it('checks automatically by default but never downloads or installs without opt-in', async () => {
    const { update } = await setup()
    await update.backgroundCheck()
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).toHaveBeenCalledWith('hex_check_updates')
    expect(update.availableUpdate.value?.version).toBe('0.10.0')
  })
  it('respects disabled background checks while manual checks still work', async () => {
    mocks.get.mockResolvedValue(false)
    const { update } = await setup()
    await update.backgroundCheck()
    expect(mocks.invoke).not.toHaveBeenCalled()
    await update.checkForUpdates()
    expect(mocks.invoke).toHaveBeenCalledWith('hex_check_updates')
  })
  it('shares the result with the header/about instances', async () => {
    const { update, useAppUpdate } = await setup()
    await update.checkForUpdates()
    expect(useAppUpdate().availableUpdate.value).toBe(update.availableUpdate.value)
  })
  it('auto-downloads once and never auto-installs', async () => {
    mocks.get.mockResolvedValue(true)
    mocks.invoke.mockImplementation(async cmd =>
      cmd === 'hex_download_update'
        ? '0.10.0'
        : { currentVersion: '0.9.0', latest: release, releases: [release], readyVersion: null }
    )
    const { update } = await setup()
    await update.backgroundCheck()
    await Promise.resolve()
    expect(mocks.invoke).toHaveBeenCalledWith(
      'hex_download_update',
      expect.objectContaining({ version: '0.10.0' })
    )
    expect(update.readyVersion.value).toBe('0.10.0')
    expect(mocks.invoke).not.toHaveBeenCalledWith('hex_install_update')
  })
  it('never auto-downloads an unsigned version', async () => {
    mocks.get.mockResolvedValue(true)
    mocks.invoke.mockResolvedValue({
      currentVersion: '0.9.0',
      latest: { ...release, downloadable: false },
      releases: [],
      readyVersion: null
    })
    const { update } = await setup()
    await update.backgroundCheck()
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
  })
  it('does not claim up-to-date when network fails', async () => {
    mocks.invoke.mockRejectedValue('连接失败')
    const { update } = await setup()
    await update.checkForUpdates()
    expect(update.error.value).toBe('连接失败')
    expect(mocks.error).toHaveBeenCalled()
    expect(mocks.info).not.toHaveBeenCalled()
    expect(update.checking.value).toBe(false)
  })
  it('keeps failed download retryable without marking ready', async () => {
    mocks.invoke.mockRejectedValue('签名校验失败')
    const { update } = await setup()
    await update.downloadUpdate(release)
    expect(update.readyVersion.value).toBeNull()
    expect(update.downloading.value).toBe(false)
    expect(update.error.value).toContain('签名')
  })
  it('ignores duplicate checks and duplicate downloads', async () => {
    let resolve: (v: any) => void = () => {}
    mocks.invoke.mockImplementation(() => new Promise(r => (resolve = r)))
    const { update } = await setup()
    const first = update.checkForUpdates()
    await update.checkForUpdates()
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    resolve({ currentVersion: '0.9.0', latest: release, releases: [], readyVersion: null })
    await first
    const transfer = update.downloadUpdate(release)
    await update.downloadUpdate(release)
    expect(mocks.invoke).toHaveBeenCalledTimes(2)
    resolve('0.10.0')
    await transfer
  })
  it('requires explicit restart confirmation and shows backend refusal', async () => {
    const { update } = await setup()
    update.installUpdate()
    expect(mocks.invoke).not.toHaveBeenCalled()
    mocks.invoke.mockRejectedValue('游戏进行中')
    await mocks.warning.mock.calls[0][0].onPositiveClick()
    expect(update.error.value).toContain('游戏进行中')
    expect(update.installing.value).toBe(false)
  })
  it('does not change a switch when configuration saving fails', async () => {
    mocks.put.mockRejectedValue(new Error('disk full'))
    const { update } = await setup()
    await expect(update.setAutoDownload(true)).rejects.toThrow()
    expect(update.autoDownload.value).toBe(false)
  })
})
