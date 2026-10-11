import { describe, it, expect, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { NSelect, NInputNumber } from 'naive-ui'
vi.mock('../../components/composition', () => ({renderSingleSelectTag:vi.fn(),renderLabel:vi.fn(),filterChampionFunc:vi.fn()}))
import Editor from './TagConditionNode.vue'
import presets from '../../../src-tauri/src/command/mayhem_tags.json'

function mount(modelValue:any) {return shallowMount(Editor,{props:{modelValue,isRoot:true,modeOptions:[],championOptions:[]}})}
function visit(node:any,fn:(n:any)=>void) {fn(node); for(const n of node.conditions||[]) visit(n,fn);if(node.condition)visit(node.condition,fn)}

describe('可复现的标签编辑器',()=>{
  it('每个内置条件都有可编辑控件，200场窗口不会被50场上限截断',()=>{
    for(const preset of presets) visit(preset.condition,node=>{
      const wrapper=mount(JSON.parse(JSON.stringify(node)))
      expect(wrapper.text()).not.toContain('Unknown Type')
      if(node.type==='history') {
        const fields=wrapper.findAllComponents(NInputNumber)
        if(node.filters.some((f:any)=>f.type==='recent'&&f.count===200)) expect(fields.some(f=>f.props('value')===200 && f.props('max')===200)).toBe(true)
        const selects=wrapper.findAllComponents(NSelect)
        const checks=selects.find(s=>(s.props('options') as any[])?.some(o=>o.value==='qualifiedRatio'))!
        expect((checks.props('options') as any[]).some(o=>o.value===node.refresh.type)).toBe(true)
      }
      wrapper.unmount()
    })
  })
  it('用户可从历史节点创建任一条件或分模式分组',()=>{
    const wrapper=mount({type:'history',filters:[],refresh:{type:'count',op:'>=',value:1}})
    wrapper.findAllComponents(NSelect)[0].vm.$emit('update:value','perMode')
    const emitted=wrapper.emitted('update:modelValue')!.at(-1)![0] as any
    expect(emitted.type).toBe('perMode')
    expect(emitted.condition.refresh.minGames).toBe(20)
  })
  it('切换到全能高手条件时初始化所有可调整参数并移除旧字段',()=>{
    const model={type:'history',filters:[{type:'recent',count:200}],refresh:{type:'streak',kind:'win',min:3} as any}
    const wrapper=mount(model)
    const check=wrapper.findAllComponents(NSelect).find(s=>(s.props('options') as any[])?.some(o=>o.value==='championDistribution'))!
    check.vm.$emit('update:value','championDistribution')
    expect(model.refresh).toEqual({type:'championDistribution',minGames:100,maxShare:0.35,minShare:0.1,minTypes:4,minChampions:3,winRateOp:'>',winRate:0.52})
  })
})
