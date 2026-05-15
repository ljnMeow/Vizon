/**
 * `vizonPersistShared` 单元测试。
 * 验证解析用小工具函数在合法/非法输入下的行为。
 */
import { describe, expect, it } from 'vitest';

// 导入所有被测工具函数
import { isRecord, nowIso, toBool, toFiniteNumber, toQuat, toString, toVec3 } from '../vizonPersistShared';

describe('vizonPersistShared', () => {

  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      // 空对象和带属性对象都应视为 record
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });
    it('returns false for null, undefined, primitives', () => {
      // null 的 typeof 是 'object' 但需要单独排除
      expect(isRecord(null)).toBe(false);
      // undefined 不是对象
      expect(isRecord(undefined)).toBe(false);
      // 字符串和数字不是对象
      expect(isRecord('x')).toBe(false);
      expect(isRecord(1)).toBe(false);
    });
    it('treats arrays as records (typeof object)', () => {
      // 数组的 typeof 也是 'object'，因此 isRecord 返回 true（与 JSON 解析行为一致）
      // 调用方若需要区分数组与对象，应在 isRecord 之后再用 Array.isArray 判断
      expect(isRecord([])).toBe(true);
    });
  });

  describe('toString', () => {
    it('returns string when value is string', () => {
      // 合法字符串直接返回，不做任何转换
      expect(toString('hello', 'fallback')).toBe('hello');
    });
    it('returns fallback for non-string', () => {
      // 数字和 null 都不是字符串类型，应返回 fallback
      expect(toString(1, 'fb')).toBe('fb');
      expect(toString(null, 'fb')).toBe('fb');
    });
  });

  describe('toBool', () => {
    it('returns boolean when value is boolean', () => {
      // true 和 false 都是合法布尔，直接返回
      expect(toBool(true, false)).toBe(true);
      expect(toBool(false, true)).toBe(false);
    });
    it('returns fallback for non-boolean', () => {
      // 字符串 "true" 和数字 0 不是布尔类型，应返回 fallback
      // 这是有意为之的严格类型检查，防止把 1/"true" 等 truthy 值误判为 true
      expect(toBool('true', false)).toBe(false);
      expect(toBool(0, true)).toBe(true);
    });
  });

  describe('toFiniteNumber (re-export)', () => {
    it('parses finite numbers', () => {
      // 整数和浮点数直接返回
      expect(toFiniteNumber(3, 0)).toBe(3);
      // 可解析的字符串数字也被接受
      expect(toFiniteNumber('2.5', 0)).toBe(2.5);
    });
    it('returns fallback for NaN / non-finite', () => {
      // NaN、无穷大、非数字字符串都应返回 fallback
      expect(toFiniteNumber(NaN, 7)).toBe(7);
      expect(toFiniteNumber('abc', 7)).toBe(7);
      expect(toFiniteNumber(Infinity, 7)).toBe(7);
    });
  });

  describe('toVec3', () => {
    // 用于对比的 fallback 向量
    const fb = { x: 1, y: 2, z: 3 };
    it('reads numeric fields', () => {
      // 三个分量都合法时直接返回对应值
      expect(toVec3({ x: 10, y: 20, z: 30 }, fb)).toEqual({ x: 10, y: 20, z: 30 });
    });
    it('uses fallback for missing or invalid input', () => {
      // null 不是对象，整体返回 fallback
      expect(toVec3(null, fb)).toEqual(fb);
      // x 是字符串（toFiniteNumber 解析失败），则 x 取 fallback.x；y/z 也因缺失取 fallback 对应分量
      expect(toVec3({ x: 'bad' }, fb)).toEqual({ x: fb.x, y: fb.y, z: fb.z });
    });
  });

  describe('toQuat', () => {
    // 单位四元数（无旋转）
    const fb = { x: 0, y: 0, z: 0, w: 1 };
    it('reads w component', () => {
      // 验证 w 分量（四元数的实部）被正确读取，包括负值（180° 旋转等）
      expect(toQuat({ x: 0, y: 0, z: 0, w: -1 }, fb)).toEqual({ x: 0, y: 0, z: 0, w: -1 });
    });
    it('uses fallback when not an object', () => {
      // undefined 不是对象，整体返回 fallback
      expect(toQuat(undefined, fb)).toEqual(fb);
    });
  });

  describe('nowIso', () => {
    it('returns an ISO-8601 timestamp', () => {
      // 验证格式：以 4 位年份 + '-' 开头，符合 ISO-8601 规范
      expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
