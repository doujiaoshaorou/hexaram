import { describe, it, expect } from 'vitest'
import { getModePromptAddon } from '../dispatcher'
import { classifyMode } from '../../shared/modeContext'

describe('getModePromptAddon', () => {
  it('returns ranked addon for queueId 420', () => {
    const ctx = classifyMode(420, 'CLASSIC')
    const addon = getModePromptAddon(ctx)
    expect(typeof addon.rules).toBe('string')
    expect(addon.kind).toBe('ranked')
  })

  it('returns aram addon for queueId 450', () => {
    const ctx = classifyMode(450, 'ARAM')
    const addon = getModePromptAddon(ctx)
    expect(addon.kind).toBe('aram')
  })

  it('returns augment addon for CHERRY', () => {
    const ctx = classifyMode(1700, 'CHERRY')
    const addon = getModePromptAddon(ctx)
    expect(addon.kind).toBe('augment')
  })

  it('returns augment addon for queueId 2400 (hexflash)', () => {
    const ctx = classifyMode(2400, 'ARAM')
    const addon = getModePromptAddon(ctx)
    expect(addon.kind).toBe('augment')
  })

  it('unknown mode falls back to aram', () => {
    const ctx = classifyMode(9999, 'UNKNOWN')
    const addon = getModePromptAddon(ctx)
    expect(addon.kind).toBe('aram')
  })
})

for (const queue of [2400,2410,2450]) {
  it(`Mayhem ${queue} preserves builds and prohibits invented Arena/position facts`,()=>{
    const ctx=classifyMode(queue,'ARAM')
    expect(ctx.hasItemBuild).toBe(true)
    expect(ctx.hasLanes).toBe(false)
    expect(ctx.isTeamMode).toBe(false)
    expect(ctx.championAssignment).toBe('random-with-bench')
    const {rules}=getModePromptAddon(ctx)
    expect(rules).toContain('双方各五人')
    expect(rules).toContain('不假定必须选满六枚')
    expect(rules).toContain('没有购买时间线')
    expect(rules).not.toContain('hasItemBuild=false')
  })
}
