import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import Settings from './AIConnectionSettings.vue'
import { NSelect } from 'naive-ui'
const mocks = vi.hoisted(() => ({ get:vi.fn(), put:vi.fn(), error:vi.fn() }))
vi.mock('@renderer/services/ipc', () => ({ getConfigByIpc:mocks.get, putConfigByIpc:mocks.put }))
vi.mock('naive-ui', async importOriginal => ({ ...await importOriginal<typeof import('naive-ui')>(), useMessage:() => ({error:mocks.error}) }))
function mountSettings() { return mount(Settings) }
beforeEach(() => { vi.resetAllMocks(); mocks.put.mockResolvedValue(undefined) })
it('保留旧版 Key，选择 DeepSeek 后将服务商与 Key 一起保存',async () => {
  mocks.get.mockImplementation((key:string) => Promise.resolve(key==='dashscopeApiKey'?'legacy-test-key':undefined))
  const w=mountSettings(); await flushPromises()
  expect((w.findAll('input')[1].element as HTMLInputElement).value).toBe('legacy-test-key')
  w.getComponent(NSelect).vm.$emit('update:value','deepseek'); await flushPromises()
  await w.find('button').trigger('click'); await flushPromises()
  expect(mocks.put).toHaveBeenCalledWith('aiConnection',{provider:'deepseek',apiKey:'legacy-test-key',model:''})
  expect(w.text()).toContain('已保存，立即生效')
})
it('读取失败时不允许用空配置覆盖已保存设置',async () => {
  mocks.get.mockRejectedValue(new Error('read failed'))
  const w=mountSettings(); await flushPromises()
  expect(w.find('button').attributes('disabled')).toBeDefined()
  expect(mocks.put).not.toHaveBeenCalled()
})
