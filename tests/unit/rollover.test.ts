import { describe, it, expect } from 'vitest';
import { applyRollover, localDayKey } from '../../src/shared/rollover';
import type { Task } from '../../src/shared/types';

const t = (patch: Partial<Task>): Task => ({
  id: '1', text: 'x', list: 'today', createdAt: '2026-11-17T01:00:00.000Z',
  doneAt: null, reminderAt: null, notifiedAt: null, repeatDays: null, dueOn: null, ...patch
});
const now = new Date(2026, 10, 18, 8, 0); // 2026-11-18 08:00 本地

describe('applyRollover', () => {
  it('同一天不做任何改动', () => {
    const tasks = [t({ doneAt: '2026-11-18T02:00:00.000Z' })];
    const r = applyRollover(tasks, now, localDayKey(now));
    expect(r.rolled).toBe(false);
    expect(r.tasks).toBe(tasks);
  });
  it('跨天：删除已完成，未完成（含昨天没做完的）留在今天，以后列表原样保留', () => {
    const tasks = [
      t({ id: 'done', doneAt: '2026-11-17T02:00:00.000Z' }),
      t({ id: 'open', text: '没做完' }),
      t({ id: 'later', list: 'later', text: '以后再做' })
    ];
    const r = applyRollover(tasks, now, '2026-11-17');
    expect(r.rolled).toBe(true);
    expect(r.day).toBe('2026-11-18');
    expect(r.tasks.map(x => x.id)).toEqual(['open', 'later']);
    expect(r.tasks[0].list).toBe('today');
  });
  it('时钟回拨到前一天时保留任务与通知状态', () => {
    const task = t({ reminderAt: new Date(2026, 10, 18, 20, 0).toISOString(), notifiedAt: '2026-11-17T23:00:00.000Z' });
    const r = applyRollover([task], new Date(2026, 10, 17, 9, 0), '2026-11-18');
    expect(r.rolled).toBe(false);
    expect(r.tasks[0].reminderAt).not.toBeNull();
    expect(r.tasks[0].notifiedAt).not.toBeNull();
  });
  it('跨天：循环任务原样保留，逾期 dueOn 不顺延', () => {
    const repeat = t({ id: 'r', list: 'repeat', repeatDays: 15, dueOn: '2026-11-10' })
    const r = applyRollover([repeat], now, '2026-11-17')
    expect(r.tasks).toHaveLength(1)
    expect(r.tasks[0].list).toBe('repeat')
    expect(r.tasks[0].dueOn).toBe('2026-11-10')
    expect(r.tasks[0].repeatDays).toBe(15)
  })
  it('跨天：过期提醒清除，未来提醒保留且 notifiedAt 清空', () => {
    const past = t({ id: 'past', reminderAt: '2026-11-17T23:00:00.000Z', notifiedAt: '2026-11-17T23:00:00.000Z' });
    const future = t({ id: 'future', reminderAt: new Date(2026, 10, 18, 20, 0).toISOString(), notifiedAt: '2026-11-17T23:00:00.000Z' });
    const later = t({ id: 'later', list: 'later', reminderAt: '2026-11-17T23:00:00.000Z' });
    const r = applyRollover([past, future, later], now, '2026-11-17');
    expect(r.tasks.find(x => x.id === 'past')!.reminderAt).toBeNull();
    expect(r.tasks.find(x => x.id === 'past')!.notifiedAt).toBeNull();
    expect(r.tasks.find(x => x.id === 'future')!.reminderAt).not.toBeNull();
    expect(r.tasks.find(x => x.id === 'later')!.reminderAt).toBeNull();
  });
});
