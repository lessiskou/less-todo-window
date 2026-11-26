import { describe, it, expect } from 'vitest';
import { parseQuickAdd } from '../../src/shared/quickAdd';

const at = (h: number, m = 0) => new Date(2026, 10, 18, h, m); // 2026-11-18 本地时间
const todayAt = (h: number, m = 0) => new Date(2026, 10, 18, h, m).toISOString();

describe('parseQuickAdd', () => {
  it('解析 10:00 前缀并只保留任务文字', () => {
    expect(parseQuickAdd('10:00 交周报', at(9))).toEqual({ text: '交周报', reminderAt: todayAt(10), timeWasPast: false, repeatDays: null });
  });
  it('解析中文“点/分/半”', () => {
    expect(parseQuickAdd('22点 交周报', at(9)).reminderAt).toBe(todayAt(22));
    expect(parseQuickAdd('10点30分 开会', at(9)).reminderAt).toBe(todayAt(10, 30));
    expect(parseQuickAdd('10点半 开会', at(9)).reminderAt).toBe(todayAt(10, 30));
  });
  it('时间已过时不设提醒但保留文字并标记 timeWasPast', () => {
    expect(parseQuickAdd('10:00 交周报', at(15))).toEqual({ text: '交周报', reminderAt: null, timeWasPast: true, repeatDays: null });
  });
  it('只有时间没有文字时按纯文本保留', () => {
    expect(parseQuickAdd('10:00', at(9))).toEqual({ text: '10:00', reminderAt: null, timeWasPast: false, repeatDays: null });
  });
  it('非法时间与非时间输入原样保留', () => {
    expect(parseQuickAdd('25:00 开会', at(9))).toEqual({ text: '25:00 开会', reminderAt: null, timeWasPast: false, repeatDays: null });
    expect(parseQuickAdd('买牛奶', at(9))).toEqual({ text: '买牛奶', reminderAt: null, timeWasPast: false, repeatDays: null });
  });
  it('识别 每N天 / 每天 循环前缀', () => {
    expect(parseQuickAdd('每15天 洗床单', at(9))).toEqual({
      text: '洗床单', reminderAt: null, timeWasPast: false, repeatDays: 15
    });
    expect(parseQuickAdd('每天 喝水', at(9))).toEqual({
      text: '喝水', reminderAt: null, timeWasPast: false, repeatDays: 1
    });
  });
  it('循环前缀后不解析时间，整段保留为文本', () => {
    expect(parseQuickAdd('每15天 10:00 洗床单', at(9))).toEqual({
      text: '10:00 洗床单', reminderAt: null, timeWasPast: false, repeatDays: 15
    });
  });
  it('无空格与越界天数不识别为循环', () => {
    expect(parseQuickAdd('每15天洗床单', at(9))).toEqual({
      text: '每15天洗床单', reminderAt: null, timeWasPast: false, repeatDays: null
    });
    expect(parseQuickAdd('每0天 洗床单', at(9)).repeatDays).toBeNull();
    expect(parseQuickAdd('每999天 洗床单', at(9)).repeatDays).toBeNull();
    expect(parseQuickAdd('每天都要做的事', at(9)).repeatDays).toBeNull();
  });
});
