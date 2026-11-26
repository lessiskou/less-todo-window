import type { QuickAddParse } from './types'

const COLON_PREFIX = /^(\d{1,2})[:：](\d{2})(?:\s+|$)/
const CN_PREFIX = /^(\d{1,2})\s*点(?:\s*(半|\d{1,2})\s*分?)?(?:\s+|$)/
const REPEAT_PREFIX = /^(?:每\s*(\d{1,3})\s*天|每天)(?:\s+|$)/

export function parseQuickAdd(raw: string, now: Date): QuickAddParse {
  const input = raw.trim()

  const repeatMatch = REPEAT_PREFIX.exec(input)
  if (repeatMatch) {
    const days = repeatMatch[1] === undefined ? 1 : Number(repeatMatch[1])
    if (days >= 1 && days <= 365) {
      return {
        text: input.slice(repeatMatch[0].length).trim(),
        reminderAt: null,
        timeWasPast: false,
        repeatDays: days
      }
    }
  }

  let match = COLON_PREFIX.exec(input)
  let hour = Number.NaN
  let minute = Number.NaN
  let text = ''

  if (match) {
    hour = Number(match[1])
    minute = Number(match[2])
    text = input.slice(match[0].length).trim()
  } else {
    match = CN_PREFIX.exec(input)
    if (match) {
      hour = Number(match[1])
      minute = match[2] === undefined ? 0 : match[2] === '半' ? 30 : Number(match[2])
      text = input.slice(match[0].length).trim()
    }
  }

  const parsed =
    match !== null &&
    text.length > 0 &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59

  if (!parsed) {
    return { text: input, reminderAt: null, timeWasPast: false, repeatDays: null }
  }

  const when = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute)
  if (when.getTime() <= now.getTime()) {
    return { text, reminderAt: null, timeWasPast: true, repeatDays: null }
  }

  return { text, reminderAt: when.toISOString(), timeWasPast: false, repeatDays: null }
}
