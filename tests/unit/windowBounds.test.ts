import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: class {},
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
    getAllDisplays: () => []
  }
}));

import { clampToVisible } from '../../src/main/window';

const screen = { x: 0, y: 0, width: 1920, height: 1040 };

describe('clampToVisible', () => {
  it('在屏幕内的位置保持不变', () => {
    expect(clampToVisible({ x: 100, y: 100 }, { width: 320, height: 400 }, [screen])).toEqual({ x: 100, y: 100 });
  });
  it('跑出屏幕的位置被拉回可见区域', () => {
    const p = clampToVisible({ x: 5000, y: -900 }, { width: 320, height: 400 }, [screen]);
    expect(p.x).toBeLessThanOrEqual(screen.width - 320);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(screen.height - 400);
  });
  it('只露出边缘时把窗口拉回可见区域', () => {
    expect(clampToVisible({ x: 1900, y: 100 }, { width: 320, height: 400 }, [screen])).toEqual({ x: 1600, y: 100 });
  });
  it('底部只剩不可用的部分时保证标题栏可见', () => {
    const p = clampToVisible({ x: 100, y: 1000 }, { width: 320, height: 400 }, [screen]);
    expect(p.y).toBeLessThanOrEqual(screen.height - 48);
    expect(p.y).toBeGreaterThanOrEqual(screen.y);
  });
});
