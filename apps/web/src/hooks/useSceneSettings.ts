import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  createDefaultSceneSettings,
  type RendererOutputColorSpace,
  type RendererSettings,
  type RendererToneMapping,
  type SceneSettings,
  type SceneSettingsBackgroundMode,
  type SceneSettingsHdri
} from 'vizon-3d-core';
import type { ThreeEditor } from 'vizon-3d-core';
import { encodeHistoryI18nNameAuto } from '../utils/historyI18n';

type CameraPosition = { x: number; y: number; z: number };
type CameraTarget = { x: number; y: number; z: number };

type CameraSettings = {
  fov: number;
  near: number;
  far: number;
  position: CameraPosition;
  target: CameraTarget;
};

const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  fov: 50,
  near: 0.01,
  far: 10000,
  position: { x: 9.4, y: 6.0, z: 9.4 },
  target: { x: 0, y: 0.8, z: 0 }
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function almostEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function isSameCamera(a: CameraSettings, b: CameraSettings) {
  return (
    almostEqual(a.fov, b.fov) &&
    almostEqual(a.near, b.near) &&
    almostEqual(a.far, b.far) &&
    almostEqual(a.position.x, b.position.x) &&
    almostEqual(a.position.y, b.position.y) &&
    almostEqual(a.position.z, b.position.z) &&
    almostEqual(a.target.x, b.target.x) &&
    almostEqual(a.target.y, b.target.y) &&
    almostEqual(a.target.z, b.target.z)
  );
}

function shadowMapTypeLabelZh(type: RendererSettings['shadowMapType']) {
  if (type === 'BasicShadowMap') return '基础';
  if (type === 'PCFShadowMap') return 'PCF软阴影';
  return 'PCF软阴影（柔和）';
}

function backgroundModeLabelZh(mode: SceneSettingsBackgroundMode) {
  return mode === 'skybox' ? '天空盒' : '纯色';
}

type SceneSettingsContextValue = {
  editor: ThreeEditor | null;
  sceneSettings: SceneSettings;
  rendererSettings: RendererSettings;
  cameraSettings: CameraSettings;

  registerEditor: (editor: ThreeEditor) => void;

  setSceneName: (sceneName: string) => void;
  setDescription: (description: string) => void;

  setBackgroundMode: (mode: SceneSettingsBackgroundMode) => void;
  setBackgroundColor: (color: string) => void;
  setHdri: (hdri: SceneSettingsHdri) => void;
  setEnvironmentStrength: (strength: number) => void;

  setFogEnabled: (enabled: boolean) => void;
  setFogColor: (color: string) => void;
  setFogNear: (near: number) => void;
  setFogFar: (far: number) => void;
  setGridEnabled: (enabled: boolean) => void;
  setGridColor: (color: string) => void;
  setGridOpacity: (opacity: number) => void;
  setAxesEnabled: (enabled: boolean) => void;
  setAxesSize: (size: number) => void;

  setAntialias: (enabled: boolean) => void;

  setOutputColorSpace: (colorSpace: RendererOutputColorSpace) => void;
  setToneMapping: (mapping: RendererToneMapping) => void;
  setToneMappingExposure: (exposure: number, options?: { recordHistory?: boolean }) => void;
  setShadowMapEnabled: (enabled: boolean, options?: { recordHistory?: boolean }) => void;
  setShadowMapType: (type: RendererSettings['shadowMapType'], options?: { recordHistory?: boolean }) => void;
  setShadowMapAutoUpdate: (autoUpdate: boolean, options?: { recordHistory?: boolean }) => void;

  setCameraFov: (fov: number) => void;
  setCameraNear: (near: number) => void;
  setCameraFar: (far: number) => void;
  setCameraPosition: (position: CameraPosition) => void;
  setCameraTarget: (target: CameraTarget) => void;
  resetCamera: () => void;

  /** 允许 Inspector 组件以“预览/提交”方式更新 scene settings */
  updateSceneSettings: (updater: (prev: SceneSettings) => SceneSettings, options?: { recordHistory?: boolean; operationName?: string }) => void;
  /** 允许 Inspector 组件以“预览/提交”方式更新 renderer settings */
  updateRendererSettings: (
    updater: (prev: RendererSettings) => RendererSettings,
    options?: { operationName?: string; recordHistory?: boolean }
  ) => void;
};

export const SceneSettingsContext = createContext<SceneSettingsContextValue | null>(null);

export function SceneSettingsProvider({ children }: { children: React.ReactNode }) {
  const [editor, setEditor] = useState<ThreeEditor | null>(null);
  const [sceneSettings, setSceneSettings] = useState<SceneSettings>(() => createDefaultSceneSettings());
  const [rendererSettings, setRendererSettings] = useState<RendererSettings>(() => ({
    antialias: true,
    outputColorSpace: 'SRGBColorSpace',
    toneMapping: 'NoToneMapping',
    toneMappingExposure: 1,
    shadowMapEnabled: false,
    shadowMapType: 'PCFSoftShadowMap',
    shadowMapAutoUpdate: true
  }));

  // ThreeEditor 的默认相机参数（与 `packages/core/src/ThreeEditor.ts` 保持一致）
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>(() => DEFAULT_CAMERA_SETTINGS);

  const sceneSettingsRef = useRef(sceneSettings);
  const rendererSettingsRef = useRef(rendererSettings);

  const syncFromCoreRef = useRef(false);
  const applySeqRef = useRef(0);

  // Bind editor instance + initialize UI with core's authoritative structure.
  const registerEditor = useCallback((inst: ThreeEditor) => {
    // React StrictMode 在开发环境会触发“挂载-卸载-再挂载”，
    // 所以这里必须始终覆盖到最新实例，避免 UI 使用旧的已 dispose editor。
    setEditor(inst);

    setCameraSettings({
      fov: inst.camera.fov,
      near: inst.camera.near,
      far: inst.camera.far,
      position: { x: inst.camera.position.x, y: inst.camera.position.y, z: inst.camera.position.z },
      target: { x: inst.orbit.target.x, y: inst.orbit.target.y, z: inst.orbit.target.z }
    });
  }, []);

  useEffect(() => {
    if (!editor) return;
    syncFromCoreRef.current = true;
    try {
      const fromCore = editor.getSceneSettings();
      setSceneSettings(fromCore);
      setCameraSettings(fromCore.camera);
    } finally {
      syncFromCoreRef.current = false;
    }

    setRendererSettings(editor.getRendererSettings());
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const off = editor.on('sceneTreeChange', ({ tree }) => {
      setSceneSettings((prev) => ({ ...prev, sceneTree: tree }));
    });
    return off;
  }, [editor]);

  // 让 camera 输入框能随 OrbitControls 拖拽/阻尼变化同步
  useEffect(() => {
    if (!editor) return;
    // `OrbitControls` 可能在 core 内发生重建（例如 renderer 重建）。
    // 需要重新绑定 change 监听，确保 UI 相机数值始终来自最新 orbit 实例。
    const orbit = editor.orbit;

    let raf = 0;
    let lastTs = 0;

    const readAndSet = () => {
      raf = 0;
      const nextCamera: CameraSettings = {
        fov: editor.camera.fov,
        near: editor.camera.near,
        far: editor.camera.far,
        position: { x: editor.camera.position.x, y: editor.camera.position.y, z: editor.camera.position.z },
        target: { x: editor.orbit.target.x, y: editor.orbit.target.y, z: editor.orbit.target.z }
      };

      const prevCamera = sceneSettingsRef.current.camera;
      if (
        isSameCamera(nextCamera, {
          fov: prevCamera.fov,
          near: prevCamera.near,
          far: prevCamera.far,
          position: prevCamera.position,
          target: prevCamera.target
        })
      ) {
        return;
      }

      // OrbitControls 会直接修改 camera/orbit.target，这里把变更写回 core 的 sceneSettings.camera
      update(
        (prev) => ({
          ...prev,
          camera: {
            ...prev.camera,
            ...nextCamera,
            position: nextCamera.position,
            target: nextCamera.target
          }
        }),
        { recordHistory: false }
      );

      // 同步 UI（core apply 后也会再校准一次）
      setCameraSettings(nextCamera);
    };

    const onOrbitChange = () => {
      const now = performance.now();
      // 100ms 内只刷新一次，避免阻尼拖拽期间重渲染过密
      if (now - lastTs < 100) return;
      lastTs = now;

      if (raf) return;
      raf = requestAnimationFrame(readAndSet);
    };

    orbit.addEventListener('change', onOrbitChange);
    return () => {
      orbit.removeEventListener('change', onOrbitChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [editor, editor?.orbit]);

  // 始终保留最新 sceneSettings，供 setter 在同一轮事件里“立即同步 core”
  useEffect(() => {
    sceneSettingsRef.current = sceneSettings;
  }, [sceneSettings]);

  // 用 core 的 sceneSettings.camera 作为相机 UI 的最终“真相”
  useEffect(() => {
    setCameraSettings((prev) => (isSameCamera(prev, sceneSettings.camera) ? prev : sceneSettings.camera));
  }, [sceneSettings.camera]);

  useEffect(() => {
    rendererSettingsRef.current = rendererSettings;
  }, [rendererSettings]);

  const applyToCore = useCallback(
    async (next: SceneSettings, options?: { recordHistory?: boolean; operationName?: string }) => {
      if (!editor) return;
      const seq = ++applySeqRef.current;
      try {
        await editor.setSceneSettings(next, {
          recordHistory: options?.recordHistory ?? true,
          operationName: options?.operationName ? encodeHistoryI18nNameAuto(options.operationName) : undefined
        });
        // 只同步最后一次 apply 的 normalized 结果，避免竞态覆盖 UI
        if (seq === applySeqRef.current) {
          const fromCore = editor.getSceneSettings();
          const cur = sceneSettingsRef.current;
          // 避免核心归一化结果与当前 UI 状态一致时的重复 setState，
          // 防止极端情况下触发“来回同步”导致的渲染循环。
          if (
            cur.grid.enabled === fromCore.grid.enabled &&
            cur.grid.color === fromCore.grid.color &&
            cur.grid.opacity === fromCore.grid.opacity &&
            isSameCamera(cur.camera, fromCore.camera)
          ) {
            return;
          }
          setSceneSettings(fromCore);
        }
      } catch {
        // 当前阶段不做全局错误提示，避免阻塞频繁交互。
      }
    },
    [editor]
  );

  const update = useCallback(
    (updater: (prev: SceneSettings) => SceneSettings, options?: { recordHistory?: boolean; operationName?: string }) => {
      const next = updater(sceneSettingsRef.current);
      if (options?.recordHistory === false) {
        try {
          if (JSON.stringify(next) === JSON.stringify(sceneSettingsRef.current)) return;
        } catch {
          // fallback: 无法序列化时仍继续
        }
      }
      setSceneSettings(next);
      if (!syncFromCoreRef.current) void applyToCore(next, options);
    },
    [applyToCore]
  );

  const updateRenderer = useCallback(
    (updater: (prev: RendererSettings) => RendererSettings, options?: { operationName?: string; recordHistory?: boolean }) => {
      const next = updater(rendererSettingsRef.current);
      if (options?.recordHistory === false) {
        try {
          if (JSON.stringify(next) === JSON.stringify(rendererSettingsRef.current)) return;
        } catch {
          // ignore
        }
      }
      if (!editor) {
        setRendererSettings(next);
        return;
      }

      editor.setRendererSettings(next, {
        operationName: options?.operationName ? encodeHistoryI18nNameAuto(options.operationName) : undefined,
        recordHistory: options?.recordHistory ?? true
      });
      setRendererSettings(editor.getRendererSettings());
    },
    [editor]
  );

  const setCameraFov = useCallback(
    (nextFov: number) => {
      const fov = clamp(nextFov, 10, 120);
      update((prev) => ({
        ...prev,
        camera: { ...prev.camera, fov }
      }), { operationName: `修改场景属性-相机-FOV = ${Number(fov.toFixed(4))}` });
    },
    [update]
  );

  const setCameraNear = useCallback(
    (nextNear: number) => {
      const near = clamp(nextNear, 0.001, 100000);
      update((prev) => ({
        ...prev,
        camera: { ...prev.camera, near }
      }), { operationName: `修改场景属性-相机-近平面 = ${Number(near.toFixed(4))}` });
    },
    [update]
  );

  const setCameraFar = useCallback(
    (nextFar: number) => {
      const far = clamp(nextFar, 1, 100000);
      update((prev) => ({
        ...prev,
        camera: { ...prev.camera, far }
      }), { operationName: `修改场景属性-相机-远平面 = ${Number(far.toFixed(4))}` });
    },
    [update]
  );

  const setCameraPosition = useCallback(
    (nextPos: CameraPosition) => {
      update((prev) => ({
        ...prev,
        camera: { ...prev.camera, position: nextPos }
      }), { operationName: `修改场景属性-相机-位置 = (${Number(nextPos.x.toFixed(4))}, ${Number(nextPos.y.toFixed(4))}, ${Number(nextPos.z.toFixed(4))})` });
    },
    [update]
  );

  const setCameraTarget = useCallback(
    (nextTarget: CameraTarget) => {
      update((prev) => ({
        ...prev,
        camera: { ...prev.camera, target: nextTarget }
      }), { operationName: `修改场景属性-相机-目标 = (${Number(nextTarget.x.toFixed(4))}, ${Number(nextTarget.y.toFixed(4))}, ${Number(nextTarget.z.toFixed(4))})` });
    },
    [update]
  );

  const resetCamera = useCallback(() => {
    const applyDefaultToState = () => {
      update((prev) => ({
        ...prev,
        camera: { ...prev.camera, ...DEFAULT_CAMERA_SETTINGS }
      }), { operationName: '修改场景属性-相机-重置' });
    };

    if (!editor) {
      applyDefaultToState();
      return;
    }

    const target = createDefaultSceneSettings().camera;
    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    void (async () => {
      try {
        await editor.animateCameraTo(target, {
          durationMs: reducedMotion ? 0 : 480,
          immediate: reducedMotion
        });
      } catch {
        // 与 setSceneSettings 一致：不阻塞 UI
      }
      applyDefaultToState();
    })();
  }, [editor, update]);

  const value = useMemo<SceneSettingsContextValue>(
    () => ({
      editor,
      sceneSettings,
      rendererSettings,
      cameraSettings,
      registerEditor,

      setSceneName: (sceneName) =>
        update((prev) => ({
          ...prev,
          basic: { ...prev.basic, sceneName }
        }), { operationName: `修改场景属性-基础设置-场景名称 = ${sceneName || '""'}` }),

      setDescription: (description) =>
        update((prev) => ({
          ...prev,
          basic: { ...prev.basic, description }
        }), { operationName: `修改场景属性-基础设置-详细描述 = ${description || '""'}` }),

      setBackgroundMode: (mode) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, backgroundMode: mode }
        }), { operationName: `修改场景属性-环境-背景模式 = ${backgroundModeLabelZh(mode)}` }),

      setBackgroundColor: (color) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, backgroundColor: color }
        }), { operationName: `修改场景属性-环境-背景颜色 = ${color}` }),

      setHdri: (hdri) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, hdri }
        }), { operationName: `修改场景属性-环境-HDRI = ${hdri.type === 'none' ? 'none' : hdri.type}` }),

      setEnvironmentStrength: (strength) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, environmentStrength: strength }
        }), { operationName: `修改场景属性-环境-环境强度 = ${Number(strength.toFixed(4))}` }),

      setFogEnabled: (enabled) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, fog: { ...prev.environment.fog, enabled } }
        }), { operationName: `修改场景属性-环境-雾化开关 = ${enabled ? 'true' : 'false'}` }),

      setFogColor: (color) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, fog: { ...prev.environment.fog, color } }
        }), { operationName: `修改场景属性-环境-雾颜色 = ${color}` }),

      setFogNear: (near) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, fog: { ...prev.environment.fog, near } }
        }), { operationName: `修改场景属性-环境-雾近距 = ${Number(near.toFixed(4))}` }),

      setFogFar: (far) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, fog: { ...prev.environment.fog, far } }
        }), { operationName: `修改场景属性-环境-雾远距 = ${Number(far.toFixed(4))}` }),
      setGridEnabled: (enabled) =>
        update((prev) => ({
          ...prev,
          grid: { ...prev.grid, enabled }
        }), { operationName: `修改场景属性-网格-显示开关 = ${enabled ? 'true' : 'false'}` }),
      setGridColor: (color) =>
        update((prev) => ({
          ...prev,
          grid: { ...prev.grid, color }
        }), { operationName: `修改场景属性-网格-颜色 = ${color}` }),
      setGridOpacity: (opacity) =>
        update((prev) => ({
          ...prev,
          grid: { ...prev.grid, opacity }
        }), { operationName: `修改场景属性-网格-透明度 = ${Number(opacity.toFixed(4))}` }),
      // grid.lineColor removed; keep legacy setter as noop (prevents accidental usage/loops).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setGridLineColor: (_lineColor: string) => {},
      setAxesEnabled: (enabled) =>
        update((prev) => ({
          ...prev,
          helpers: {
            ...prev.helpers,
            axes: { ...prev.helpers.axes, enabled }
          }
        }), { operationName: `修改场景属性-辅助器-坐标轴开关 = ${enabled ? 'true' : 'false'}` }),
      setAxesSize: (size) =>
        update((prev) => ({
          ...prev,
          helpers: {
            ...prev.helpers,
            axes: { ...prev.helpers.axes, size: clamp(size, 0.1, 100) }
          }
        }), { operationName: `修改场景属性-辅助器-坐标轴尺寸 = ${Number(clamp(size, 0.1, 100).toFixed(4))}` }),

      setAntialias: (enabled) => updateRenderer((prev) => ({ ...prev, antialias: enabled }), { operationName: `修改场景属性-渲染器-抗锯齿 = ${enabled ? 'true' : 'false'}` }),
      setOutputColorSpace: (colorSpace) => updateRenderer((prev) => ({ ...prev, outputColorSpace: colorSpace }), { operationName: `修改场景属性-渲染器-输出色彩空间 = ${colorSpace}` }),
      setToneMapping: (mapping) => updateRenderer((prev) => ({ ...prev, toneMapping: mapping }), { operationName: `修改场景属性-渲染器-色调映射 = ${mapping}` }),
      setToneMappingExposure: (exposure, options) =>
        updateRenderer((prev) => ({
          ...prev,
          toneMappingExposure: exposure
        }), { operationName: `修改场景属性-渲染器-曝光 = ${Number(exposure.toFixed(4))}`, recordHistory: options?.recordHistory ?? true }),
      setShadowMapEnabled: (enabled, options) =>
        updateRenderer((prev) => ({ ...prev, shadowMapEnabled: enabled }), { operationName: `修改场景属性-渲染器-阴影开关 = ${enabled ? 'true' : 'false'}`, recordHistory: options?.recordHistory ?? true }),
      setShadowMapType: (type, options) =>
        updateRenderer((prev) => ({ ...prev, shadowMapType: type }), {
          operationName: `修改场景属性-渲染器-阴影类型 = ${shadowMapTypeLabelZh(type)}`,
          recordHistory: options?.recordHistory ?? true
        }),
      setShadowMapAutoUpdate: (autoUpdate, options) =>
        updateRenderer((prev) => ({ ...prev, shadowMapAutoUpdate: autoUpdate }), { operationName: `修改场景属性-渲染器-阴影自动更新 = ${autoUpdate ? 'true' : 'false'}`, recordHistory: options?.recordHistory ?? true }),

      setCameraFov,
      setCameraNear,
      setCameraFar,
      setCameraPosition,
      setCameraTarget,
      resetCamera,
      updateSceneSettings: update,
      updateRendererSettings: updateRenderer
    }),
    [
      editor,
      sceneSettings,
      rendererSettings,
      cameraSettings,
      registerEditor,
      update,
      updateRenderer,
      setCameraFov,
      setCameraNear,
      setCameraFar,
      setCameraPosition,
      setCameraTarget,
      resetCamera
    ]
  );

  // 使用 createElement 避免在 .ts 文件里写 JSX
  return React.createElement(SceneSettingsContext.Provider, { value }, children);
}

export function useSceneSettings() {
  const ctx = useContext(SceneSettingsContext);
  if (!ctx) throw new Error('useSceneSettings must be used within SceneSettingsProvider');
  return ctx;
}

