import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ThreeEditor, createDefaultModel, type DefaultModelKey, type ViewPreset } from 'vizon-3d-core';
import { TransformToolbar, type ViewportTool } from './tools/TransformToolbar';
import { ViewPresetToolbar } from './tools/ViewPresetToolbar';
import { DATA_TRANSFER_KEYS } from '../../../utils/storageKeys';

export function ThreeViewport({ onEditorReady }: { onEditorReady?: (editor: ThreeEditor) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toolRef = useRef<ViewportTool | null>('translate');
  const MODEL_DRAG_MIME = DATA_TRANSFER_KEYS.MODEL_MIME;

  const editor = useMemo(() => ({ current: null as ThreeEditor | null }), []);
  const [view, setView] = useState<ViewPreset>('default');
  // 工具非必选：未选中时不允许拾取/变换交互
  const [tool, setTool] = useState<ViewportTool | null>('translate');

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
    const offSelect = inst.on('select', ({ object }) => {
      // 当工具未激活时，树节点选中对象后自动回到默认工具（第一个：translate）。
      if (!object) return;
      if (toolRef.current != null) return;
      toolRef.current = 'translate';
      setTool('translate');
      inst.setTransformMode('translate');
      inst.setTransformToolEnabled(true);
    });

    const resize = () => {
      const rect = host.getBoundingClientRect();
      inst.resize(Math.max(1, rect.width), Math.max(1, rect.height));
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    return () => {
      offSelect();
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

    const key = e.dataTransfer.getData(MODEL_DRAG_MIME);
    if (!key) return;

    const host = hostRef.current;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(1, rect.width);
    const y = (e.clientY - rect.top) / Math.max(1, rect.height);

    const point = inst.getGroundPointFromViewport(x, y, 0);
    if (!point) return;

    const typedKey = key as DefaultModelKey;
    const obj = createDefaultModel(typedKey, { position: point });

    inst.add(obj);
    inst.select(obj);
  };

  return (
    <div ref={hostRef} className="relative h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <ViewPresetToolbar value={view} onChange={setPreset} />
      <TransformToolbar value={tool} onChange={setViewportTool} />
    </div>
  );
}

