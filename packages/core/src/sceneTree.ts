export type SceneTreeNodeKind = 'scene' | 'camera' | 'light' | 'group' | 'object';

export type SceneTreeNode = {
  uuid: string;
  name: string;
  type: string;
  visible: boolean;
  kind: SceneTreeNodeKind;
  children: SceneTreeNode[];
};

