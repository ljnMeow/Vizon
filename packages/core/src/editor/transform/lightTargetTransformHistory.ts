/**
 * **灯光 target 历史记录辅助**：把“灯光看向点”变化编码成可撤销的历史操作。
 *
 * 这里刻意独立成文件，是因为 light target 与普通 Object3D transform 只相似一半：
 * - 它有自己的文案、mergeKey 与快照比较逻辑；
 * - RectAreaLight 的 target 还依赖自定义持久化字段，而不是 three 内建属性。
 */
import * as THREE from 'three';
import { encodeHistoryI18nName } from '../../infra/utils';
import type { LightTargetSnapshot } from '../helpers/EditorHelperManager';

type HistoryI18nLabel = { 'zh-CN': string; 'en-US': string };

export type LightTargetHistoryOperation = {
  name: string;
  mergeKey: string;
  mergeWindowMs: number;
  do: () => void;
  undo: () => void;
};

type CreateLightTargetHistoryOperationOptions = {
  light: THREE.Light;
  before: LightTargetSnapshot;
  after: LightTargetSnapshot;
  applySnapshot: (snapshot: LightTargetSnapshot) => void;
};

export function isSameLightTargetSnapshot(a: LightTargetSnapshot, b: LightTargetSnapshot) {
  const eps = 1e-6;
  // 给浮点运算一点容差，避免拖拽过程中无意义的 1e-16 抖动也记进历史。
  const close = (x: number, y: number) => Math.abs(x - y) <= eps;
  return (
    a.lightUuid === b.lightUuid &&
    a.lightType === b.lightType &&
    close(a.target.x, b.target.x) &&
    close(a.target.y, b.target.y) &&
    close(a.target.z, b.target.z)
  );
}

export function createLightTargetHistoryOperation(
  options: CreateLightTargetHistoryOperationOptions
): LightTargetHistoryOperation | null {
  const { light, before, after, applySnapshot } = options;
  if (isSameLightTargetSnapshot(before, after)) return null;
  const lightLabels = getLightTypeHistoryLabels(light);
  const propLabels = getLightTargetPropLabels();
  const targetText = formatVec3ForHistory(after.target);

  return {
    // 以灯 uuid 作为 mergeKey 范围，让连续拖拽同一盏灯时只保留最近一条历史。
    name: encodeHistoryI18nName({
      'zh-CN': `${lightLabels['zh-CN']} - ${light.uuid} - ${propLabels['zh-CN']} = ${targetText}`,
      'en-US': `${lightLabels['en-US']} - ${light.uuid} - ${propLabels['en-US']} = ${targetText}`
    }),
    mergeKey: `light-target:${light.uuid}`,
    mergeWindowMs: 120,
    do: () => applySnapshot(after),
    undo: () => applySnapshot(before)
  };
}

export function getLightTypeHistoryLabels(light: THREE.Light): HistoryI18nLabel {
  const anyLight = light as THREE.Light & {
    isDirectionalLight?: boolean;
    isSpotLight?: boolean;
    isRectAreaLight?: boolean;
  };
  if (anyLight.isDirectionalLight) return { 'zh-CN': '修改平行光属性', 'en-US': 'Modify directional light property' };
  if (anyLight.isSpotLight) return { 'zh-CN': '修改聚光灯属性', 'en-US': 'Modify spot light property' };
  if (anyLight.isRectAreaLight) return { 'zh-CN': '修改矩形光属性', 'en-US': 'Modify rect area light property' };
  return { 'zh-CN': '修改灯光属性', 'en-US': 'Modify light property' };
}

export function getLightTargetPropLabels(): HistoryI18nLabel {
  return { 'zh-CN': '看向点', 'en-US': 'Target' };
}

export function formatVec3ForHistory(v: { x: number; y: number; z: number }) {
  const n = (value: number) => Number(Number(value).toFixed(4));
  return `(${n(v.x)}, ${n(v.y)}, ${n(v.z)})`;
}
