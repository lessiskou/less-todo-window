import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
  it('轮转保留三份备份且不留临时文件', () => {
    const p = join(dir, 'data.json');
    const s = new JsonStore<{ n: number }>(p, () => ({ n: 0 }));
    s.save({ n: 1 }); s.save({ n: 2 }); s.save({ n: 3 }); s.save({ n: 4 });
    expect(existsSync(p + '.tmp')).toBe(false);
    expect(existsSync(p + '.bak3')).toBe(true);
    expect(JSON.parse(readFileSync(p + '.bak1', 'utf8')).data).toEqual({ n: 3 });
  });
});
