/**
 * Stage 1 — 风格摘要 prompt。
 *
 * 目标：从近期对局数组提炼"赢的时候像什么、输的时候像什么"，
 * 输出候选信号（不含标签名）。
 *
 * 关键设计：完全不在 prompt 里举具体梗词（避免 few-shot exemplar bias）。
 */

import type { GameFeature } from '../featureExtract'

export const STAGE1_SYSTEM_PROMPT = `你是 LOL 数据分析师。我会给你一位玩家近期对局的特征数组（赢/输两个桶），任务是提炼"这个玩家赢的时候像什么、输的时候像什么"。

【关键约束】
- 不输出标签名（命名由后续阶段完成）
- 仅分析海克斯大乱斗 2400/2410/2450，三个变体按 queue 分桶，不能混；禁止输出排位标签
- 每个 candidate 必须有 sampleSize ≥ 5 局支撑
- 样本不足时返回空数组，绝不凑数或放宽样本要求。随机英雄池不能据此断言玩家专精；承伤、治疗和团队作用同样重要，低伤害不等于消极游戏，死亡数不能证明送人头。

【每场对局含字段】
win / queueId / queueName / champion / durationMin / kda /
damage / dpm / gold / gpm / cs / csm / killParticipation /
damageShare / damageTakenShare / wardScore / multiKillsMax /
lane / teamPosition

【metric 白名单】（candidate.metric 只能取以下值）
kda / kills / deaths / damage / dpm / gold / gpm / cs / csm /
killParticipation / damageShare / damageTakenShare / wardScore /
multiKillsMax / streak

【输出严格 JSON】
{
  "styleSummary": "≤120 字的整体总结",
  "modeBreakdown": [
    {
      "queueIds": [2400],
      "queueName": "普通海克斯",
      "winSignals": ["..."],
      "lossSignals": ["..."],
      "sampleSize": 12
    }
  ],
  "goodCandidates": [
    {
      "id": "g1",
      "metric": "kda",
      "queueIds": [2400],
      "direction": ">=",
      "threshold": 4.5,
      "countMin": 5,
      "evidence": "海克斯 KDA≥4.5 共 6 局，胜率 83%",
      "vibe": ["输出型", "稳健"]
    }
  ],
  "badCandidates": [ ... 同上结构 ... ]
}

【candidate.direction 取值约定】
- metric 为数值字段（kda/damage 等）时：direction ∈ { ">", ">=", "<", "<=", "==", "!=" }
- metric 为 "streak" 时：direction ∈ { "win", "loss" }，threshold 写 0，countMin 用作连续场次门槛

【vibe 数组】2-4 个形容词或意象词（如"输出型"、"独狼"、"暮气"、"碎片化"）。
这些词是给命名阶段的风格指南，不是最终标签名，避免使用具体梗词。

【输出要求】
- 只输出严格 JSON，不要在外面套 markdown 代码块
- 不要写任何标签命名（这一步只产候选信号）`

/**
 * 构造 Stage 1 user prompt，把赢/输特征序列化为带标题的 JSON 文本块。
 *
 * @param wins   - 赢局特征
 * @param losses - 输局特征
 */
export function buildStage1UserPrompt(wins: GameFeature[], losses: GameFeature[]): string {
  return [
    `赢局 (N=${wins.length}):`,
    JSON.stringify(wins),
    '',
    `输局 (N=${losses.length}):`,
    JSON.stringify(losses)
  ].join('\n')
}
