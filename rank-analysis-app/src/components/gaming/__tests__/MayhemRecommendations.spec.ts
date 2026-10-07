import { it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import MayhemRecommendations from '../MayhemRecommendations.vue'
vi.mock('@renderer/services/mayhem', () => ({ augmentTier: () => 'S', getMayhem: async () => ({ patch: 'test', augments: [{ id: 1, champions: [{ id: 25, tier: 0, performance: 1 }] }] }) }))
vi.mock('@renderer/services/http', () => ({ assetPrefix: '/asset' }))
vi.mock('@renderer/services/ipc', () => ({ getAssetDetailsByIpc: async () => [{ id: 1, name: '客户端强化名称', description: '第一行<br/>第二行', rarity: 'kGold' }] }))
it('missing OP.GG text cannot blank the drawer; client metadata fills it', async () => {
 const wrapper = mount(MayhemRecommendations, { props: { championId: 25, detailed: true } })
 await flushPromises()
 expect(wrapper.find('.augment-list').exists()).toBe(true)
 expect(wrapper.text()).toContain('客户端强化名称')
 expect(wrapper.text()).toContain('黄金')
 expect(wrapper.find('.augment-description').text()).toContain('第二行')
})
