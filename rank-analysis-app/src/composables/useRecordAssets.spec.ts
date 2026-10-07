import { flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { useRecordAssets } from './useRecordAssets'
import { getAssetDetailsByIpc } from '@renderer/services/ipc'
vi.mock('@renderer/services/ipc', () => ({ getAssetDetailsByIpc: vi.fn() }))
vi.mock('@renderer/services/http', () => ({ assetPrefix: 'http://assets' }))
describe('record metadata', () => {
  it('keeps both pages when requests complete out of order', async () => {
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { fn(); return 0 })
    let first!: (v: any) => void, second!: (v: any) => void
    vi.mocked(getAssetDetailsByIpc).mockImplementationOnce(() => new Promise(r => { first = r })).mockImplementationOnce(() => new Promise(r => { second = r }))
    const assets = useRecordAssets()
    assets.preload([{ kind: 'perk', ids: [1058] }])
    assets.preload([{ kind: 'perk', ids: [1001] }])
    second([{ id: 1001, name: '第二页', description: '说明', rarity: 'kGold' }])
    await flushPromises()
    first([{ id: 1058, name: '秘术冲拳', description: '说明', rarity: 'kPrismatic' }])
    await flushPromises()
    expect(assets.detailOf('perk', 1058)?.name).toBe('秘术冲拳')
    expect(assets.detailOf('perk', 1001)?.rarity).toBe('kGold')
    vi.unstubAllGlobals()
  })
})
