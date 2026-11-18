import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Task } from '../../src/shared/types';

const { FakeNotification } = vi.hoisted(() => {
  type Handler = () => void;
  class FakeNotification {
    static instances: FakeNotification[] = [];
    handlers: Record<string, Handler[]> = {};
    shown = false;
    constructor(public options: unknown) {
      FakeNotification.instances.push(this);
    }
    on(event: string, cb: Handler): void {
      (this.handlers[event] ??= []).push(cb);
    }
    emit(event: string): void {
      for (const cb of this.handlers[event] ?? []) cb();
    }
    show(): void {
      this.shown = true;
    }
  }
  return { FakeNotification };
});

vi.mock('electron', () => ({ Notification: FakeNotification }));

import { showReminders, activeNotificationCount } from '../../src/main/notifications';

const task = (id: string): Task => ({
  id,
  text: `任务${id}`,
  list: 'today',
  createdAt: '2026-11-18T00:00:00.000Z',
  doneAt: null,
  reminderAt: '2026-11-18T02:00:00.000Z',
  notifiedAt: null
});

beforeEach(() => {
  FakeNotification.instances = [];
});

afterEach(() => {
  for (const n of FakeNotification.instances) n.emit('close');
});

describe('showReminders', () => {
  it('通知对象在展示期间被持有，点击后释放', () => {
    const activated: string[][] = [];
    showReminders([task('a')], (ids) => activated.push(ids));
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].shown).toBe(true);
    expect(activeNotificationCount()).toBe(1);
    FakeNotification.instances[0].emit('click');
    expect(activated).toEqual([['a']]);
    expect(activeNotificationCount()).toBe(0);
  });
  it('通知关闭后释放引用', () => {
    showReminders([task('a')], () => {});
    FakeNotification.instances[0].emit('close');
    expect(activeNotificationCount()).toBe(0);
  });
});
