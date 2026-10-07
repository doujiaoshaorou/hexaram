import type { ParticipantStats } from '@renderer/types/domain/match'
const totalCs = (s: ParticipantStats) => s.totalMinionsKilled + s.neutralMinionsKilled
/** 评分上下文：所属队伍总击杀（参团率分母）+ 全场各维度最大值（归一化分母） */
export interface ScoreContext {
  teamKills: number
  max: { damage: number; taken: number; gold: number; cs: number; turret: number }
}

/**
 * WeGame 式综合评分（0~10）：KDA、输出、参团率、承伤、经济、补刀、推塔 七维加权。
 *
 * 各维归一到 0..1（KDA 用饱和函数 kda/(kda+3)，其余除以全场最大值），加权和乘 10。
 * 权重：KDA 26% / 输出 22% / 参团 18% / 承伤 10% / 经济 10% / 补刀 8% / 推塔 6%。
 *
 * ⚠️ 与后端 `match_history.rs::wegame_score` 同式——两端必须同步修改。
 */
export function computeMatchScore(s: ParticipantStats, ctx: ScoreContext): number {
  const kda = (s.kills + s.assists) / Math.max(1, s.deaths)
  const nKda = kda / (kda + 3)
  const kp = ctx.teamKills > 0 ? Math.min(1, (s.kills + s.assists) / ctx.teamKills) : 0
  const norm = (v: number, m: number) => (m > 0 ? v / m : 0)
  return (
    10 *
    (0.26 * nKda +
      0.22 * norm(s.totalDamageDealtToChampions, ctx.max.damage) +
      0.18 * kp +
      0.1 * norm(s.totalDamageTaken, ctx.max.taken) +
      0.1 * norm(s.goldEarned, ctx.max.gold) +
      0.08 * norm(totalCs(s), ctx.max.cs) +
      0.06 * norm(s.damageDealtToTurrets, ctx.max.turret))
  )
}
