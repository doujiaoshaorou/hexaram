import { describe, it, expect } from 'vitest'
import type { Game } from '@renderer/types/domain/match'
import { estimateWyRating, summarizeRating } from './wyRating'
import { auditHistory } from './historyAudit'
function game(i: number, win: boolean, fixed = false): Game {
  const ps = Array.from({ length: 10 }, (_, n) => ({
    participantId: n + 1,
    teamId: n < 5 ? 100 : 200,
    championId: 22,
    stats: {
      win: n < 5 ? win : !win,
      kills: 5,
      deaths: 5,
      assists: 10,
      totalDamageDealtToChampions: 10000,
      totalDamageTaken: 12000,
      damageDealtToTurrets: 1000,
      goldEarned: 10000,
      totalMinionsKilled: 30,
      neutralMinionsKilled: 0,
      timeCCingOthers: 30,
      totalHealsOnTeammates: 2000,
      totalDamageShieldedOnTeammates: 2000
    }
  }))
  const ids = ps.map((_, n) => ({
    player: { puuid: n === 0 ? 'me' : fixed && n < 5 ? `team${n}` : `p${i}:${n}` }
  }))
  return {
    gameId: i,
    queueId: 2400,
    platformId: 'NJ100',
    gameCreationDate: new Date(1762000000000 + i * 100000).toISOString(),
    gameDuration: 1200,
    participants: [ps[0]],
    participantIdentities: [ids[0]],
    gameDetail: { participants: ps, participantIdentities: ids, gameVersion: '15.21.1' }
  } as unknown as Game
}
function weak(g: Game) {
  Object.assign(g.participants[0].stats, {
    kills: 0,
    assists: 1,
    deaths: 20,
    totalDamageDealtToChampions: 100,
    totalDamageTaken: 100,
    totalHealsOnTeammates: 0,
    totalDamageShieldedOnTeammates: 0,
    timeCCingOthers: 0,
    damageDealtToTurrets: 0,
    goldEarned: 5000,
    totalMinionsKilled: 0
  })
  return g
}
describe('WY bounded recent performance rating', () => {
  it('deduplicates, sorts and separates modes', () => {
    const gs = Array.from({ length: 40 }, (_, i) => game(i, i % 2 === 0))
    expect(estimateWyRating(gs).score).toBe(estimateWyRating([...gs].reverse()).score)
    expect(estimateWyRating([...gs, ...gs]).games).toBe(40)
    expect(estimateWyRating(gs, 2410).ready).toBe(false)
  })
  it('same win rate does not give same points: contribution and MVP/SVP count', () => {
    const good = estimateWyRating([game(1, true), game(2, false)]),
      bad = estimateWyRating([weak(game(1, true)), weak(game(2, false))])
    expect(good.score).toBeGreaterThan(bad.score)
    expect(good.ledger[0].badge).toBe('SVP')
    expect(good.ledger[1].badge).toBe('MVP')
    expect(good.ledger[1].delta).toBeGreaterThan(good.ledger[0].delta)
    expect(bad.ledger[0].delta).toBeLessThan(0)
  })
  it('sample size cannot inflate score beyond the latest 200 games', () => {
    const many = Array.from({ length: 1500 }, (_, i) => weak(game(i, i % 20 < 9)))
    expect(estimateWyRating(many).score).toBe(estimateWyRating(many.slice(-200)).score)
    const carry = Array.from({ length: 100 }, (_, i) => {
      const g = game(i, i % 10 < 7)
      Object.assign(g.participants[0].stats, {
        kills: 20,
        assists: 25,
        deaths: 3,
        totalDamageDealtToChampions: 60000,
        goldEarned: 20000
      })
      return g
    })
    expect(estimateWyRating(carry).score).toBeGreaterThan(estimateWyRating(many).score)
    expect(estimateWyRating(many).games).toBe(200)
  })
  it('win rate dominates, contribution distinguishes equal win rate and neutral priors shrink small samples', () => {
    const rows = (n: number, wr: number, performance: number) =>
      Array.from({ length: n }, (_, i) => ({
        win: i / n < wr,
        performance,
        badge: '',
        penalty: 0,
        weight: 1
      }))
    expect(summarizeRating(rows(100, 0.65, 0)).score).toBeGreaterThan(
      summarizeRating(rows(100, 0.45, 1)).score
    )
    expect(summarizeRating(rows(100, 0.5, 1)).score).toBeGreaterThan(
      summarizeRating(rows(100, 0.5, -1)).score
    )
    expect(summarizeRating(rows(1, 1, 1)).score).toBeLessThan(
      summarizeRating(rows(100, 1, 1)).score
    )
    expect(summarizeRating([]).score).toBe(1000)
  })
  it('repeated teammates reduce evidence strength symmetrically', () => {
    const fresh = Array.from({ length: 100 }, (_, i) => game(i, true)),
      fixed = Array.from({ length: 100 }, (_, i) => game(i, true, true))
    expect(estimateWyRating(fixed).effective).toBeLessThan(estimateWyRating(fresh).effective)
    expect(estimateWyRating(fixed).score).toBeLessThan(estimateWyRating(fresh).score)
  })
  it('protects support contribution and refuses heavy deductions with missing support data', () => {
    const a = weak(game(1, false))
    a.participants[0].stats.totalHealsOnTeammates = 20000
    expect(estimateWyRating([a]).ledger[0].penalty).toBe(0)
    const b = weak(game(2, false))
    delete b.participants[0].stats.timeCCingOthers
    expect(estimateWyRating([b]).ledger[0].penalty).toBe(0)
  })
  it('excludes remakes and incomplete stats but not a short normal match by duration alone', () => {
    const a = game(1, true),
      b = game(2, true),
      c = game(3, true)
    a.gameDetail.participants[4].stats.gameEndedInEarlySurrender = true
    b.gameDuration = 180
    c.gameDetail.participantIdentities[1].player.puuid = ''
    expect(estimateWyRating([a, b, c])).toMatchObject({ games: 1, excluded: 1, ready: true })
  })
  it('reconciles normal variants and retains raw totals', () => {
    const a = game(1, true),
      b = game(2, false),
      c = game(3, true)
    b.participants[0].stats.gameEndedInEarlySurrender = true
    c.gameDetail.gameVersion = '16.9.1'
    const rows = auditHistory([a, b, c, a])
    expect(rows[0]).toMatchObject({ total: 2, early: 1, completed: 1, ordinary: 1 })
    expect(rows[1].season).toBe('S16 第二赛段')
  })
})
