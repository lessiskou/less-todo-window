import { describe, it, expect, beforeEach } from 'vitest';
import { isTaskData, TaskService } from '../../src/main/taskService';
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

describe('isTaskData', () => {
  it('接受循环任务，重启后不会被丢弃', () => {
    const repeat: Task = {
      id: 'r1', text: '洗床单', list: 'repeat',
      createdAt: '2026-11-20T01:00:00.000Z', doneAt: null,
      reminderAt: null, notifiedAt: null, repeatDays: 15, dueOn: '2026-11-26'
    }
    expect(isTaskData({ tasks: [repeat], lastRolloverDay: '2026-11-26' })).toBe(true)
  })
})

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
  it('加载旧数据时补齐 repeatDays / dueOn 为 null', () => {
    const legacy = {
      id: 'old', text: '旧任务', list: 'today',
      createdAt: '2026-11-18T01:00:00.000Z', doneAt: null,
      reminderAt: null, notifiedAt: null
    } as unknown as Task
    const s = fakeStore()
    s.get().tasks = [legacy]
    const svcOld = new TaskService(s.store, () => now)
    const [loaded] = svcOld.getAll()
    expect(loaded.repeatDays).toBeNull()
    expect(loaded.dueOn).toBeNull()
    expect(loaded.text).toBe('旧任务')
  })
  it('新建循环任务：进循环栏，首个到期日为今天+N，无提醒', () => {
    const t = svc.add({ text: '洗床单', repeatDays: 15 })
    expect(t.list).toBe('repeat')
    expect(t.repeatDays).toBe(15)
    expect(t.dueOn).toBe('2026-12-03')
    expect(t.reminderAt).toBeNull()
  })
  it('勾掉循环任务：不记完成，dueOn 从今天顺延', () => {
    const t = svc.add({ text: '洗床单', repeatDays: 15 })
    const next = svc.toggle(t.id)
    expect(next.doneAt).toBeNull()
    expect(next.list).toBe('repeat')
    expect(next.dueOn).toBe('2026-12-03')
  })
  it('编辑循环：改为 30 天从今天重排，清空后变成普通今天任务', () => {
    const t = svc.add({ text: '洗床单', repeatDays: 15 })
    const longer = svc.update(t.id, { repeatDays: 30 })
    expect(longer.dueOn).toBe('2026-12-18')
    const plain = svc.update(t.id, { repeatDays: null })
    expect(plain.list).toBe('today')
    expect(plain.repeatDays).toBeNull()
    expect(plain.dueOn).toBeNull()
  })
  it('普通任务设置循环后进入循环栏', () => {
    const t = svc.add({ text: '换滤芯' })
    const recurring = svc.update(t.id, { repeatDays: 30 })
    expect(recurring.list).toBe('repeat')
    expect(recurring.dueOn).toBe('2026-12-18')
  })
  it('循环任务不能移动列表', () => {
    const t = svc.add({ text: '洗床单', repeatDays: 15 })
    expect(() => svc.move(t.id, 'later')).toThrow('循环任务不能移动到其他列表')
  })
  it('编辑文本不改列表与到期日', () => {
    const later = svc.add({ text: '以后再说', list: 'later' })
    const editedLater = svc.update(later.id, { text: '改个名字', repeatDays: null })
    expect(editedLater.list).toBe('later')

    const repeat = svc.add({ text: '洗床单', repeatDays: 15 })
    const editedRepeat = svc.update(repeat.id, { text: '洗床单和枕套', repeatDays: 15 })
    expect(editedRepeat.list).toBe('repeat')
    expect(editedRepeat.dueOn).toBe('2026-12-03')
  })
  it('已完成任务忽略循环改动', () => {
    const t = svc.add({ text: 'x' })
    svc.toggle(t.id)
    const edited = svc.update(t.id, { text: 'y', repeatDays: 15 })
    expect(edited.doneAt).not.toBeNull()
    expect(edited.repeatDays).toBeNull()
    expect(edited.dueOn).toBeNull()
    expect(edited.list).toBe('today')
  })
  it('跨天结转每天只执行一次', () => {
    expect(svc.rolloverIfNeeded()).toBe(false);
    const later = new Date(2026, 10, 19, 8, 0);
    const svc2 = new TaskService(st.store, () => later);
    expect(svc2.rolloverIfNeeded()).toBe(true);
    expect(svc2.rolloverIfNeeded()).toBe(false);
  });
});
