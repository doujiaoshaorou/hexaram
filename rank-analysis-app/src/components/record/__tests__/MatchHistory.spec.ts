import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

// Stub vue-router useRoute so the `name` query read doesn't blow up.
// Use importOriginal so other modules importing createRouter/createWebHashHistory still work.
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRoute: () => ({ path: '/Record', query: { name: '测试#1' } })
  }
})

// 静态导入（vi.mock 会被提升到其前）：组件 + naive-ui 的编译耗时计入收集阶段，
// 不占用例 5s 超时（动态 import 在 dev 版并行运行时实测会超时）
import MatchHistory from '../MatchHistory.vue'
import RecordCardSkeleton from '../RecordCardSkeleton.vue'
import { queryPages } from '@renderer/services/queryState'

const stubs = {
  RecordCard: true,
  RecordCardSkeleton: true,
  NPagination: true,
  NEmpty: true,
  NButton: true,
  NSelect: true,
  // 测试里未全局注册 naive-ui；NFlex 是列表的外层容器，必须透传插槽才能断言其内容
  NFlex: { template: '<div><slot /></div>' },
  NIcon: true,
  NTooltip: true,
  NSpin: true
}

/** 10 局最小对局桩：RecordCard 被 stub，collectAssetIds 遇到空 participants 会跳过 */
const tenGames = Array.from({ length: 10 }, (_, i) => ({ gameId: i + 1, participants: [] }))

describe('MatchHistory', () => {
  beforeEach(() => {
    queryPages.clear()
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === 'query_hex_history' ? { games: { games: tenGames }, begIndex: 0, endIndex: 9 } : []
    )
  })

  it('mounts without a loading-bar provider', async () => {
    const wrapper = mount(MatchHistory, { global: { stubs } })
    await flushPromises()
    expect(wrapper.findAll('.list-item')).toHaveLength(10)
    wrapper.unmount()
  })

  it('shows skeletons before the first page arrives', () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === 'query_hex_history' ? new Promise(() => {}) : []
    )
    const wrapper = mount(MatchHistory, { global: { stubs } })
    expect(wrapper.findAllComponents(RecordCardSkeleton)).toHaveLength(10)
    wrapper.unmount()
  })

  it('dims the current list while a follow-up request is in flight', async () => {
    const wrapper = mount(MatchHistory, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.match-history-list--refreshing').exists()).toBe(false)

    // 筛选请求永不返回：旧列表应保留并变淡，而不是闪骨架
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === 'query_hex_history' ? new Promise(() => {}) : []
    )
    // n-select 未全局注册、按名字 stub，只能按名字查；第一个是模式筛选（v-model filterQueueId）
    wrapper.findComponent({ name: 'NSelect' }).vm.$emit('update:value', 2400)
    await flushPromises()

    expect(wrapper.find('.match-history-list--refreshing').exists()).toBe(true)
    expect(wrapper.findAll('.list-item')).toHaveLength(10)
    wrapper.unmount()
  })
  it('shows ten numbered pages and jumps directly to the last ten matches', async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === 'query_hex_history'
        ? {
            games: {
              games: Array.from({ length: 105 }, (_, i) => ({ gameId: i + 1, participants: [] }))
            },
            begIndex: 0,
            endIndex: 104
          }
        : []
    )
    const wrapper = mount(MatchHistory, { global: { stubs } })
    await flushPromises()
    const pagination = wrapper.findComponent({ name: 'NPagination' })
    expect(pagination.attributes('page-count')).toBe('10')
    expect(pagination.attributes('page-slot')).toBe('10')
    pagination.vm.$emit('update:page', 10)
    await flushPromises()
    const cards = wrapper.findAllComponents({ name: 'RecordCard' })
    expect(cards).toHaveLength(10)
    expect(cards[0].props('games').gameId).toBe(91)
    expect(cards[9].props('games').gameId).toBe(100)
    expect(invokeMock.mock.calls.filter(([cmd]) => cmd === 'query_hex_history')).toHaveLength(1)
    expect(invokeMock).toHaveBeenCalledWith(
      'query_hex_history',
      expect.objectContaining({ pageSize: 100, begIndex: 0 })
    )
    wrapper.unmount()
  })

  it('ignores a late filter response after a newer filter has loaded', async () => {
    const wrapper = mount(MatchHistory, { global: { stubs } })
    await flushPromises()
    let resolveOld!: (value: unknown) => void
    invokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd !== 'query_hex_history') return []
      if (args.queue === 2400)
        return new Promise(resolve => {
          resolveOld = resolve
        })
      return { games: { games: [{ gameId: 900, participants: [] }] }, begIndex: 0, endIndex: 0 }
    })
    const filter = wrapper.findComponent({ name: 'NSelect' })
    filter.vm.$emit('update:value', 2400)
    await flushPromises()
    filter.vm.$emit('update:value', 2410)
    await flushPromises()
    resolveOld({ games: { games: tenGames }, begIndex: 0, endIndex: 9 })
    await flushPromises()
    expect(wrapper.findAll('.list-item')).toHaveLength(1)
    expect(wrapper.findComponent({ name: 'RecordCard' }).props('games').gameId).toBe(900)
    wrapper.unmount()
  })
})
