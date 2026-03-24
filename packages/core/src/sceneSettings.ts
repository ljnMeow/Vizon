import * as THREE from 'three';
import type { SceneTreeNode } from './sceneTree';

/**
 * SceneSettings 数据真相与校验/归一化：
 * - 定义核心的可序列化场景配置结构（SceneSettings/Camera/Renderer/Environment 等）
 * - 提供默认配置（createDefaultSceneSettings）
 * - 提供归一化与约束（normalizeSceneSettings），用于保证 UI 输入不会导致 three 异常
 *
 * 设计原则：该模块尽量不依赖 UI/React，让 core 能作为独立 npm 包复用。
 */
export type SceneSettingsVersion = number;

// scene 的顶层数据结构：由 core 持有（数据真相），web 负责展示/编辑。
// 后续如果要做“导出/导入”，主要就是序列化这一份结构。
export type SceneSettingsBasic = {
  // 场景名称：目前主要用于 UI 展示/编辑，渲染逻辑不直接依赖。
  sceneName: string;
  // 场景描述：目前同样只作为 UI/元信息。
  description: string;
};

export type SceneSettingsBackgroundMode = 'solid' | 'skybox';

export type SceneSettingsUploadedHdri = {
  type: 'uploaded';
  /**
   * WEB 侧通常会把用户上传文件转成 `blob:` url（通过 `URL.createObjectURL(file)`）。
   * 注意：blob url 是运行时临时资源，不适合长期导出为“可长期复用的 JSON”。
   * 如果未来需要持久化导出，需要在资源层做实际的上传/落盘/引用。
   */
  url: string;
  fileName?: string;
  mimeType?: string;
};

// 环境贴图（HDri）的抽象：none=不使用，uploaded=使用上层提供的运行时 url。
export type SceneSettingsHdri = { type: 'none' } | SceneSettingsUploadedHdri;

export type SceneSettingsFog = {
  // 雾是否启用
  enabled: boolean;
  // 雾颜色（期望为十六进制字符串，例如 #c7d2fe）
  color: string;
  // 雾近距离：单位交给 three 内部解释（相对相机距离）
  near: number;
  // 雾远距离：单位交给 three 内部解释（相对相机距离）
  far: number;
};

export type SceneSettingsEnvironment = {
  // 背景模式：纯色（solid）或天空盒（skybox）
  backgroundMode: SceneSettingsBackgroundMode;
  // 背景色（hex 字符串）
  backgroundColor: string;
  // 环境贴图（用于 skybox / IBL）
  hdri: SceneSettingsHdri;
  // 环境强度（用于 scene.environmentIntensity）
  environmentStrength: number;
  // 雾配置
  fog: SceneSettingsFog;
};

export type SceneSettingsCameraPosition = { x: number; y: number; z: number };
export type SceneSettingsCameraTarget = { x: number; y: number; z: number };

export type SceneSettingsCamera = {
  fov: number;
  near: number;
  far: number;
  position: SceneSettingsCameraPosition;
  target: SceneSettingsCameraTarget;
};

export type SceneSettingsGrid = {
  enabled: boolean;
  color: string;
  opacity: number;
};

export type SceneSettingsAxesHelper = {
  enabled: boolean;
  size: number;
};

export type SceneSettingsHelpers = {
  axes: SceneSettingsAxesHelper;
};

export type RendererOutputColorSpace = 'SRGBColorSpace' | 'LinearSRGBColorSpace';
export type RendererToneMapping =
  | 'NoToneMapping'
  | 'LinearToneMapping'
  | 'ReinhardToneMapping'
  | 'CineonToneMapping'
  | 'ACESFilmicToneMapping';

export type RendererShadowMapType = 'BasicShadowMap' | 'PCFShadowMap' | 'PCFSoftShadowMap';

export type RendererSettings = {
  /**
   * antialias 只能在 WebGLRenderer 创建时生效，因此该值变化需要重建 renderer。
   */
  antialias: boolean;
  outputColorSpace: RendererOutputColorSpace;
  toneMapping: RendererToneMapping;
  toneMappingExposure: number;
  shadowMapEnabled: boolean;
  shadowMapType: RendererShadowMapType;
  shadowMapAutoUpdate: boolean;
};

export type SceneSettings = {
  // 版本号：用于未来数据结构演进/兼容
  version: SceneSettingsVersion;
  // 场景元信息（名称、描述等）
  basic: SceneSettingsBasic;
  // 场景渲染相关配置（背景、环境贴图、雾等）
  environment: SceneSettingsEnvironment;
  // 相机配置（PerspectiveCamera + OrbitControls target）
  camera: SceneSettingsCamera;
  // 网格辅助线配置（GridHelper）
  grid: SceneSettingsGrid;
  // 坐标轴辅助配置（AxesHelper）
  helpers: SceneSettingsHelpers;
  // 渲染器（renderer）运行时配置：用于可版本化/可导出
  renderer: RendererSettings;
  // 场景树（用于结构面板展示）
  sceneTree: SceneTreeNode[];
};

/**
 * 创建默认的 `SceneSettings`：
 * - `ThreeEditor` 在未提供 `initialSceneSettings` 时使用这份结构作为起点
 * - 背景色默认白色（#ffffff）
 */
export function createDefaultSceneSettings(): SceneSettings {
  return {
    version: 3,
    basic: {
      sceneName: '',
      description: ''
    },
    environment: {
      backgroundMode: 'solid',
      // 默认使用偏灰背景，提升辅助线可读性
      backgroundColor: '#f3f4f6',
      hdri: { type: 'none' },
      environmentStrength: 1,
      fog: {
        enabled: false,
        color: '#c7d2fe',
        near: 0.5,
        far: 10
      }
    },
    camera: {
      fov: 50,
      near: 0.01,
      far: 10_000,
      // 默认“初始化视图”相机拉远：避免贴脸，视觉上更容易观察整体。
      position: { x: 9.4, y: 6.0, z: 9.4 },
      target: { x: 0, y: 0.8, z: 0 }
    },
    grid: {
      enabled: true,
      color: '#334155',
      opacity: 0.8,
    },
    helpers: {
      axes: {
        enabled: false,
        size: 1.5
      }
    },
    renderer: {
      antialias: true,
      outputColorSpace: 'SRGBColorSpace',
      toneMapping: 'NoToneMapping',
      toneMappingExposure: 1,
      shadowMapEnabled: false,
      shadowMapType: 'PCFShadowMap',
      shadowMapAutoUpdate: true
    },
    sceneTree: []
  };
}

// 数值约束工具：把输入限制在 [min, max] 区间内，避免 UI 传入非法值导致 three 报错/表现异常。
function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function toFiniteNumber(value: unknown, fallback: number) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

// 颜色解析工具：把任意可解析的颜色字符串转换为 THREE.Color，
// 然后再导回统一的 hex 格式（用于 normalize）。
function parseHexColor(input: string, fallbackHex: string): THREE.Color {
  // 防御式解析：UI 或外部输入非法颜色时回退，避免 normalize 抛错导致应用中断。
  try {
    return new THREE.Color(input);
  } catch {
    return new THREE.Color(fallbackHex);
  }
}

function normalizeSceneTreeNode(node: SceneTreeNode): SceneTreeNode {
  return {
    uuid: String(node.uuid ?? ''),
    name: String(node.name ?? ''),
    type: String(node.type ?? ''),
    visible: Boolean(node.visible),
    kind:
      node.kind === 'scene' || node.kind === 'camera' || node.kind === 'light' || node.kind === 'group'
        ? node.kind
        : 'object',
    children: Array.isArray(node.children) ? node.children.map(normalizeSceneTreeNode) : []
  };
}

/**
 * 归一化（normalize）：
 * 对输入的 `SceneSettings` 做最小校验与约束，让颜色/数值格式对 three & UI 都一致。
 *
 * 约束包括：
 * - clamp：相机 fov/near/far 与 renderer tone/曝光等范围约束
 * - 颜色 normalize：把背景色/雾色转为统一 hex 字符串格式
 * - 枚举回退：对未知字符串做安全回退（保持可预期渲染）
 */
export function normalizeSceneSettings(input: SceneSettings): SceneSettings {
  const env = input.environment;
  const fog = env.fog;

  const renderer = input.renderer;
  const camera = input.camera;
  const helpers = input.helpers;
  const sceneTree = input.sceneTree;
  const validOutputColorSpace: RendererOutputColorSpace =
    renderer.outputColorSpace === 'LinearSRGBColorSpace' ? 'LinearSRGBColorSpace' : 'SRGBColorSpace';

  const validToneMapping: RendererToneMapping =
    renderer.toneMapping === 'LinearToneMapping'
      ? 'LinearToneMapping'
      : renderer.toneMapping === 'ReinhardToneMapping'
        ? 'ReinhardToneMapping'
        : renderer.toneMapping === 'CineonToneMapping'
          ? 'CineonToneMapping'
          : renderer.toneMapping === 'ACESFilmicToneMapping'
            ? 'ACESFilmicToneMapping'
            : 'NoToneMapping';

  const validShadowMapType: RendererShadowMapType =
    renderer.shadowMapType === 'BasicShadowMap'
      ? 'BasicShadowMap'
      : renderer.shadowMapType === 'PCFSoftShadowMap'
        ? 'PCFSoftShadowMap'
        : 'PCFShadowMap';

  const fov = clamp(toFiniteNumber(camera.fov, 50), 10, 120);
  const near = clamp(toFiniteNumber(camera.near, 0.01), 0.001, 100_000);
  const far = clamp(toFiniteNumber(camera.far, 10_000), near + 1e-3, 100_000);

  return {
    ...input,
    environment: {
      ...env,
      environmentStrength: clamp(toFiniteNumber(env.environmentStrength, 1), 0, 5),
      backgroundColor: `#${parseHexColor(env.backgroundColor, '#f3f4f6').getHexString()}`,
      fog: {
        ...fog,
        color: `#${parseHexColor(fog.color, '#c7d2fe').getHexString()}`,
        near: clamp(toFiniteNumber(fog.near, 0.5), 0, 50),
        far: clamp(toFiniteNumber(fog.far, 10), 0, 200),
        enabled: Boolean(fog.enabled)
      }
    },
    camera: {
      ...camera,
      fov,
      near,
      far,
      position: {
        x: toFiniteNumber(camera.position.x, 9.4),
        y: toFiniteNumber(camera.position.y, 6.0),
        z: toFiniteNumber(camera.position.z, 9.4)
      },
      target: {
        x: toFiniteNumber(camera.target.x, 0),
        y: toFiniteNumber(camera.target.y, 0.8),
        z: toFiniteNumber(camera.target.z, 0)
      }
    },
    grid: {
      enabled: Boolean(input.grid.enabled),
      color: `#${parseHexColor(input.grid.color, '#334155').getHexString()}`,
      opacity: clamp(toFiniteNumber(input.grid.opacity, 0.8), 0, 1),
    },
    helpers: {
      axes: {
        enabled: Boolean(helpers.axes.enabled),
        size: clamp(toFiniteNumber(helpers.axes.size, 1.5), 0.1, 100)
      }
    },
    renderer: {
      ...renderer,
      antialias: Boolean(renderer.antialias),
      outputColorSpace: validOutputColorSpace,
      toneMapping: validToneMapping,
      toneMappingExposure: clamp(toFiniteNumber(renderer.toneMappingExposure, 1), 0, 10),
      shadowMapEnabled: Boolean(renderer.shadowMapEnabled),
      shadowMapType: validShadowMapType,
      shadowMapAutoUpdate: Boolean(renderer.shadowMapAutoUpdate)
    },
    sceneTree: Array.isArray(sceneTree) ? sceneTree.map(normalizeSceneTreeNode) : []
  };
}

