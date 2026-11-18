import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '../../src/main/store';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'store-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('JsonStore', () => {
  it('保存后可重新读取', () => {
    const p = join(dir, 'data.json');
    new JsonStore<{ n: number }>(p, () => ({ n: 0 })).save({ n: 42 });
    expect(new JsonStore<{ n: number }>(p, () => ({ n: 0 })).load()).toEqual({ n: 42 });
  });
  it('主文件损坏时回退到最新备份并给出提示', () => {
    const p = join(dir, 'data.json');
    const s = new JsonStore<{ n: number }>(p, () => ({ n: 0 }));
    s.save({ n: 1 }); s.save({ n: 2 });
    writeFileSync(p, '{ broken', 'utf8');
    const r = new JsonStore<{ n: number }>(p, () => ({ n: 0 }));
    expect(r.load()).toEqual({ n: 1 });
    expect(r.loadWarning()).toContain('备份');
  });
  it('主文件缺失但备份可用时从备份恢复并提示', () => {
    const p = join(dir, 'data.json');
    const s = new JsonStore<{ n: number }>(p, () => ({ n: 0 }));
    s.save({ n: 1 }); s.save({ n: 2 });
    rmSync(p);
    const r = new JsonStore<{ n: number }>(p, () => ({ n: 0 }));
    expect(r.load()).toEqual({ n: 1 });
    expect(r.loadWarning()).toContain('备份');
  });
  it('写入临时文件失败时主文件保持可读', () => {
    const p = join(dir, 'data.json');
    const s = new JsonStore<{ n: number }>(p, () => ({ n: 0 }));
    s.save({ n: 1 });
    mkdirSync(p + '.tmp'); // 让临时文件写入必然失败
    expect(() => s.save({ n: 2 })).toThrow();
    expect(new JsonStore<{ n: number }>(p, () => ({ n: 0 })).load()).toEqual({ n: 1 });
  });
  it('结构不合法的数据视为损坏并回退到备份', () => {
    const p = join(dir, 'data.json');
    const isShape = (value: unknown): value is { n: number } =>
      typeof value === 'object' && value !== null && typeof (value as { n?: unknown }).n === 'number';
    const s = new JsonStore<{ n: number }>(p, () => ({ n: 0 }), isShape);
    s.save({ n: 1 }); s.save({ n: 2 });
    writeFileSync(p, JSON.stringify({ version: 1, data: { n: 'bad' } }), 'utf8');
    const r = new JsonStore<{ n: number }>(p, () => ({ n: 0 }), isShape);
    expect(r.load()).toEqual({ n: 1 });
    expect(r.loadWarning()).toContain('备份');
  });
  it('轮转保留三份备份且不留临时文件', () => {
    const p = join(dir, 'data.json');
    const s = new JsonStore<{ n: number }>(p, () => ({ n: 0 }));
    s.save({ n: 1 }); s.save({ n: 2 }); s.save({ n: 3 }); s.save({ n: 4 });
    expect(existsSync(p + '.tmp')).toBe(false);
    expect(existsSync(p + '.bak3')).toBe(true);
    expect(JSON.parse(readFileSync(p + '.bak1', 'utf8')).data).toEqual({ n: 3 });
  });
});
