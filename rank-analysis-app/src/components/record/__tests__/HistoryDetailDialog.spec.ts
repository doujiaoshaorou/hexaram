import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, shallowRef } from 'vue'

vi.mock('../detailWindow', () => ({
  inlineDetailGame: shallowRef(null),
  closeInlineDetail: vi.fn(),
  openMatchDetailWindow: vi.fn()
}))
vi.mock('../MatchDetailModal.vue', () => ({
  default: defineComponent({
    props: ['game'],
    template: '<div class="detail">{{ game.gameId }}</div>'
  })
}))
import HistoryDetailDialog from '../HistoryDetailDialog.vue'
import { inlineDetailGame, closeInlineDetail, openMatchDetailWindow } from '../detailWindow'
import type { Game } from '../match'

const Modal = defineComponent({
  props: ['show'],
  emits: ['update:show'],
  template:
    '<div v-if="show"><button class="close" @click="$emit(\'update:show\', false)">关闭</button><slot name="header-extra"/><slot/></div>'
})
const mountDialog = () =>
  mount(HistoryDetailDialog, {
    global: {
      stubs: {
        NModal: Modal,
        Modal,
        Button: { template: '<button class="pop-out"><slot/></button>' },
        Alert: { template: '<div class="warning"><slot/></div>' }
      }
    }
  })

describe('history detail dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inlineDetailGame.value = { gameId: 1 } as Game
  })
  it('renders cached data, switches games and supports the close button', async () => {
    const wrapper = mountDialog()
    expect(wrapper.find('.detail').text()).toBe('1')
    inlineDetailGame.value = { gameId: 2 } as Game
    await flushPromises()
    expect(wrapper.find('.detail').text()).toBe('2')
    await wrapper.find('.close').trigger('click')
    expect(closeInlineDetail).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
  it('keeps history visible and reports a failed independent window', async () => {
    vi.mocked(openMatchDetailWindow).mockRejectedValueOnce(new Error('独立详情窗口创建失败'))
    const wrapper = mountDialog()
    await wrapper.find('.pop-out').trigger('click')
    await flushPromises()
    expect(wrapper.find('.warning').text()).toBe('独立详情窗口创建失败')
    expect(wrapper.find('.detail').text()).toBe('1')
    expect(closeInlineDetail).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
