/**
 * **拾取/结构树守卫**：沿父链判断 `nonSelectable` / `nonPickable` / 可见性，避免选中 Grid、Gizmo 或隐藏分支。
 * `ThreeEditor`、`InteractionController`、持久化导入等共用，保证语义一致。
 */
import * as THREE from 'three';
import { VIZON_USER_DATA_KEYS } from '../../infra/utils';

/**
 * 拾取与场景树共用的「对象是否可选 / 是否可见」判断。
 * 约定：`userData.__vizonNonSelectable === true` 表示该对象及其在业务上视为「装饰/辅助」，
 * 沿父链继承（任一祖先不可选则整个分支视为不可选）。
 */

/**
 * 自当前节点向上遍历到根：若任一祖先标记 `__vizonNonSelectable`，返回 true。
 * @param obj 射线命中的 Object3D 或场景树中的逻辑节点对应的 three 对象
 * @returns true 表示不应写入「当前选中」、不应在结构树中展示为可拖拽业务节点等
 */
export function isNonSelectableInHierarchy(obj: THREE.Object3D) {
  let cur: THREE.Object3D | null = obj; // 从命中节点开始
  while (cur) {
    // 祖先链上任一处标记则整支参与交互时排除（helper、gizmo 子部件常用此标记）
    if ((cur.userData as any)[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE]) return true;
    cur = cur.parent; // 向场景根回溯
  }
  return false; // 整条链上均未禁止选择
}

/**
 * 自当前节点向上：若任一祖先标记 `userData.__vizonNonPickable === true`，则认为该对象及其分支在「鼠标拾取」层面不可拾取。
 *
 * 与 `__vizonNonSelectable` 的区别：
 * - `__vizonNonSelectable`：既用于选择/结构树过滤，也用于拾取过滤（当前历史遗留语义）
 * - `__vizonNonPickable`：仅用于拾取过滤，允许结构树中仍可选中（但鼠标点选不行）
 */
export function isNonPickableInHierarchy(obj: THREE.Object3D) {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if ((cur.userData as any)?.[VIZON_USER_DATA_KEYS.COMMON.NON_PICKABLE]) return true;
    cur = cur.parent;
  }
  return false;
}

/**
 * 自当前节点向上：若任一祖先 `visible === false`，则认为世界空间中不可见。
 * 用于拾取时忽略被隐藏父级下面的 mesh（即使子级 visible 为 true，与 three 默认渲染一致）。
 */
export function isVisibleInHierarchy(obj: THREE.Object3D) {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (!cur.visible) return false; // 父隐则子不参与可见性判定为真
    cur = cur.parent;
  }
  return true;
}

/**
 * 判断对象是否标记为不可删除。
 * 不沿父链继承——仅检查对象自身的 `__vizonNonDeletable` 标记。
 * 用于保护默认环境光等必须始终存在的对象。
 */
export function isNonDeletable(obj: THREE.Object3D): boolean {
  return !!(obj.userData as Record<string, unknown>)[VIZON_USER_DATA_KEYS.COMMON.NON_DELETABLE];
}

/**
 * 自当前节点的父级向上遍历，查找最近的锁定 Group 祖先。
 * 锁定 Group：`type === 'Group'` 且 `userData.__vizonLocked === true`。
 * 嵌套锁定场景取最内层（最近）的锁定 Group。
 * 用于视口拾取时将选中重定向到锁定的 Group。
 */
export function findLockedGroupAncestor(obj: THREE.Object3D): THREE.Group | null {
  let cur: THREE.Object3D | null = obj.parent;
  while (cur) {
    if (
      cur.type === 'Group' &&
      (cur.userData as any)?.[VIZON_USER_DATA_KEYS.COMMON.LOCKED]
    ) {
      return cur as THREE.Group;
    }
    cur = cur.parent;
  }
  return null;
}
