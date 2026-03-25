import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SceneTreeNode } from 'vizon-3d-core';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { getAssetUrl } from '../../../../utils/utils';

const TREE_DRAG_MIME = 'application/x-vizon-scene-node-uuid';
type DropPlacement = 'before' | 'after' | 'inside';

type DragPreview = {
  targetUuid: string;
  placement: DropPlacement;
} | null;

function captureRects(map: Map<string, HTMLDivElement>) {
  const rects = new Map<string, DOMRect>();
  for (const [uuid, el] of map) {
    rects.set(uuid, el.getBoundingClientRect());
  }
  return rects;
}

function nodeIcon(kind: SceneTreeNode['kind']) {
  if (kind === 'scene') return getAssetUrl('../../../../assets/svg/scene.svg', import.meta.url);
  if (kind === 'group') return getAssetUrl('../../../../assets/svg/group.svg', import.meta.url);
  if (kind === 'camera') return getAssetUrl('../../../../assets/svg/perspectiveCamera.svg', import.meta.url);
  return getAssetUrl('../../../../assets/svg/mesh.svg', import.meta.url);
}

function actionIcon(kind: 'visible' | 'hidden' | 'delete') {
  if (kind === 'visible') return getAssetUrl('../../../../assets/svg/eye.svg', import.meta.url);
  if (kind === 'hidden') return getAssetUrl('../../../../assets/svg/close_eyes.svg', import.meta.url);
  return getAssetUrl('../../../../assets/svg/delete.svg', import.meta.url);
}

function SceneTreeItem({
  node,
  depth,
  expandedSet,
  selectedUuid,
  onToggle,
  onSelect,
  onToggleVisible,
  onDelete,
  onMove,
  canMove,
  dragPreview,
  setDragPreview,
  clearDragPreview,
  draggingUuidRef,
  rowRef
}: {
  node: SceneTreeNode;
  depth: number;
  expandedSet: Set<string>;
  onToggle: (uuid: string) => void;
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  onToggleVisible: (node: SceneTreeNode) => void;
  onDelete: (uuid: string) => void;
  onMove: (sourceUuid: string, targetUuid: string, placement: DropPlacement) => void;
  canMove: (sourceUuid: string, targetUuid: string, placement: DropPlacement) => boolean;
  dragPreview: DragPreview;
  setDragPreview: (next: DragPreview) => void;
  clearDragPreview: () => void;
  draggingUuidRef: React.MutableRefObject<string | null>;
  rowRef: (uuid: string, el: HTMLDivElement | null) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedSet.has(node.uuid);
  // scene 节点本身不允许选中；相机（包括 scene 下新增的 camera 对象）允许选中
  const selectable = node.kind !== 'scene';
  // 根部相机节点（ThreeEditor 主相机）不允许拖拽：避免误操作/无意义的移动。
  const isRootCamera = node.kind === 'camera' && depth === 0;
  const draggable = selectable && !isRootCamera;
  const selected = selectable && selectedUuid === node.uuid;
  const isInsidePreview = dragPreview?.targetUuid === node.uuid && dragPreview.placement === 'inside';
  const isBeforePreview = dragPreview?.targetUuid === node.uuid && dragPreview.placement === 'before';
  const isAfterPreview = dragPreview?.targetUuid === node.uuid && dragPreview.placement === 'after';

  const calcPlacement = (e: React.DragEvent<HTMLDivElement>): DropPlacement => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / Math.max(1, rect.height);
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'inside';
  };

  const resolvePlacementWithFallback = (
    sourceUuid: string,
    targetUuid: string,
    preferred: DropPlacement
  ): DropPlacement | null => {
    if (canMove(sourceUuid, targetUuid, preferred)) return preferred;
    // 边界节点（首/尾）更容易命中无效排序区，优先回退到 inside，确保挂载提示稳定出现。
    if (preferred !== 'inside' && canMove(sourceUuid, targetUuid, 'inside')) return 'inside';
    if (preferred !== 'before' && canMove(sourceUuid, targetUuid, 'before')) return 'before';
    if (preferred !== 'after' && canMove(sourceUuid, targetUuid, 'after')) return 'after';
    return null;
  };

  return (
    <li>
      <div
        ref={(el) => rowRef(node.uuid, el)}
        className={`relative grid h-8 grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-1 rounded px-1 text-xs outline-none focus:outline-none focus-visible:outline-none ${
          selected
            ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
            : `text-[var(--text-primary)] ${selectable ? 'hover:bg-[var(--surface-hover)]' : ''}`
        }`}
        style={{ paddingLeft: `${depth * 14}px` }}
        role={selectable ? 'button' : undefined}
        tabIndex={selectable ? 0 : -1}
        draggable={draggable}
        onDragStart={(e) => {
          if (!draggable) return;
          draggingUuidRef.current = node.uuid;
          e.dataTransfer.setData(TREE_DRAG_MIME, node.uuid);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          const sourceUuid = draggingUuidRef.current;
          if (!sourceUuid) return;
          if (sourceUuid === node.uuid) return;
          const preferred = calcPlacement(e);
          const placement = resolvePlacementWithFallback(sourceUuid, node.uuid, preferred);
          if (!placement) {
            clearDragPreview();
            return;
          }
          e.preventDefault(); // 必须阻止默认行为，否则 drop 不会触发
          e.dataTransfer.dropEffect = 'move';
          // 让 drop 使用“最后一次 onDragOver 的 placement”，避免首/尾节点时 onDrop 计算偏差。
          if (dragPreview?.targetUuid !== node.uuid || dragPreview.placement !== placement) {
            setDragPreview({ targetUuid: node.uuid, placement });
          }
        }}
        onDrop={(e) => {
          const sourceUuid = draggingUuidRef.current ?? e.dataTransfer.getData(TREE_DRAG_MIME);
          if (!sourceUuid) return;
          if (sourceUuid === node.uuid) return;
          const preferred =
            dragPreview?.targetUuid === node.uuid ? dragPreview.placement : calcPlacement(e);
          const placement = resolvePlacementWithFallback(sourceUuid, node.uuid, preferred);
          if (!placement) return;
          e.preventDefault();
          onMove(sourceUuid, node.uuid, placement);
          clearDragPreview();
        }}
        onDragEnd={() => {
          // 统一清理拖拽状态，避免后续 hover 误触发。
          draggingUuidRef.current = null;
          clearDragPreview();
        }}
        onClick={() => {
          if (!selectable) return;
          onSelect(node.uuid);
        }}
        onKeyDown={(e) => {
          if (!selectable) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node.uuid);
          }
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center text-base leading-none text-[var(--text-muted)]"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.uuid);
            }}
            aria-label={expanded ? 'collapse' : 'expand'}
          >
            <span>{expanded ? '-' : '+'}</span>
          </button>
        ) : (
          <span className="inline-block h-4 w-4" />
        )}
        <img src={nodeIcon(node.kind)} alt="" className="h-4 w-4 self-center opacity-90" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate select-none leading-none">{node.name}</span>
          {selectable && !isRootCamera ? (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="h-5 min-w-5 rounded px-1 text-[10px] leading-none text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisible(node);
                }}
                aria-label={node.visible ? 'hide node' : 'show node'}
                title={node.visible ? 'hide' : 'show'}
              >
                <img
                  src={actionIcon(node.visible ? 'visible' : 'hidden')}
                  alt=""
                  className="h-3.5 w-3.5 opacity-90"
                />
              </button>
              <button
                type="button"
                className="h-5 min-w-5 rounded px-1 text-[10px] leading-none text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.uuid);
                }}
                aria-label="delete node"
                title="delete"
              >
                <img src={actionIcon('delete')} alt="" className="h-3.5 w-3.5 opacity-90" />
              </button>
            </div>
          ) : null}
        </div>
        {isInsidePreview ? (
          <div className="pointer-events-none absolute inset-0 rounded border border-dashed border-[var(--accent-strong)]" />
        ) : null}
        {isBeforePreview ? (
          <div className="pointer-events-none absolute inset-x-1 top-0 border-t border-dashed border-[var(--accent-strong)]" />
        ) : null}
        {isAfterPreview ? (
          <div className="pointer-events-none absolute inset-x-1 bottom-0 border-b border-dashed border-[var(--accent-strong)]" />
        ) : null}
      </div>
      {hasChildren ? (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr', opacity: expanded ? 1 : 0 }}
        >
          <div className="overflow-hidden">
            <ul>
              {node.children.map((child) => (
                <SceneTreeItem
                  key={child.uuid}
                  node={child}
                  depth={depth + 1}
                  expandedSet={expandedSet}
                  selectedUuid={selectedUuid}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onToggleVisible={onToggleVisible}
                  onDelete={onDelete}
                  onMove={onMove}
                  canMove={canMove}
                  dragPreview={dragPreview}
                  setDragPreview={setDragPreview}
                  clearDragPreview={clearDragPreview}
                  draggingUuidRef={draggingUuidRef}
                  rowRef={rowRef}
                />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function Structure() {
  const { sceneSettings, editor } = useSceneSettings();
  const tree = sceneSettings.sceneTree;
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const draggingUuidRef = useRef<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview>(null);

  // FLIP 动画：记录上一次布局位置并对位移做过渡（仅在 tree 真实变化时触发）
  const rowElsRef = useRef(new Map<string, HTMLDivElement>());
  const lastRectsRef = useRef<Map<string, DOMRect> | null>(null);

  const rowRef = (uuid: string, el: HTMLDivElement | null) => {
    const m = rowElsRef.current;
    if (!el) {
      m.delete(uuid);
      return;
    }
    m.set(uuid, el);
  };

  const allNodeIds = useMemo(() => {
    const ids = new Set<string>();
    const walk = (nodes: SceneTreeNode[]) => {
      for (const node of nodes) {
        ids.add(node.uuid);
        if (node.children.length > 0) walk(node.children);
      }
    };
    walk(tree);
    return ids;
  }, [tree]);

  // 默认全展开；树变化时自动补全新节点
  useEffect(() => {
    setExpandedSet((prev) => {
      const next = new Set<string>();
      for (const id of allNodeIds) next.add(id);
      if (prev.size === next.size) {
        let same = true;
        for (const id of prev) {
          if (!next.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, [allNodeIds]);

  // 位置变化动画（FLIP）：仅随 core 的 tree 变化触发
  useLayoutEffect(() => {
    const els = rowElsRef.current;
    const prev = lastRectsRef.current;
    const next = captureRects(els);
    lastRectsRef.current = next;
    if (!prev) return;

    for (const [uuid, el] of els) {
      const prevRect = prev.get(uuid);
      const nextRect = next.get(uuid);
      if (!prevRect || !nextRect) continue;
      const dy = prevRect.top - nextRect.top;
      if (Math.abs(dy) < 0.5) continue;
      // 只做一次过渡，不反复清空 transition，降低闪烁概率
      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = 'transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      // 下一帧回到 0，让 CSS 过渡生效
      requestAnimationFrame(() => {
        el.style.transform = '';
      });
    }
  }, [tree]);

  const toggleNode = (uuid: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  useEffect(() => {
    if (!editor) return;
    setSelectedUuid(editor.getSelected()?.uuid ?? null);
    const off = editor.on('select', ({ object }) => {
      setSelectedUuid(object?.uuid ?? null);
    });
    return off;
  }, [editor]);

  const selectNode = (uuid: string) => {
    if (!editor) return;
    const obj = uuid === editor.camera.uuid ? editor.camera : (editor.scene.getObjectByProperty('uuid', uuid) ?? null);
    editor.select(obj);
  };

  const toggleVisible = (node: SceneTreeNode) => {
    if (!editor) return;
    editor.setObjectVisibleByUuid(node.uuid, !node.visible);
  };

  const deleteNode = (uuid: string) => {
    if (!editor) return;
    editor.removeObjectByUuid(uuid);
  };

  const moveNode = (sourceUuid: string, targetUuid: string, placement: DropPlacement) => {
    if (!editor) return;
    editor.moveObjectByUuid(sourceUuid, targetUuid, placement);
    // drop 后立即清理预览，等待 core 的 sceneTreeChange 回写最终树
    draggingUuidRef.current = null;
    setDragPreview(null);
  };

  const canMove = (sourceUuid: string, targetUuid: string, placement: DropPlacement) => {
    if (!editor) return false;
    return editor.canMoveObjectByUuid(sourceUuid, targetUuid, placement);
  };

  const clearDragPreview = () => {
    setDragPreview((prev) => {
      if (!prev) return prev;
      return null;
    });
  };

  return (
    <div className="h-full overflow-y-auto p-3">
      {tree.length === 0 ? (
        <div className="text-xs text-[var(--text-muted)]">scene tree is empty</div>
      ) : (
        <ul>
          {tree.map((node) => (
            <SceneTreeItem
              key={node.uuid}
              node={node}
              depth={0}
              expandedSet={expandedSet}
              selectedUuid={selectedUuid}
              onToggle={toggleNode}
              onSelect={selectNode}
              onToggleVisible={toggleVisible}
              onDelete={deleteNode}
              onMove={moveNode}
              canMove={canMove}
              dragPreview={dragPreview}
              setDragPreview={setDragPreview}
              clearDragPreview={clearDragPreview}
              draggingUuidRef={draggingUuidRef}
              rowRef={rowRef}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

