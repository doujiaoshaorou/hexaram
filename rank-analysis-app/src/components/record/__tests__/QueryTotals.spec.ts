vi.mock('@renderer/composables/useGameState', () => ({ useGameState: vi.fn() }))
import { beforeEach, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import QueryTotals from '../QueryTotals.vue'
import { queryTotals } from '@renderer/services/queryState'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { name: '查询对象#123', region: 'NJ100' } }) }))
vi.mock('@renderer/services/hexaram', async () => {
  const actual = await vi.importActual<typeof import('@renderer/services/hexaram')>('@renderer/services/hexaram')
  return { summary: actual.summary, championStats: actual.championStats }
})
const game = (id: number, win = true) => ({ gameId: id, participants: [{ championId: id % 2 + 1, stats: { win, kills: 4, deaths: 2, assists: 6 } }] })
const page = (games: unknown[], end = 99) => ({ games: { games }, endIndex: end })
function setup(queue = ref(0)) {
 return mount(QueryTotals, { global: { provide: { queryQueue: queue }, stubs: { WyRating: true, NCard: { template: '<section><slot /></section>' }, NButton: { template: '<button><slot /></button>' } } } })
}
beforeEach(() => { vi.mocked(invoke).mockReset(); queryTotals.clear() })
it('isolates the queried player and accumulates unique matches across pages', async () => {
 vi.mocked(invoke).mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, i) => game(i))))
 const wrapper = setup(); await flushPromises()
 expect(invoke).toHaveBeenCalledWith('query_hex_history', expect.objectContaining({ name: '查询对象#123', region: 'NJ100', pageSize: 100 }))
 expect(wrapper.text()).toContain('100')
 vi.mocked(invoke).mockResolvedValueOnce(page([game(99), game(100, false)], 100))
 await wrapper.find('button').trigger('click'); await flushPromises()
 expect(wrapper.text()).toContain('101')
 expect(wrapper.text()).toContain('100 胜 / 1 负')
 expect(wrapper.text()).toContain('仍不代表生涯全部')
 wrapper.unmount()
})
it('a slow old-mode response cannot overwrite the new mode', async () => {
 let resolve!: (v: unknown) => void
 vi.mocked(invoke).mockImplementationOnce(() => new Promise(r => { resolve = r }))
 const queue=ref(0), wrapper=setup(queue)
 vi.mocked(invoke).mockResolvedValueOnce(page([game(7, false)]))
 queue.value=2410; await flushPromises()
 resolve(page([game(8),game(9)])); await flushPromises()
 expect(wrapper.text()).toContain('0 胜 / 1 负')
 wrapper.unmount()
})
it('returns to the cached history without fetching again', async () => {
 vi.mocked(invoke).mockResolvedValueOnce(page([game(1)]))
 const first=setup(); await flushPromises(); first.unmount()
 const second=setup(); await flushPromises()
 expect(invoke).toHaveBeenCalledTimes(1)
 expect(second.text()).toContain('1 胜 / 0 负')
 second.unmount()
})
