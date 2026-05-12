import * as THREE from 'three';
import type { SceneSettings } from '../settings/sceneSettings';
import type { VizonDocument } from '../types/document';
import { LATEST_SCHEMA_VERSION } from './vizonPersistConstants';
import { nowIso } from './vizonPersistShared';
import { serializeVizonSceneContent } from './vizonPersistScene';

/**
 * 构建持久化文档所需的最小编辑器能力（避免 `ThreeEditor` ↔ `vizonPersist` 模块环依赖）。
 */
export interface VizonDocumentBuildEditorLike {
  readonly scene: THREE.Scene;
  getSceneSettings(): SceneSettings;
}

/**
 * 从 `getSceneSettings` 的快照拼出持久化文档；场景字段不再有第二套来源。
 */
export function buildVizonDocumentFromEditor(
  editor: VizonDocumentBuildEditorLike,
  options?: { generator?: string }
): VizonDocument {
  const sceneSettings = editor.getSceneSettings();
  const ts = nowIso();
  const content = serializeVizonSceneContent(editor.scene);
  return {
    meta: {
      schemaVersion: LATEST_SCHEMA_VERSION,
      createdAt: ts,
      updatedAt: ts,
      generator: options?.generator,
      upAxis: 'y',
      units: 'meter',
    },
    basic: { ...sceneSettings.basic },
    environment: {
      ...sceneSettings.environment,
      fog: { ...sceneSettings.environment.fog },
      hdri: { ...sceneSettings.environment.hdri },
    },
    camera: {
      ...sceneSettings.camera,
      position: { ...sceneSettings.camera.position },
      target: { ...sceneSettings.camera.target },
    },
    grid: { ...sceneSettings.grid },
    helpers: {
      axes: { ...sceneSettings.helpers.axes },
    },
    renderer: { ...sceneSettings.renderer },
    sceneTree: sceneSettings.sceneTree.map((node) => ({ ...node })),
    content,
    assets: {},
  };
}
