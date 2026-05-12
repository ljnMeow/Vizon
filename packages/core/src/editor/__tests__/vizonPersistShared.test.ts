import { describe, expect, it } from 'vitest';
import { isRecord, nowIso, toBool, toFiniteNumber, toQuat, toString, toVec3 } from '../vizonPersistShared';

describe('vizonPersistShared', () => {
  describe('isRecord', () => {
    it('returns true for plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });
    it('returns false for null, undefined, primitives', () => {
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord('x')).toBe(false);
      expect(isRecord(1)).toBe(false);
    });
    it('treats arrays as records (typeof object)', () => {
      expect(isRecord([])).toBe(true);
    });
  });

  describe('toString', () => {
    it('returns string when value is string', () => {
      expect(toString('hello', 'fallback')).toBe('hello');
    });
    it('returns fallback for non-string', () => {
      expect(toString(1, 'fb')).toBe('fb');
      expect(toString(null, 'fb')).toBe('fb');
    });
  });

  describe('toBool', () => {
    it('returns boolean when value is boolean', () => {
      expect(toBool(true, false)).toBe(true);
      expect(toBool(false, true)).toBe(false);
    });
    it('returns fallback for non-boolean', () => {
      expect(toBool('true', false)).toBe(false);
      expect(toBool(0, true)).toBe(true);
    });
  });

  describe('toFiniteNumber (re-export)', () => {
    it('parses finite numbers', () => {
      expect(toFiniteNumber(3, 0)).toBe(3);
      expect(toFiniteNumber('2.5', 0)).toBe(2.5);
    });
    it('returns fallback for NaN / non-finite', () => {
      expect(toFiniteNumber(NaN, 7)).toBe(7);
      expect(toFiniteNumber('abc', 7)).toBe(7);
      expect(toFiniteNumber(Infinity, 7)).toBe(7);
    });
  });

  describe('toVec3', () => {
    const fb = { x: 1, y: 2, z: 3 };
    it('reads numeric fields', () => {
      expect(toVec3({ x: 10, y: 20, z: 30 }, fb)).toEqual({ x: 10, y: 20, z: 30 });
    });
    it('uses fallback for missing or invalid input', () => {
      expect(toVec3(null, fb)).toEqual(fb);
      expect(toVec3({ x: 'bad' }, fb)).toEqual({ x: fb.x, y: fb.y, z: fb.z });
    });
  });

  describe('toQuat', () => {
    const fb = { x: 0, y: 0, z: 0, w: 1 };
    it('reads w component', () => {
      expect(toQuat({ x: 0, y: 0, z: 0, w: -1 }, fb)).toEqual({ x: 0, y: 0, z: 0, w: -1 });
    });
    it('uses fallback when not an object', () => {
      expect(toQuat(undefined, fb)).toEqual(fb);
    });
  });

  describe('nowIso', () => {
    it('returns an ISO-8601 timestamp', () => {
      expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
