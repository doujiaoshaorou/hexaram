import { it, expect } from 'vitest'
import { rememberQuery, clearQuery, lastQuery, queryPages, queryTotals } from './queryState'
it('关闭查询后清空恢复状态和查询缓存，下一次进入不会恢复旧对象', () => {
  rememberQuery({ name: 'test#123', region: 'NJ100' })
  queryPages.set('test', {})
  queryTotals.set('test', { games: [], next: 100, exhausted: false })
  clearQuery()
  expect(lastQuery).toEqual({})
  expect(JSON.parse(sessionStorage.getItem('hexaram.lastQuery')!)).toEqual({})
  expect(queryPages.size).toBe(0)
  expect(queryTotals.size).toBe(0)
})
