import { invoke } from '@tauri-apps/api/core'
export interface MayhemChampion {
  id: number
  champion_id: number
  name: string
  key: string
  tier: number
  rank: number
}
export interface MayhemAugment {
  id: number
  name: string
  desc: string
  tier: number
  rarity: number
  smallIcon: string
  champions: { id: number; tier: number; performance: number; popular: number }[]
  champion_ids: { id: number; name: string }[]
}
export interface MayhemData {
  champions: MayhemChampion[]
  augments: MayhemAugment[]
  patch: string
  fetchedAt: number
  stale: boolean
  source: string
}
let inflight: Promise<MayhemData> | null = null
let cached: MayhemData | null = null
export async function getMayhem(): Promise<MayhemData> {
  if (cached && !cached.stale && Date.now() / 1000 - cached.fetchedAt < 3600) return cached
  if (!inflight)
    inflight = invoke<MayhemData>('get_mayhem_data')
      .then(v => (cached = v))
      .finally(() => {
        inflight = null
      })
  return inflight
}
export const augmentTier = (tier: number) => ['S', 'A', 'B', 'C', 'D'][tier] ?? '—'
