import { describe, it, expect, vi } from 'vitest'
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@renderer/composables/useGameState', () => ({ useGameState: vi.fn() }))
import { augmentStats, championStats, selectHexGames, summary } from './hexaram'
import { queueIdToOpggMode } from './opgg'
import type { Game } from '@renderer/types/domain/match'
function game(
  id: number,
  champion: number,
  win: boolean,
  augments: number[] = [],
  queue = 2400
): Game {
  return {
    gameId: id,
    platformId: 'NJ100',
    queueId: queue,
    gameCreationDate: new Date(1760000000000 + id * 1000).toISOString(),
    participants: [
      {
        championId: champion,
        stats: {
          win,
          kills: 4,
          deaths: 2,
          assists: 8,
          ...Object.fromEntries(augments.map((id, i) => ['playerAugment' + (i + 1), id]))
        }
      }
    ]
  } as Game
}
describe('Hexaram personal statistics', () => {
  it('excludes remakes before recent slicing and all aggregate metrics while retaining opt-in originals', () => {
    const normal = game(1, 1, false, [10]),
      remake = game(2, 2, true, [20])
    remake.participants[0].stats.gameEndedInEarlySurrender = true
    expect(selectHexGames([normal, remake], 0, 0, 0, 1).map(g => g.gameId)).toEqual([1])
    expect(selectHexGames([normal, remake], 0, 0, 0, 0, true)).toHaveLength(2)
    expect(summary([normal, remake])).toMatchObject({ games: 1, wins: 0, losses: 1, kda: 6 })
    expect(championStats([normal, remake]).map(h => h.id)).toEqual([1])
    expect(augmentStats([normal, remake]).map(a => a.id)).toEqual([10])
  })
  it('deduplicates games and filters modes before recent N', () => {
    const data = [game(1, 1, true), game(2, 1, false), game(3, 1, true, [], 420), game(2, 1, false)]
    expect(selectHexGames(data, 0, 0, 0, 2).map(g => g.gameId)).toEqual([2, 1])
    expect(summary(selectHexGames(data)).winRate).toBe(0.5)
  })
  it('has no 1000 game cap and excludes other ARAM', () => {
    const data = Array.from({ length: 1537 }, (_, i) => game(i + 1, 1, true))
    data.push(game(2000, 1, false, [], 450))
    expect(summary(selectHexGames(data)).games).toBe(1537)
  })
  it('counts repeated augment slots once per match and groups actual champions', () => {
    const rows = augmentStats([game(1, 1, true, [10, 10, 0]), game(2, 2, false, [10, 20])])
    const a = rows.find(a => a.id === 10)!
    expect(a.games).toBe(2)
    expect(a.winRate).toBe(0.5)
    expect(a.heroes.map(h => h.id)).toEqual([1, 2])
    expect(rows.some(a => a.id === 0)).toBe(false)
  })
  it('compares against the same champion mix, not unrelated heroes', () => {
    const gs = [game(1, 1, true, [10]), game(2, 1, false), game(3, 2, false), game(4, 2, false)]
    expect(augmentStats(gs)[0].delta).toBe(0.5)
    expect(championStats(gs).find(h => h.id === 1)?.winRate).toBe(0.5)
  })
  it('does not count missing outcomes as losses', () => {
    const g = game(1, 1, true, [10])
    delete (g.participants[0].stats as Partial<(typeof g.participants)[0]['stats']>).win
    expect(summary([g]).games).toBe(0)
    expect(augmentStats([g])[0].winRate).toBeNull()
  })
  it('keeps variants distinct and maps to Mayhem rather than ranked', () => {
    expect(
      selectHexGames([game(1, 1, true, [], 2410), game(2, 1, false, [], 2450)], 2410)
    ).toHaveLength(1)
    for (const q of [2400, 2410, 2450]) expect(queueIdToOpggMode(q)).toBe('mayhem')
  })
})
