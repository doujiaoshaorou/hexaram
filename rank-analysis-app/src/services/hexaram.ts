import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ref, computed, watch } from 'vue'
import type { Game } from '@renderer/types/domain/match'
import { isEarlyEnd } from './historyAudit'
import { useGameState } from '@renderer/composables/useGameState'

export const HEX_QUEUES = [2400, 2410, 2450]
export const isHex = (queue: number) => HEX_QUEUES.includes(queue)
export const hexModes = [
  { label: '普通海克斯', value: 2400 },
  { label: '巅峰赛', value: 2410 },
  { label: '经典版', value: 2450 },
  { label: '全部海克斯', value: 0 }
]
export interface RecoveryProgress {
  processed: number
  total: number
  added: number
  failures: number
}
export interface HexDocument {
  recovery?: RecoveryProgress & {
    logIds: number
    recoveredTotal?: number
    warning?: string
    at: number
  }
  clientSummary?: {
    queueId: number
    wins: number
    losses: number
    gameId: number
    gameCreation: number
    observedAt: number
  } | null
  account: {
    puuid: string
    region: string
    riotId: string
    profileIconId: number
    summonerLevel: number
  }
  games: Game[]
  sync: { coverage: string; boundaryOffset: number; warning?: string; at: number }
}
export const personal = ref<HexDocument | null>(null)
export const personalQueue = ref(0)
export const syncing = ref(false)
export const recovering = ref(false)
export const recoveryProgress = ref<RecoveryProgress | null>(null)
export const syncError = ref('')
let generation = 0
let activeIdentity = ''
let ready = false
export function usePersonalHistory() {
  const { summoner, currentPhase, isConnected } = useGameState()
  async function load(puuid: string, token: number) {
    try {
      const region = isConnected.value
        ? await invoke<string>('get_current_sgp_region')
        : localStorage.getItem('hexaram.lastRegion')
      if (!region) return
      const doc = await invoke<HexDocument | null>('load_hex_history', { puuid, region })
      if (token === generation) personal.value = doc
    } catch (e) {
      if (token === generation) syncError.value = String(e)
    }
  }
  async function sync() {
    if (syncing.value || recovering.value || !summoner.value?.puuid) return
    const expected = summoner.value.puuid,
      token = generation
    syncing.value = true
    syncError.value = ''
    try {
      const doc = await invoke<HexDocument>('sync_hex_history')
      if (token === generation && doc.account.puuid === expected) {
        personal.value = doc
        localStorage.setItem('hexaram.lastPuuid', expected)
        localStorage.setItem('hexaram.lastRegion', doc.account.region)
      }
    } catch (e) {
      if (token === generation) syncError.value = String(e)
    } finally {
      syncing.value = false
      if (token !== generation && summoner.value?.puuid) void sync()
    }
  }
  async function recover() {
    if (syncing.value || recovering.value || !summoner.value?.puuid) return
    const token = generation,
      expected = summoner.value.puuid
    recovering.value = true
    recoveryProgress.value = null
    syncError.value = ''
    let unlisten: (() => void) | undefined
    try {
      unlisten = await listen<RecoveryProgress>('hex-history-recovery-progress', event => {
        if (token === generation) recoveryProgress.value = event.payload
      })
      const doc = await invoke<HexDocument>('recover_hex_history')
      if (token === generation && doc.account.puuid === expected) personal.value = doc
    } catch (e) {
      if (token === generation) syncError.value = String(e)
    } finally {
      unlisten?.()
      recovering.value = false
    }
  }
  // Installed once by the persistent framework, not by each route.
  if (!ready) {
    ready = true
    watch(
      () => [summoner.value?.puuid, isConnected.value] as const,
      async ([id, connected]) => {
        const identity = connected && id ? id : ''
        if (identity === activeIdentity) return
        activeIdentity = identity
        const token = ++generation
        personal.value = null
        const cached = id || localStorage.getItem('hexaram.lastPuuid')
        if (cached) await load(cached, token)
        if (identity && token === generation) void sync()
      },
      { immediate: true }
    )
    watch(currentPhase, (p, old) => {
      if (p === 'EndOfGame' && old !== 'EndOfGame') void sync()
    })
    if (!summoner.value?.puuid) {
      const last = localStorage.getItem('hexaram.lastPuuid')
      if (last) void load(last, generation)
    }
  }
  return { personal, syncing, recovering, recoveryProgress, syncError, sync, recover }
}

export function selectHexGames(
  games: Game[],
  queue = 0,
  champion = 0,
  from = 0,
  recent = 0,
  includeRemakes = false
): Game[] {
  const unique = new Map<string, Game>()
  for (const g of games) {
    if (
      !isHex(g.queueId) ||
      (!includeRemakes && isEarlyEnd(g)) ||
      (queue && g.queueId !== queue) ||
      !g.participants[0] ||
      (champion && g.participants[0].championId !== champion)
    )
      continue
    if (Date.parse(g.gameCreationDate) < from) continue
    unique.set(`${g.platformId}:${g.gameId}`, g)
  }
  const sorted = [...unique.values()].sort(
    (a, b) => Date.parse(b.gameCreationDate) - Date.parse(a.gameCreationDate)
  )
  return recent > 0 ? sorted.slice(0, recent) : sorted
}
export function summary(games: Game[]) {
  const valid = games.filter(
    g => !isEarlyEnd(g) && typeof g.participants[0]?.stats.win === 'boolean'
  )
  const wins = valid.filter(g => g.participants[0].stats.win).length
  const sum = (k: 'kills' | 'deaths' | 'assists') =>
    valid.reduce((n, g) => n + g.participants[0].stats[k], 0)
  return {
    games: valid.length,
    wins,
    losses: valid.length - wins,
    winRate: valid.length ? wins / valid.length : null,
    kda: (sum('kills') + sum('assists')) / Math.max(1, sum('deaths'))
  }
}
export function championStats(games: Game[]) {
  const groups = new Map<number, Game[]>()
  for (const g of games) {
    if (isEarlyEnd(g)) continue
    const id = g.participants[0]?.championId
    if (id) groups.set(id, [...(groups.get(id) || []), g])
  }
  return [...groups].map(([id, gs]) => ({ id, ...summary(gs) })).sort((a, b) => b.games - a.games)
}
export function augmentStats(games: Game[]) {
  const baseline = championStats(games)
  const groups = new Map<number, Game[]>()
  for (const g of games) {
    if (isEarlyEnd(g)) continue
    const s = g.participants[0]?.stats
    if (!s) continue
    const ids = new Set(
      [
        s.playerAugment1,
        s.playerAugment2,
        s.playerAugment3,
        s.playerAugment4,
        s.playerAugment5,
        s.playerAugment6
      ].filter(id => id > 0)
    )
    for (const id of ids) groups.set(id, [...(groups.get(id) || []), g])
  }
  return [...groups]
    .map(([id, gs]) => {
      const stats = summary(gs),
        heroes = championStats(gs).map(h => ({
          ...h,
          baseline: baseline.find(b => b.id === h.id)?.winRate ?? null
        }))
      // Same-champion baseline weighted by the augment's actual champion sample mix.
      const expected =
        heroes.reduce((sum, h) => sum + (h.baseline ?? 0) * h.games, 0) / Math.max(1, stats.games)
      return {
        id,
        ...stats,
        heroes,
        delta: stats.winRate === null ? null : stats.winRate - expected
      }
    })
    .sort((a, b) => b.games - a.games)
}
export const personalGames = computed(() => selectHexGames(personal.value?.games || []))
