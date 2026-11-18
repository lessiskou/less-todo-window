import { describe, it, expect } from 'vitest';
import { collectDueTasks, nextReminderTime } from '../../src/shared/reminders';
import type { Task } from '../../src/shared/types';

const base: Omit<Task, 'id'> = { text: 'x', list: 'today', createdAt: '2026-11-18T00:00:00.000Z', doneAt: null, reminderAt: null, notifiedAt: null };
const now = new Date(2026, 10, 18, 10, 0);
const iso = (h: number, m = 0) => new Date(2026, 10, 18, h, m).toISOString();

describe('reminders', () => {
  it('只收集今天、未完成、到点且未通知过的任务', () => {
    const due = { ...base, id: 'due', reminderAt: iso(9) };
    const notYet = { ...base, id: 'notYet', reminderAt: iso(11) };
    const already = { ...base, id: 'already', reminderAt: iso(9), notifiedAt: iso(9) };
    const done = { ...base, id: 'done', reminderAt: iso(9), doneAt: iso(9, 30) };
    const later = { ...base, id: 'later', list: 'later' as const, reminderAt: iso(9) };
    expect(collectDueTasks([due, notYet, already, done, later], now).map(t => t.id)).toEqual(['due']);
  });
  it('重启后：notifiedAt 已设置的任务不会再到期', () => {
    const t = { ...base, id: 'fired', reminderAt: iso(9), notifiedAt: iso(9) };
    expect(collectDueTasks([t], now)).toEqual([]);
    expect(nextReminderTime([t], now)).toBeNull();
  });
  it('跨午夜的过期提醒不补发', () => {
    const monday = { ...base, id: 'monday', reminderAt: new Date(2026, 10, 17, 23, 50).toISOString() };
    const tuesdayMorning = new Date(2026, 10, 18, 8, 0);
    expect(collectDueTasks([monday], tuesdayMorning)).toEqual([]);
    expect(nextReminderTime([monday], tuesdayMorning)).toBeNull();
  });
  it('返回最早的未来提醒时间', () => {
    const a = { ...base, id: 'a', reminderAt: iso(12) };
    const b = { ...base, id: 'b', reminderAt: iso(11) };
    expect(nextReminderTime([a, b], now)).toBe(new Date(2026, 10, 18, 11).getTime());
  });
});
