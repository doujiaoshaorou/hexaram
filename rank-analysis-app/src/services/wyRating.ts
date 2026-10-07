import type { Game, ParticipantStats } from '@renderer/types/domain/match'
import { isEarlyEnd } from './historyAudit'
import { computeMatchScore } from './matchScore'
export const WY_RATING_VERSION = 'WY 海斗表现分 3.0'
const cap = (n: number) => Math.max(0, Math.min(1, n))
const value = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0)

/** Bounded recent-window estimate. Match volume only affects uncertainty, never accumulates points. */
export function estimateWyRating(input: Game[], queue = 2400) {
  const games = [
    ...new Map(
      input.filter(g => g.queueId === queue).map(g => [`${g.platformId}:${g.gameId}`, g])
    ).values()
  ].sort(
    (a, b) => Date.parse(a.gameCreationDate) - Date.parse(b.gameCreationDate) || a.gameId - b.gameId
  )
  const target = games.find(g => g.participantIdentities[0]?.player.puuid)?.participantIdentities[0]
    .player.puuid
  const trace: {
    gameId: number
    championId: number
    date: string
    score: number
    delta: number
    penalty: number
    weight: number
    win: boolean
    badge: string
    damage: number
    taken: number
    participation: number
    reason: string
    supportKnown: boolean
    performance: number
  }[] = []
  const repeated = new Map<string, number>()
  const window = games.filter(g => !isEarlyEnd(g)).slice(-200)
  let score = 1000
  for (const g of window) {
    const ps = g.gameDetail?.participants,
      ids = g.gameDetail?.participantIdentities
    if (
      isEarlyEnd(g) ||
      !Number.isFinite(Date.parse(g.gameCreationDate)) ||
      !target ||
      g.participantIdentities[0]?.player.puuid !== target ||
      ps?.length !== 10 ||
      ids?.length !== 10
    )
      continue
    const rows = ps.map((p, i) => ({ p, id: ids[i]?.player.puuid || '' }))
    if (new Set(rows.map(r => r.id)).size !== 10 || rows.some(r => !r.id)) continue
    const me = rows.find(r => r.id === target)?.p
    if (!me) continue
    const team = ps.filter(p => p.teamId === me.teamId),
      enemy = ps.filter(p => p.teamId !== me.teamId)
    if (
      team.length !== 5 ||
      enemy.length !== 5 ||
      ps.some(
        p =>
          typeof p.stats.win !== 'boolean' ||
          [
            'kills',
            'deaths',
            'assists',
            'totalDamageDealtToChampions',
            'totalDamageTaken',
            'goldEarned',
            'totalMinionsKilled',
            'neutralMinionsKilled',
            'damageDealtToTurrets'
          ].some(k => !Number.isFinite((p.stats as any)[k]) || (p.stats as any)[k] < 0)
      ) ||
      !team.every(p => p.stats.win === me.stats.win) ||
      !enemy.every(p => p.stats.win !== me.stats.win)
    )
      continue
    const sum = (key: keyof ParticipantStats) => team.reduce((n, p) => n + value(p.stats[key]), 0)
    const share = (key: keyof ParticipantStats) => cap(value(me.stats[key]) / Math.max(1, sum(key)))
    const s = me.stats,
      damage = share('totalDamageDealtToChampions'),
      taken = share('totalDamageTaken'),
      participation = cap((s.kills + s.assists) / Math.max(1, sum('kills')))
    const supportKeys = [
      'timeCCingOthers',
      'totalHealsOnTeammates',
      'totalDamageShieldedOnTeammates'
    ] as const
    const supportKnown = team.every(p =>
      supportKeys.every(k => typeof p.stats[k] === 'number' && Number.isFinite(p.stats[k]))
    )
    const support = Math.max(...supportKeys.map(k => share(k)))
    const deathShare = share('deaths')
    const max = {
      damage: Math.max(...ps.map(p => p.stats.totalDamageDealtToChampions)),
      taken: Math.max(...ps.map(p => p.stats.totalDamageTaken)),
      gold: Math.max(...ps.map(p => p.stats.goldEarned)),
      cs: Math.max(...ps.map(p => p.stats.totalMinionsKilled + p.stats.neutralMinionsKilled)),
      turret: Math.max(...ps.map(p => p.stats.damageDealtToTurrets))
    }
    const ranked = team
      .map(p => ({
        id: p.participantId,
        score: computeMatchScore(p.stats, { teamKills: sum('kills'), max })
      }))
      .sort((a, b) => b.score - a.score || a.id - b.id)
    const badge = ranked[0].id === me.participantId ? (s.win ? 'MVP' : 'SVP') : ''
    // Rank role-aware contribution within the team; ties receive the average rank.
    // Require absolute support volume so a sole tiny heal cannot dominate by share.
    const impact = (p: typeof me) => {
      const st = p.stats
      const frac = (k: keyof ParticipantStats) => cap(value(st[k]) / Math.max(1, sum(k)))
      const mins = Math.max(1, g.gameDuration / 60)
      const supportImpact = Math.max(
        frac('timeCCingOthers') * cap(value(st.timeCCingOthers) / mins / 3),
        frac('totalHealsOnTeammates') * cap(value(st.totalHealsOnTeammates) / mins / 500),
        frac('totalDamageShieldedOnTeammates') *
          cap(value(st.totalDamageShieldedOnTeammates) / mins / 400)
      )
      return computeMatchScore(st, { teamKills: sum('kills'), max }) + 15 * supportImpact
    }
    const ownImpact = impact(me)
    const below = team.filter(p => impact(p) < ownImpact - 1e-6).length
    const tied = team.filter(p => Math.abs(impact(p) - ownImpact) <= 1e-6).length
    const performance = (below + (tied - 1) / 2) / 2 - 1
    // Never infer griefing. Missing support evidence cannot trigger a heavy penalty.
    const low =
      supportKnown &&
      damage < 0.12 &&
      participation < 0.45 &&
      taken < 0.2 &&
      support < 0.2 &&
      share('damageDealtToTurrets') < 0.1 &&
      s.deaths >= 6 &&
      deathShare >= 0.25 &&
      badge === ''
    const penalty = low ? -1 : 0
    const teammates = rows.filter(r => r.p.teamId === me.teamId && r.id !== target)
    const repeats = Math.max(0, ...teammates.map(r => repeated.get(r.id) || 0))
    const weight = Math.max(0.5, 1 / Math.sqrt(1 + repeats / 10))
    // Repeated teammates reduce effective evidence, not a one-sided score bonus.
    const previous = score
    const observations = [...trace, { win: s.win, performance, badge, penalty, weight }]
    score = summarizeRating(observations).score
    const delta = Math.round((score - previous) * 10) / 10
    teammates.forEach(r => repeated.set(r.id, (repeated.get(r.id) || 0) + 1))
    trace.push({
      gameId: g.gameId,
      championId: me.championId,
      date: g.gameCreationDate,
      score,
      delta,
      penalty,
      weight,
      win: s.win,
      badge,
      damage,
      taken,
      participation,
      supportKnown,
      performance,
      reason: low
        ? '低输出、低参团且缺少承伤/控制/治疗/护盾/推塔贡献，同时死亡负担高'
        : supportKnown
          ? '按实际贡献计算'
          : '部分支援数据缺失，不触发低贡献重扣'
    })
  }
  const recent = trace
  const summary = summarizeRating(trace)
  const avg = (k: 'damage' | 'taken' | 'participation') =>
    recent.length ? recent.reduce((n, g) => n + g[k], 0) / recent.length : 0
  return {
    version: WY_RATING_VERSION,
    queue,
    games: trace.length,
    excluded: window.length - trace.length,
    archivedGames: games.length,
    ...summary,
    ready: trace.length > 0,
    trace: trace.slice(-30),
    ledger: trace.slice(-10).reverse(),
    recentGames: recent.length,
    recentWinRate: recent.length ? recent.filter(g => g.win).length / recent.length : 0,
    damage: avg('damage'),
    taken: avg('taken'),
    participation: avg('participation'),
    average: summary.performanceComponent,
    discounted: trace.filter(g => g.weight < 1).length
  }
}

// 20 neutral prior observations shrink small samples toward 1000.
export function summarizeRating(
  rows: { win: boolean; performance: number; badge: string; penalty: number; weight: number }[]
) {
  const effective = rows.reduce((n, r) => n + r.weight, 0),
    denominator = effective + 20
  const winComponent =
    (700 * rows.reduce((n, r) => n + r.weight * (r.win ? 1 : -1), 0)) / denominator
  const performanceComponent =
    (220 * rows.reduce((n, r) => n + r.weight * r.performance, 0)) / denominator
  // RA team-best baseline is 1/5. SVP is worth half an MVP.
  const honorComponent =
    (80 *
      rows.reduce(
        (n, r) => n + r.weight * ((r.badge === 'MVP' ? 1 : r.badge === 'SVP' ? 0.5 : 0) - 0.15),
        0
      )) /
    denominator
  const penaltyComponent =
    (-100 * rows.reduce((n, r) => n + r.weight * (r.penalty < 0 ? 1 : 0), 0)) / denominator
  return {
    score: Math.round(
      1000 + winComponent + performanceComponent + honorComponent + penaltyComponent
    ),
    effective,
    winComponent,
    performanceComponent,
    honorComponent,
    penaltyComponent,
    confidence: rows.length < 20 ? '样本不足' : effective < 80 ? '初步估计' : '样本较充分'
  }
}
