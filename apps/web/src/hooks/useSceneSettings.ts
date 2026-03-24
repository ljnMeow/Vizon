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
  setToneMappingExposure: (exposure: number) => void;
  setShadowMapEnabled: (enabled: boolean) => void;
  setShadowMapType: (type: RendererSettings['shadowMapType']) => void;
  setShadowMapAutoUpdate: (autoUpdate: boolean) => void;

  setCameraFov: (fov: number) => void;
  setCameraNear: (near: number) => void;
  setCameraFar: (far: number) => void;
  setCameraPosition: (position: CameraPosition) => void;
  setCameraTarget: (target: CameraTarget) => void;
  resetCamera: () => void;
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
      update((prev) => ({
        ...prev,
        camera: {
          ...prev.camera,
          ...nextCamera,
          position: nextCamera.position,
          target: nextCamera.target
        }
      }));

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
    async (next: SceneSettings) => {
      if (!editor) return;
      const seq = ++applySeqRef.current;
      try {
        await editor.setSceneSettings(next);
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
    (updater: (prev: SceneSettings) => SceneSettings) => {
      const next = updater(sceneSettingsRef.current);
      setSceneSettings(next);
      if (!syncFromCoreRef.current) void applyToCore(next);
    },
    [applyToCore]
  );

  const updateRenderer = useCallback(
    (updater: (prev: RendererSettings) => RendererSettings) => {
      const next = updater(rendererSettingsRef.current);
      if (!editor) {
        setRendererSettings(next);
        return;
      }

      editor.setRendererSettings(next);
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
      }));
    },
    [update]
  );

  const setCameraNear = useCallback(
    (nextNear: number) => {
      const near = clamp(nextNear, 0.001, 100000);
      update((prev) => ({
        ...prev,
        camera: { ...prev.camera, near }
      }));
    },
    [update]
  );

  const setCameraFar = useCallback(
    (nextFar: number) => {
      const far = clamp(nextFar, 1, 100000);
      update((prev) => ({
        ...prev,
        camera: { ...prev.camera, far }
      }));
    },
    [update]
  );

  const setCameraPosition = useCallback(
    (nextPos: CameraPosition) => {
      update((prev) => ({
        ...prev,
        camera: { ...prev.camera, position: nextPos }
      }));
    },
    [update]
  );

  const setCameraTarget = useCallback(
    (nextTarget: CameraTarget) => {
      update((prev) => ({
        ...prev,
        camera: { ...prev.camera, target: nextTarget }
      }));
    },
    [update]
  );

  const resetCamera = useCallback(() => {
    update((prev) => ({
      ...prev,
      camera: { ...prev.camera, ...DEFAULT_CAMERA_SETTINGS }
    }));
  }, [update]);

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
        })),

      setDescription: (description) =>
        update((prev) => ({
          ...prev,
          basic: { ...prev.basic, description }
        })),

      setBackgroundMode: (mode) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, backgroundMode: mode }
        })),

      setBackgroundColor: (color) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, backgroundColor: color }
        })),

      setHdri: (hdri) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, hdri }
        })),

      setEnvironmentStrength: (strength) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, environmentStrength: strength }
        })),

      setFogEnabled: (enabled) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, fog: { ...prev.environment.fog, enabled } }
        })),

      setFogColor: (color) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, fog: { ...prev.environment.fog, color } }
        })),

      setFogNear: (near) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, fog: { ...prev.environment.fog, near } }
        })),

      setFogFar: (far) =>
        update((prev) => ({
          ...prev,
          environment: { ...prev.environment, fog: { ...prev.environment.fog, far } }
        })),
      setGridEnabled: (enabled) =>
        update((prev) => ({
          ...prev,
          grid: { ...prev.grid, enabled }
        })),
      setGridColor: (color) =>
        update((prev) => ({
          ...prev,
          grid: { ...prev.grid, color }
        })),
      setGridOpacity: (opacity) =>
        update((prev) => ({
          ...prev,
          grid: { ...prev.grid, opacity }
        })),
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
        })),
      setAxesSize: (size) =>
        update((prev) => ({
          ...prev,
          helpers: {
            ...prev.helpers,
            axes: { ...prev.helpers.axes, size: clamp(size, 0.1, 100) }
          }
        })),

      setAntialias: (enabled) => updateRenderer((prev) => ({ ...prev, antialias: enabled })),
      setOutputColorSpace: (colorSpace) => updateRenderer((prev) => ({ ...prev, outputColorSpace: colorSpace })),
      setToneMapping: (mapping) => updateRenderer((prev) => ({ ...prev, toneMapping: mapping })),
      setToneMappingExposure: (exposure) =>
        updateRenderer((prev) => ({
          ...prev,
          toneMappingExposure: exposure
        })),
      setShadowMapEnabled: (enabled) => updateRenderer((prev) => ({ ...prev, shadowMapEnabled: enabled })),
      setShadowMapType: (type) => updateRenderer((prev) => ({ ...prev, shadowMapType: type })),
      setShadowMapAutoUpdate: (autoUpdate) => updateRenderer((prev) => ({ ...prev, shadowMapAutoUpdate: autoUpdate })),

      setCameraFov,
      setCameraNear,
      setCameraFar,
      setCameraPosition,
      setCameraTarget,
      resetCamera
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

