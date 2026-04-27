import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ThreeEditor,
  createDefaultCamera,
  createDefaultLight,
  createDefaultModel,
  type DefaultCameraKey,
  type DefaultLightKey,
  type DefaultModelKey,
  type ViewPreset
} from 'vizon-3d-core';
import { TransformToolbar, type ViewportTool } from './tools/TransformToolbar';
import { ViewPresetToolbar } from './tools/ViewPresetToolbar';
import { DATA_TRANSFER_KEYS } from '../../../utils/keys';
import { encodeHistoryI18nName } from '../../../utils/historyI18n';

/**
 * 生成添加相机操作的国际化历史记录名称。
 * uuid 用于追踪同一类相机的多次添加记录。
 */
function getAddCameraHistoryName(cameraKey: DefaultCameraKey, uuid: string) {
  const cameraName =
    cameraKey === 'orthographic'
      ? { 'zh-CN': '正交相机', 'en-US': 'Orthographic Camera' }
      : { 'zh-CN': '透视相机', 'en-US': 'Perspective Camera' };
  return encodeHistoryI18nName({
    'zh-CN': `添加${cameraName['zh-CN']} - ${uuid}`,
    'en-US': `Add ${cameraName['en-US']} - ${uuid}`
  });
}

/**
 * 生成添加灯光操作的国际化历史记录名称。
 */
function getAddLightHistoryName(lightKey: DefaultLightKey, uuid: string) {
  const lightNameMap: Record<DefaultLightKey, { 'zh-CN': string; 'en-US': string }> = {
    ambientLight: { 'zh-CN': '环境光', 'en-US': 'Ambient Light' },
    directionalLight: { 'zh-CN': '平行光', 'en-US': 'Directional Light' },
    pointLight: { 'zh-CN': '点光源', 'en-US': 'Point Light' },
    spotLight: { 'zh-CN': '聚光灯', 'en-US': 'Spot Light' },
    hemisphereLight: { 'zh-CN': '半球光', 'en-US': 'Hemisphere Light' },
    rectAreaLight: { 'zh-CN': '矩形光', 'en-US': 'Rect Area Light' }
  };
  const lightName = lightNameMap[lightKey];
  return encodeHistoryI18nName({
    'zh-CN': `添加${lightName['zh-CN']} - ${uuid}`,
    'en-US': `Add ${lightName['en-US']} - ${uuid}`
  });
}

/**
 * Three.js 三维视口组件。
 * 负责初始化 ThreeEditor 实例，处理视口工具切换、视角预设，
 * 以及将拖拽放置的模型/相机/灯光插入到场景中。
 */
export function ThreeViewport({ onEditorReady }: { onEditorReady?: (editor: ThreeEditor) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toolRef = useRef<ViewportTool | null>('translate');
  const shiftSelectingRef = useRef(false);
  const MODEL_DRAG_MIME = DATA_TRANSFER_KEYS.MODEL_MIME;
  const CAMERA_DRAG_MIME = DATA_TRANSFER_KEYS.CAMERA_MIME;
  const LIGHT_DRAG_MIME = DATA_TRANSFER_KEYS.LIGHT_MIME;

  const editor = useMemo(() => ({ current: null as ThreeEditor | null }), []);
  const [view, setView] = useState<ViewPreset>('default');
  // 工具非必选：未选中时不允许拾取/变换交互
  const [tool, setTool] = useState<ViewportTool | null>('translate');
  const [hideViewportTool, setHideViewportTool] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const inst = new ThreeEditor({
      canvas,
      // 实验开关：先验证静态对象矩阵冻结对编辑器性能的收益。
      freezeStaticObjects: true
    });
    editor.current = inst;
    inst.start();
    onEditorReady?.(inst);
    // 仅开发环境：把运行时 editor 实例暴露到 window，便于在控制台验证
    if (import.meta.env.DEV) {
      (window as any).vizonEditor = inst;
    }
    inst.setViewPreset(view);
    inst.setTransformMode('translate');
    inst.setTransformToolEnabled(true);
    inst.setTransformHandleVisible(true);
    const offSelect = inst.on('select', ({ object }) => {
      if (shiftSelectingRef.current) return;
      // 当工具未激活时，树节点选中对象后自动回到默认工具（第一个：translate）。
      if (!object) return;
      if (toolRef.current != null) return;
      toolRef.current = 'translate';
      setTool('translate');
      inst.setTransformMode('translate');
      inst.setTransformToolEnabled(true);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Shift') return;
      if (shiftSelectingRef.current) return;
      shiftSelectingRef.current = true;
      setHideViewportTool(true);
      inst.setTransformHandleVisible(false);
      inst.select(null);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Shift') return;
      if (!shiftSelectingRef.current) return;
      shiftSelectingRef.current = false;
      setHideViewportTool(false);
      const nextTool = toolRef.current;
      if (!nextTool) {
        inst.setTransformHandleVisible(true);
        return;
      }
      inst.setTransformMode(nextTool);
      inst.setTransformHandleVisible(true);
    };
    const onWindowBlur = () => {
      if (!shiftSelectingRef.current) return;
      shiftSelectingRef.current = false;
      setHideViewportTool(false);
      const nextTool = toolRef.current;
      if (!nextTool) {
        inst.setTransformHandleVisible(true);
        return;
      }
      inst.setTransformMode(nextTool);
      inst.setTransformHandleVisible(true);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      inst.resize(Math.max(1, rect.width), Math.max(1, rect.height));
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    return () => {
      offSelect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      ro.disconnect();
      inst.dispose();
      editor.current = null;
      if (import.meta.env.DEV) {
        if ((window as any).vizonEditor === inst) (window as any).vizonEditor = null;
      }
    };
  }, [editor, onEditorReady]);

  const setPreset = (preset: ViewPreset) => {
    setView(preset);
    editor.current?.setViewPreset(preset);
  };

  const setViewportTool = (next: ViewportTool | null) => {
    toolRef.current = next;
    setTool(next);
    if (!next) {
      // 工具关闭时清空选中，结构树高亮也会随 select 事件同步取消。
      editor.current?.select(null);
      editor.current?.setTransformToolEnabled(false);
      return;
    }
    editor.current?.setTransformMode(next);
    editor.current?.setTransformToolEnabled(true);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    // 必须阻止默认行为，否则 drop 不会触发
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const inst = editor.current;
    if (!inst) return;

    const host = hostRef.current;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(1, rect.width);
    const y = (e.clientY - rect.top) / Math.max(1, rect.height);

    const point = inst.getDropPointFromViewport(x, y, { groundPlaneY: 0, defaultDistance: 6 });
    if (!point) return;

    const modelKey = e.dataTransfer.getData(MODEL_DRAG_MIME);
    if (modelKey) {
      const typedKey = modelKey as DefaultModelKey;
      const obj = createDefaultModel(typedKey, { position: point });
      inst.add(obj, {
        operationName: encodeHistoryI18nName({
          'zh-CN': `添加物体 - ${obj.uuid}`,
          'en-US': `Add object - ${obj.uuid}`
        })
      });
      inst.select(obj);
      return;
    }

    const cameraKey = e.dataTransfer.getData(CAMERA_DRAG_MIME);
    if (cameraKey) {
      const typedKey = cameraKey as DefaultCameraKey;
      const cam = createDefaultCamera(typedKey, { position: point });
      inst.add(cam, {
        operationName: getAddCameraHistoryName(typedKey, cam.uuid)
      });
      inst.select(cam);
      return;
    }

    const lightKey = e.dataTransfer.getData(LIGHT_DRAG_MIME);
    if (lightKey) {
      const typedKey = lightKey as DefaultLightKey;
      const light = createDefaultLight(typedKey, { position: point, target: { x: 0, y: 0, z: 0 } });
      inst.add(light, {
        operationName: getAddLightHistoryName(typedKey, light.uuid)
      });
      inst.select(light);
    }
  };

  return (
    <div ref={hostRef} className="relative h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <ViewPresetToolbar value={view} onChange={setPreset} />
      {!hideViewportTool ? <TransformToolbar value={tool} onChange={setViewportTool} /> : null}
    </div>
  );
}

