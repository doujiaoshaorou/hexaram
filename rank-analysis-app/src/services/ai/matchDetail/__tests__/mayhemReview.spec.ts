import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Game } from '@renderer/types/domain/match'
import { buildMatchSnapshot } from '../../shared/snapshot'
import { analyzeMatchDetail } from '../index'
import {
  analyzeMayhemReview,
  buildMayhemMaterial,
  MAYHEM_DIMENSIONS,
  fightWindows,
  reconcileTimelineClaims,
  parseMayhemReview
} from '../mayhemReview'
import { requestAIContentStream } from '../../stream'

vi.mock('../../stream', () => ({ requestAIContent: vi.fn(), requestAIContentStream: vi.fn() }))
vi.mock('@renderer/services/ipc', () => ({ getAssetDetailsByIpc: vi.fn(async () => []) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => null) }))

const game = {
  gameId: 42,
  queueId: 2400,
  gameMode: 'ARAM',
  gameDuration: 1200,
  gameCreationDate: '2026-10-05',
  participantIdentities: [],
  participants: [1, 2].map(id => ({
    participantId: id,
    teamId: 100,
    championId: 22,
    spell1Id: 4,
    spell2Id: 6,
    stats: {
      win: true,
      kills: 5,
      deaths: 3,
      assists: 2,
      totalDamageDealtToChampions: id === 1 ? 2000 : 8000,
      totalDamageTaken: 5000,
      goldEarned: 9000,
      totalHeal: 1000,
      totalMinionsKilled: 10,
      neutralMinionsKilled: 0,
      damageDealtToTurrets: 100,
      playerAugment1: 101,
      item0: 200,
      item1: 0,
      item2: 0,
      item3: 0,
      item4: 0,
      item5: 0
    }
  }))
} as unknown as Game

const response = (id = 1) => ({
  summary: '本场输出集中，搭配效果仍需结合资源说明。',
  plans: [1, 2].map(() => ({
    participantId: id,
    hypothesis: '需要验证持续输出机会是否被压缩',
    mechanism: '强化要求普攻触发而敌方威胁可能限制普攻距离',
    alternative: '也可能是承担了保护任务而减少进攻',
    action: '下局敌方突进已交后再靠前持续攻击',
    tradeoff: '等待会损失先手消耗但减少被集火风险',
    verify: '回看团战中普攻是否因突进威胁而被迫中断',
    evidenceKeys: [`p${id}:stats`],
    eventIds: []
  })),
  sections: Object.keys(MAYHEM_DIMENSIONS).map(key => ({
    key,
    participantIds: [id],
    assessment: '需结合英雄定位解释',
    advice: '资料不足时先核对具体效果',
    assets: []
  }))
})
const callbacks = () => ({ onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requestAIContentStream).mockImplementation(async (input, cb) => {
    cb.onChunk(
      JSON.stringify(
        JSON.parse(input).task === 'review-grounding'
          ? { edits: [] }
          : response(JSON.parse(input).targetParticipantId || 1)
      )
    )
    cb.onDone()
  })
})

describe('海斗六维复盘', () => {
  it('replaces a false first-death claim with observed event order and a conditional review question', () => {
    const snapshot = buildMatchSnapshot(game)
    snapshot.players[0].isMe = true
    snapshot.reviewContext = {
      champions: [],
      timelineAvailable: true,
      events: [
        { id: 1, type: 'CHAMPION_KILL', timestamp: 10000, victimId: 2 },
        { id: 2, type: 'CHAMPION_KILL', timestamp: 16000, victimId: 2 },
        { id: 3, type: 'CHAMPION_KILL', timestamp: 22000, victimId: 1 },
        { id: 4, type: 'BUILDING_KILL', timestamp: 30000, killerId: 2 }
      ]
    }
    const report = response()
    report.plans[0].hypothesis = '关键交换前阵亡导致错失推进'
    const checked = reconcileTimelineClaims(report as any, snapshot)
    expect(checked.summary).toContain('0:22')
    expect(checked.summary).toContain('第3次')
    expect(checked.plans[0].hypothesis).not.toContain('关键交换前阵亡')
    expect(checked.plans[0].hypothesis).toContain('事件核对修正')
    expect(checked.plans[0].eventIds).toEqual([1, 2, 3, 4])
  })
  it('accepts twenty-five valid grounding edits without misclassifying JSON as invalid', async () => {
    vi.mocked(requestAIContentStream).mockImplementation(async (input, cb) => {
      const edits = [
        { path: 'summary', replacement: '结论仍需回看验证' },
        ...Object.keys(MAYHEM_DIMENSIONS).flatMap((_, i) =>
          ['assessment', 'advice'].map(k => ({
            path: `sections.${i}.${k}`,
            replacement: '结合已提供机制进行条件判断'
          }))
        ),
        ...[0, 1].flatMap(i =>
          ['hypothesis', 'mechanism', 'alternative', 'action', 'tradeoff', 'verify'].map(k => ({
            path: `plans.${i}.${k}`,
            replacement: '需要结合录像核对该条件是否成立'
          }))
        )
      ]
      expect(edits).toHaveLength(25)
      cb.onChunk(
        JSON.stringify(JSON.parse(input).task === 'review-grounding' ? { edits } : response())
      )
      cb.onDone()
    })
    const cb = callbacks()
    expect((await analyzeMayhemReview(buildMatchSnapshot(game), game, cb, {})).ok).toBe(true)
    expect(cb.onDone).toHaveBeenCalledOnce()
  })
  it('applies the grounding correction before displaying the report', async () => {
    vi.mocked(requestAIContentStream).mockImplementation(async (input, cb) => {
      cb.onChunk(
        JSON.stringify(
          JSON.parse(input).task === 'review-grounding'
            ? {
                edits: [
                  {
                    path: 'plans.0.mechanism',
                    replacement: '法术穿透只影响自身伤害结算，不降低目标魔抗。'
                  }
                ]
              }
            : response()
        )
      )
      cb.onDone()
    })
    const cb = callbacks()
    const result = await analyzeMayhemReview(buildMatchSnapshot(game), game, cb, {})
    expect(result.ok).toBe(true)
    expect(cb.onChunk.mock.calls[0][0]).toContain('不降低目标魔抗')
    expect(requestAIContentStream).toHaveBeenCalledTimes(2)
  })

  it('does not display a report when grounding tries to alter evidence identifiers', async () => {
    vi.mocked(requestAIContentStream).mockImplementation(async (input, cb) => {
      cb.onChunk(
        JSON.stringify(
          JSON.parse(input).task === 'review-grounding'
            ? { edits: [{ path: 'plans.0.participantId', replacement: '伪造玩家' }] }
            : response()
        )
      )
      cb.onDone()
    })
    const cb = callbacks()
    const result = await analyzeMayhemReview(buildMatchSnapshot(game), game, cb, {})
    expect(result.ok).toBe(false)
    expect(cb.onChunk).not.toHaveBeenCalled()
    expect(cb.onDone).not.toHaveBeenCalled()
    expect(requestAIContentStream).toHaveBeenCalledTimes(2)
  })
  it('clusters actual kill events and requires a concrete timeline reference when available', () => {
    const snapshot = buildMatchSnapshot(game)
    snapshot.reviewContext = {
      champions: [],
      timelineAvailable: true,
      events: [
        { id: 1, type: 'CHAMPION_KILL', timestamp: 10000, victimId: 1 },
        { id: 2, type: 'CHAMPION_KILL', timestamp: 18000, victimId: 2 },
        { id: 3, type: 'CHAMPION_KILL', timestamp: 22000, victimId: 1 },
        { id: 4, type: 'BUILDING_KILL', timestamp: 30000 }
      ]
    }
    expect(fightWindows(snapshot)[0]).toMatchObject({
      start: 10000,
      end: 22000,
      eventIds: [1, 2, 3]
    })
    expect(fightWindows(snapshot)[0].buildingEvents).toHaveLength(1)
    expect(() => parseMayhemReview(JSON.stringify(response()), snapshot)).toThrow(
      '已有真实交战时间线'
    )
    const report = response() as any
    report.plans[0].eventIds = [1, 2]
    expect(parseMayhemReview(JSON.stringify(report), snapshot).plans).toHaveLength(2)
  })
  it('does not feed ranked roles or recent profiles into the review', () => {
    const snapshot = buildMatchSnapshot(game)
    const material = buildMayhemMaterial(snapshot, game, {})
    expect(JSON.stringify(material)).not.toMatch(/teamPosition|recentProfile|wardScore|isOffRole/)
    expect(material.players[0].damageShare).toBe(20)
    expect(material.players[0].killParticipation).toBe(70)
  })

  it('routes all three Mayhem queues through six dimensions, without old blame headings', async () => {
    for (const queueId of [2400, 2410, 2450]) {
      const cb = callbacks()
      const result = await analyzeMatchDetail({ ...game, queueId }, null, cb)
      expect(result.ok).toBe(true)
      const markdown = cb.onChunk.mock.calls.map(([s]) => s).join('')
      Object.values(MAYHEM_DIMENSIONS).forEach(title => expect(markdown).toContain('## ' + title))
      expect(markdown).not.toMatch(/背锅|被连累|谁尽力/)
      expect(markdown).toContain('2000 / 20%')
      expect(markdown).toContain('资料不足')
    }
  })

  it('rejects an invented augment reference, malformed sections and blame labels', () => {
    const snapshot = buildMatchSnapshot(game)
    const data = response()
    ;(data.sections[3].assets as any[]).push({ kind: 'perk', id: 99999 })
    expect(() => parseMayhemReview(JSON.stringify(data), snapshot)).toThrow('无法核对')
    expect(() =>
      parseMayhemReview(JSON.stringify({ ...response(), sections: [] }), snapshot)
    ).toThrow('不完整')
    expect(() =>
      parseMayhemReview(JSON.stringify({ ...response(), summary: '被连累' }), snapshot)
    ).toThrow('责任标签')
  })

  it('only includes the selected player in the single-player facts and sends fresh requests on reanalysis', async () => {
    const cb = callbacks(),
      snapshot = buildMatchSnapshot(game)
    await analyzeMayhemReview(snapshot, game, cb, { mode: 'player', participantId: 2 })
    await analyzeMayhemReview(snapshot, game, cb, { mode: 'player', participantId: 2 })
    expect(requestAIContentStream).toHaveBeenCalledTimes(4)
    const markdown = cb.onChunk.mock.calls[0][0]
    expect(markdown).toContain('8000 / 80%')
    expect(markdown).not.toContain('2000 / 20%')
  })

  it('shows an API failure without marking a fake fallback report complete', async () => {
    vi.mocked(requestAIContentStream).mockImplementation(async (_, cb) => cb.onError('余额不足'))
    const cb = callbacks()
    const result = await analyzeMayhemReview(buildMatchSnapshot(game), game, cb, {})
    expect(result.ok).toBe(false)
    expect(cb.onError).toHaveBeenCalledWith('余额不足')
    expect(cb.onDone).not.toHaveBeenCalled()
    expect(cb.onChunk).not.toHaveBeenCalled()
    expect(requestAIContentStream).toHaveBeenCalledTimes(1)
  })

  it('rejects invented arithmetic and assets belonging to another player', () => {
    const snapshot = buildMatchSnapshot(game)
    expect(() =>
      parseMayhemReview(JSON.stringify({ ...response(), summary: '胜方输出 99999' }), snapshot)
    ).toThrow('不要重复数值')
    snapshot.assetCatalog = [{ kind: 'perk', id: 101, name: '测试强化', description: '效果说明' }]
    snapshot.players[0].augments = []
    const report = response()
    ;(report.sections[3].assets as any[]).push({ participantId: 1, kind: 'perk', id: 101 })
    expect(() => parseMayhemReview(JSON.stringify(report), snapshot)).toThrow('无法核对')
  })

  it('repairs a malformed response once and renders numbers from the snapshot', async () => {
    vi.mocked(requestAIContentStream).mockImplementationOnce(async (_, cb) => {
      cb.onChunk(JSON.stringify({ ...response(), summary: '伤害 99999' }))
      cb.onDone()
    })
    const cb = callbacks()
    const result = await analyzeMayhemReview(buildMatchSnapshot(game), game, cb, {})
    expect(result.ok).toBe(true)
    expect(requestAIContentStream).toHaveBeenCalledTimes(3)
    expect(cb.onChunk.mock.calls[0][0]).toContain('输出 2000，队内 20%')
    expect(cb.onChunk.mock.calls[0][0]).not.toContain('99999')
  })

  it('rejects unsupported arithmetic comparisons before displaying a report', () => {
    const data = response()
    data.summary = '合计不如对手单人'
    data.sections[0].assessment = '合计不如对手单人'
    expect(() => parseMayhemReview(JSON.stringify(data), buildMatchSnapshot(game))).toThrow(
      '不要重算'
    )
  })

  it('accepts omitted redundant statistical fields and reorders known dimensions', () => {
    const data = response() as any
    for (const s of data.sections.slice(0, 3)) {
      delete s.participantIds
      delete s.assets
    }
    data.sections.reverse()
    const parsed = parseMayhemReview(JSON.stringify(data), buildMatchSnapshot(game))
    expect(parsed.sections.map(s => s.key)).toEqual(Object.keys(MAYHEM_DIMENSIONS))
    expect(parsed.sections[0].participantIds).toEqual([1, 2])
  })
  it('rejects invented events, another player focus and missing actionable plans', () => {
    const data = response() as any
    data.plans[0].eventIds = [999]
    expect(() => parseMayhemReview(JSON.stringify(data), buildMatchSnapshot(game))).toThrow(
      '行动项'
    )
    data.plans[0].eventIds = []
    expect(() =>
      parseMayhemReview(JSON.stringify(data), buildMatchSnapshot(game), {
        mode: 'player',
        participantId: 2
      })
    ).toThrow()
    delete data.plans
    expect(() => parseMayhemReview(JSON.stringify(data), buildMatchSnapshot(game))).toThrow('plans')
  })
})
