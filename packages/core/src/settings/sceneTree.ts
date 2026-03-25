/**
 * 场景树数据结构（纯 JSON 友好）：由 `SceneTreeController` 从 THREE.Scene  walk 生成，
 * 供 React 结构面板展示，不持有 three 对象引用（仅用 uuid 与上层同步）。
 */

/** 节点语义分类：决定图标、可否拖入子级等 UI 行为（core 只做数据，不渲染 UI） */
export type SceneTreeNodeKind = 'scene' | 'camera' | 'light' | 'group' | 'object';

/**
 * 单层树节点：递归 `children` 形成整棵树。
 * - `uuid`：与 `THREE.Object3D.uuid` 一致，用于 `getObjectByProperty('uuid', id)`；
 * - `type`：three 的 `object.type` 字符串（如 `Mesh`、`DirectionalLight`）；
 * - `visible`：本地 `visible`，层级生效由渲染与拾取另行处理。
 */
export type SceneTreeNode = {
  uuid: string;
  name: string;
  type: string;
  visible: boolean;
  kind: SceneTreeNodeKind;
  children: SceneTreeNode[];
};
