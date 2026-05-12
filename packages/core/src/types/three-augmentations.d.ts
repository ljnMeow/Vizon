/**
 * **three.js 类型补丁**：为当前 `@types/three` 中可能缺失、但运行时已存在的字段补充声明，避免 TS 报错。
 * 仅影响类型检查，不改变运行时。
 */
import 'three';

declare module 'three' {
  interface SpotLight {
    /**
     * Exists at runtime in three, but may be missing from some @types/three versions.
     * Used by SpotLightShadow.updateMatrices() to derive shadow camera fov.
     */
    focus: number;
  }
}

