import { useEffect, useMemo, useRef, useState } from 'react';
import { ThreeEditor, type ViewPreset } from 'vizon-3d-core';
import { TransformToolbar, type ViewportTool } from './tools/TransformToolbar';
import { ViewPresetToolbar } from './tools/ViewPresetToolbar';

export function ThreeViewport({ onEditorReady }: { onEditorReady?: (editor: ThreeEditor) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const editor = useMemo(() => ({ current: null as ThreeEditor | null }), []);
  const [view, setView] = useState<ViewPreset>('default');
  // 工具非必选：未选中时不允许拾取/变换交互
  const [tool, setTool] = useState<ViewportTool | null>('translate');

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const inst = new ThreeEditor({ canvas });
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

    const resize = () => {
      const rect = host.getBoundingClientRect();
      inst.resize(Math.max(1, rect.width), Math.max(1, rect.height));
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    return () => {
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
    setTool(next);
    if (!next) {
      editor.current?.setTransformToolEnabled(false);
      return;
    }
    editor.current?.setTransformMode(next);
    editor.current?.setTransformToolEnabled(true);
  };

  return (
    <div ref={hostRef} className="relative h-full w-full">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <ViewPresetToolbar value={view} onChange={setPreset} />
      <TransformToolbar value={tool} onChange={setViewportTool} />
    </div>
  );
}

