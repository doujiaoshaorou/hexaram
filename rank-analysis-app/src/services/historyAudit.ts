import type { Game } from '@renderer/types/domain/match'

/** Use the actual played patch, not guessed local calendar boundaries or seasonId=0. */
export function seasonOf(game: Game): string {
  const version = game.gameDetail?.gameVersion || ''
  const [major, minor] = version.split('.').map(Number)
  if (major === 15 && minor >= 17 && minor <= 24) return 'S15 第三赛段'
  if (major === 16 && minor >= 1 && minor <= 8) return 'S16 第一赛段'
  if (major === 16 && minor >= 9 && minor <= 14) return 'S16 第二赛段'
  if (major === 16 && minor >= 15 && minor <= 24) return 'S16 第三赛段'
  return '其他／版本未知'
}

export function isEarlyEnd(game: Game): boolean {
  return [...(game.participants || []), ...(game.gameDetail?.participants || [])].some(
    p => p.stats.gameEndedInEarlySurrender === true
  )
}

export function auditHistory(games: Game[]) {
  const unique = [...new Map(games.map(g => [`${g.platformId}:${g.gameId}`, g])).values()]
  const groups = new Map<string, Game[]>()
  for (const g of unique) {
    const key = seasonOf(g)
    groups.set(key, [...(groups.get(key) || []), g])
  }
  return [...groups]
    .map(([season, rows]) => ({
      season,
      total: rows.length,
      early: rows.filter(isEarlyEnd).length,
      completed: rows.filter(g => !isEarlyEnd(g)).length,
      ordinary: rows.filter(g => !isEarlyEnd(g) && g.queueId === 2400).length,
      peak: rows.filter(g => !isEarlyEnd(g) && g.queueId === 2410).length,
      classic: rows.filter(g => !isEarlyEnd(g) && g.queueId === 2450).length,
      games: rows
    }))
    .sort((a, b) => {
      const order = [
        'S15 第三赛段',
        'S16 第一赛段',
        'S16 第二赛段',
        'S16 第三赛段',
        '其他／版本未知'
      ]
      return order.indexOf(a.season) - order.indexOf(b.season)
    })
}
