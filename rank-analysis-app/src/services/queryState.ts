import type { LocationQuery } from 'vue-router'
export let lastQuery: LocationQuery = {}
try {
  lastQuery = JSON.parse(sessionStorage.getItem('hexaram.lastQuery') || '{}')
} catch {
  /* fresh session */
}
export function rememberQuery(query: LocationQuery) {
  lastQuery = { ...query }
  try {
    sessionStorage.setItem('hexaram.lastQuery', JSON.stringify(lastQuery))
  } catch {
    /* storage unavailable */
  }
}
export const queryTotals = new Map<
  string,
  { games: import('@renderer/components/record/match').Game[]; next: number; exhausted: boolean }
>()
export const queryPages = new Map<string, any>()

export function clearQuery() {
  rememberQuery({})
  queryTotals.clear()
  queryPages.clear()
}
