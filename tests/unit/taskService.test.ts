import { describe, it, expect, beforeEach } from 'vitest';
import { TaskService } from '../../src/main/taskService';
import type { JsonStore } from '../../src/main/store';
import type { Task } from '../../src/shared/types';

const fakeStore = () => {
  let data: { tasks: Task[]; lastRolloverDay: string | null } = { tasks: [], lastRolloverDay: '2026-11-18' };
  let fail = false;
  const s = {
    load: () => data,
    save: (d: typeof data) => { if (fail) throw new Error('disk full'); data = d; },
    loadWarning: () => null
  };
  return { store: s as unknown as JsonStore<typeof data>, get: () => data, failNext: () => { fail = true } };
};

let svc: TaskService; let st: ReturnType<typeof fakeStore>;
const now = new Date(2026, 10, 18, 9, 0);

beforeEach(() => {
  st = fakeStore();
  svc = new TaskService(st.store, () => now);
  svc.getAll();
});

describe('TaskService', () => {
  it('添加默认进今天并持久化', () => {
    const task = svc.add({ text: '  买牛奶  ' });
    expect(task.list).toBe('today');
    expect(task.text).toBe('买牛奶');
    expect(st.get().tasks).toHaveLength(1);
  });
  it('移到以后会清空提醒', () => {
    const t = svc.add({ text: 'x', reminderAt: '2026-11-18T02:00:00.000Z' });
    const m = svc.move(t.id, 'later');
    expect(m.list).toBe('later');
    expect(m.reminderAt).toBeNull();
    expect(m.notifiedAt).toBeNull();
  });
  it('勾选与取消勾选设置 doneAt', () => {
    const t = svc.add({ text: 'x' });
    expect(svc.toggle(t.id).doneAt).toBe(now.toISOString());
    expect(svc.toggle(t.id).doneAt).toBeNull();
  });
  it('稍后提醒改写时间并清空 notifiedAt', () => {
    const t = svc.add({ text: 'x', reminderAt: '2026-11-18T01:00:00.000Z' });
    svc.markNotified([t.id], now);
    const s = svc.snooze(t.id, 10);
    expect(s.reminderAt).toBe(new Date(now.getTime() + 10 * 60000).toISOString());
    expect(s.notifiedAt).toBeNull();
  });
  it('保存失败时内存与磁盘保持一致且不广播', () => {
    const seen: string[][] = [];
    svc.onChange((tasks) => seen.push(tasks.map((t) => t.text)));
    svc.add({ text: 'first' });
    expect(seen).toEqual([['first']]);
    st.failNext();
    expect(() => svc.add({ text: 'second' })).toThrow();
    expect(svc.getAll().map((t) => t.text)).toEqual(['first']);
    expect(st.get().tasks.map((t) => t.text)).toEqual(['first']);
    expect(seen).toEqual([['first']]);
  });
  it('跨天结转每天只执行一次', () => {
    expect(svc.rolloverIfNeeded()).toBe(false);
    const later = new Date(2026, 10, 19, 8, 0);
    const svc2 = new TaskService(st.store, () => later);
    expect(svc2.rolloverIfNeeded()).toBe(true);
    expect(svc2.rolloverIfNeeded()).toBe(false);
  });
});
