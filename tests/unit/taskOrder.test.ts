import { describe, it, expect } from 'vitest';
import { groupTasks, matchesSearch } from '../../src/shared/taskOrder';
import type { Task } from '../../src/shared/types';

const t = (patch: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), text: 'x', list: 'today', createdAt: '2026-11-18T01:00:00.000Z',
  doneAt: null, reminderAt: null, notifiedAt: null, ...patch
});

describe('groupTasks', () => {
  it('今天：有提醒的按时间升序在前，其余按创建升序，已完成排最后且单独分组', () => {
    const a = t({ text: '无时间A', createdAt: '2026-11-18T01:00:00.000Z' });
    const b = t({ text: '十点', reminderAt: '2026-11-18T02:00:00.000Z', createdAt: '2026-11-18T03:00:00.000Z' });
    const c = t({ text: '九点', reminderAt: '2026-11-18T01:00:00.000Z', createdAt: '2026-11-18T04:00:00.000Z' });
    const d = t({ text: '做完了', doneAt: '2026-11-18T05:00:00.000Z' });
    const g = groupTasks([a, b, c, d]);
    expect(g.today.map(x => x.text)).toEqual(['九点', '十点', '无时间A']);
    expect(g.done.map(x => x.text)).toEqual(['做完了']);
  });
  it('以后按创建顺序，两个列表的已完成都进 done', () => {
    const l1 = t({ list: 'later', text: 'L1', createdAt: '2026-11-18T02:00:00.000Z' });
    const l2 = t({ list: 'later', text: 'L2', createdAt: '2026-11-18T01:00:00.000Z' });
    const ld = t({ list: 'later', text: 'LD', doneAt: '2026-11-18T06:00:00.000Z' });
    const g = groupTasks([l1, l2, ld]);
    expect(g.later.map(x => x.text)).toEqual(['L2', 'L1']);
    expect(g.done.map(x => x.text)).toEqual(['LD']);
  });
});

describe('matchesSearch', () => {
  it('大小写不敏感并按子串匹配；空查询恒真', () => {
    expect(matchesSearch(t({ text: 'Reply to Client' }), 'client')).toBe(true);
    expect(matchesSearch(t({ text: 'Reply to Client' }), '  reply ')).toBe(true);
    expect(matchesSearch(t({ text: 'Reply to Client' }), 'milk')).toBe(false);
    expect(matchesSearch(t({ text: 'Reply to Client' }), '')).toBe(true);
  });
});
