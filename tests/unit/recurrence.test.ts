import { describe, it, expect } from 'vitest'
import { addDaysToDayKey, formatDueLabel, isRepeatDue } from '../../src/shared/recurrence'
import type { Task } from '../../src/shared/types'

const t = (patch: Partial<Task>): Task => ({
  id: '1', text: 'x', list: 'repeat', createdAt: '2026-11-26T01:00:00.000Z',
  doneAt: null, reminderAt: null, notifiedAt: null,
  repeatDays: 15, dueOn: '2026-11-26', ...patch
})

describe('addDaysToDayKey', () => {
  it('跨月、跨年、闰年', () => {
    expect(addDaysToDayKey('2026-11-26', 15)).toBe('2026-12-11')
    expect(addDaysToDayKey('2026-12-25', 10)).toBe('2027-01-04')
    expect(addDaysToDayKey('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('isRepeatDue', () => {
  it('当天与逾期为 true，未到期与普通任务为 false', () => {
    expect(isRepeatDue(t({ dueOn: '2026-11-26' }), '2026-11-26')).toBe(true)
    expect(isRepeatDue(t({ dueOn: '2026-11-20' }), '2026-11-26')).toBe(true)
    expect(isRepeatDue(t({ dueOn: '2026-12-01' }), '2026-11-26')).toBe(false)
    expect(isRepeatDue(t({ repeatDays: null, dueOn: null }), '2026-11-26')).toBe(false)
  })
})

describe('formatDueLabel', () => {
  it('去掉前导零', () => {
    expect(formatDueLabel('2026-12-03')).toBe('12/3')
    expect(formatDueLabel('2026-12-25')).toBe('12/25')
  })
  it('无效日期返回占位符而不是 NaN/NaN', () => {
    expect(formatDueLabel('')).toBe('—')
    expect(formatDueLabel('2026-xx-yy')).toBe('—')
  })
})
