import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest'
import { mount,flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import HexChampionPool from '../HexChampionPool.vue'
const mock=vi.hoisted(()=>({invoke:vi.fn()}))
vi.mock('@tauri-apps/api/core',()=>({invoke:mock.invoke}))
vi.mock('@renderer/services/http',()=>({assetPrefix:'asset://test'}))
vi.mock('@renderer/services/ai/champion-names',()=>({loadChampionNames:async()=>{},getChampionName:(id:number)=>'Hero'+id}))
vi.mock('@renderer/services/hexaram',()=>({personal:ref({games:[]}),hexModes:[],selectHexGames:()=>[],championStats:()=>[
 {id:222,games:18,wins:12,losses:6,winRate:2/3,kda:3},
 {id:145,games:28,wins:9,losses:19,winRate:9/28,kda:3},
 {id:19,games:2,wins:2,losses:0,winRate:1,kda:4},
 {id:999,games:100,wins:99,losses:1,winRate:.99,kda:9}
]}))
const options={global:{stubs:{NCard:{template:'<div><slot name="header-extra"/><slot/></div>'},NSelect:true}}}
let wrapper:ReturnType<typeof mount>|undefined
beforeEach(()=>{vi.useFakeTimers();mock.invoke.mockResolvedValue({phase:'ChampSelect',queue:2400,current:222,bench:[19,145],allies:[86]})})
afterEach(()=>{wrapper?.unmount();vi.useRealTimers()})
describe('Mayhem bench recommendations',()=>{
 it('restricts recommendations to current and bench heroes, not a high-win unavailable hero',async()=>{
  wrapper=mount(HexChampionPool,options);await flushPromises()
  expect(wrapper.findAll('.pool-available span')).toHaveLength(3)
  expect(wrapper.find('.pool-groups').text()).not.toContain('Hero999')
  expect(wrapper.find('.pool-groups').text()).not.toContain('Hero86')
  expect(wrapper.text()).toContain('需要对方同意交换')
  expect(wrapper.findAll('section')[1].text()).not.toContain('Hero19')
  expect(wrapper.findAll('section')[2].text()).toContain('Hero145')
 })
 it('removes stale bench heroes on the next refresh',async()=>{
  wrapper=mount(HexChampionPool,options);await flushPromises()
  mock.invoke.mockResolvedValue({phase:'ChampSelect',queue:2400,current:222,bench:[19],allies:[]})
  await vi.advanceTimersByTimeAsync(5000);await flushPromises()
  expect(wrapper.find('.pool-groups').text()).not.toContain('Hero145')
  expect(wrapper.findAll('.pool-available span')).toHaveLength(2)
 })
 it('does not label historical recommendations as an available bench after leaving champ select',async()=>{
  wrapper=mount(HexChampionPool,options);await flushPromises()
  mock.invoke.mockResolvedValue({phase:'InProgress',queue:2400,current:0,bench:[],allies:[]})
  await vi.advanceTimersByTimeAsync(5000);await flushPromises()
  expect(wrapper.find('.pool-available').exists()).toBe(false)
  expect(wrapper.text()).toContain('现在展示所选模式个人历史')
 })
})
