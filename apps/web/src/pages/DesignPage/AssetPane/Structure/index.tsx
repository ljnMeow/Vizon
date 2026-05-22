import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SceneTreeNode, ThreeEditor } from 'vizon-3d-core';
import { useLocale } from '../../../../hooks/useLocale';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { appMessages } from '../../../../i18n/messages';
import { DATA_TRANSFER_KEYS } from '../../../../utils/keys';
import { getAssetUrl } from '../../../../utils/utils';

const TREE_DRAG_MIME = DATA_TRANSFER_KEYS.SCENE_NODE_UUID_MIME;
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

/**
 * 从树中收集所有节点的 uuid 集合。
 */
function collectAllUuids(nodes: SceneTreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: SceneTreeNode[]) => {
    for (const n of list) {
      ids.add(n.uuid);
      if (n.children.length > 0) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

/**
 * 根据搜索关键字过滤树：保留自身或子节点匹配的节点。
 * 返回过滤后的新树（浅拷贝，不修改原节点）。
 */
function filterTree(nodes: SceneTreeNode[], keyword: string): SceneTreeNode[] {
  if (!keyword) return nodes;
  const lower = keyword.toLowerCase();
  const result: SceneTreeNode[] = [];
  for (const node of nodes) {
    const nameMatch = node.name.toLowerCase().includes(lower);
    const uuidMatch = node.uuid.toLowerCase().includes(lower);
    const filteredChildren = filterTree(node.children, keyword);
    if (nameMatch || uuidMatch || filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren });
    }
  }
  return result;
}

/**
 * 收集过滤树中所有有子节点的 uuid（搜索时自动展开用）。
 */
function collectExpandableUuids(nodes: SceneTreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: SceneTreeNode[]) => {
    for (const n of list) {
      if (n.children.length > 0) ids.add(n.uuid);
      walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

/**
 * 递归渲染单个场景树节点，并处理展开、选择、显隐、删除与拖拽排序。
 */
function SceneTreeItem({
  node,
  depth,
  expandedSet,
  selectedUuid,
  renamingUuid,
  onToggle,
  onSelect,
  onToggleVisible,
  onDelete,
  onRenameStart,
  onRenameCommit,
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
  renamingUuid: string | null;
  selectedUuid: string | null;
  onToggle: (uuid: string) => void;
  onSelect: (uuid: string) => void;
  onToggleVisible: (node: SceneTreeNode) => void;
  onDelete: (uuid: string) => void;
  onRenameStart: (uuid: string | null) => void;
  onRenameCommit: (uuid: string, newName: string) => void;
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
  const selectable = node.kind !== 'scene';
  const isRootCamera = node.kind === 'camera' && depth === 0;
  const draggable = selectable && !isRootCamera;
  const selected = selectable && selectedUuid === node.uuid;
  const isRenaming = renamingUuid === node.uuid;
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const commitRename = () => {
    const input = renameInputRef.current;
    if (!input) return;
    const trimmed = input.value.trim();
    if (trimmed && trimmed !== node.name) {
      onRenameCommit(node.uuid, trimmed);
    }
    onRenameStart(null);
  };
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
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
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
          draggingUuidRef.current = null;
          clearDragPreview();
        }}
        onClick={() => {
          if (!selectable) return;
          onSelect(node.uuid);
        }}
        onDoubleClick={() => {
          if (!selectable) return;
          onRenameStart(node.uuid);
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
            className="inline-flex h-4 w-4 items-center justify-center text-base leading-none text-[var(--text-muted)] transition-transform duration-150"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.uuid);
            }}
            aria-label={expanded ? 'collapse' : 'expand'}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            >
              <path d="M3 1L7 5L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span className="inline-block h-4 w-4" />
        )}
        <img src={nodeIcon(node.kind)} alt="" className="h-4 w-4 self-center opacity-90" />
        <div className="flex min-w-0 items-center gap-2">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              defaultValue={node.name}
              className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--bg-input)] px-1 py-0 text-xs leading-none text-[var(--text-primary)] outline-none"
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename();
                }
                if (e.key === 'Escape') {
                  onRenameStart(null);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate select-none leading-none">{node.name}</span>
          )}
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
                  renamingUuid={renamingUuid}
                  selectedUuid={selectedUuid}
                  onToggle={onToggle}
                  onSelect={onSelect}
                  onToggleVisible={onToggleVisible}
                  onDelete={onDelete}
                  onRenameStart={onRenameStart}
                  onRenameCommit={onRenameCommit}
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

/**
 * 场景结构树面板。
 * 负责展示节点层级、同步编辑器选中状态，并支持拖拽重排与基础节点操作。
 */
export function Structure() {
  const { locale } = useLocale();
  const t = appMessages[locale].assetPane;
  const { sceneSettings, editor } = useSceneSettings();
  const tree = sceneSettings.sceneTree;
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [renamingUuid, setRenamingUuid] = useState<string | null>(null);
  const draggingUuidRef = useRef<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview>(null);

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

  const allNodeIds = useMemo(() => collectAllUuids(tree), [tree]);

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

  // 搜索过滤后的树
  const filteredTree = useMemo(() => filterTree(tree, searchKeyword), [tree, searchKeyword]);

  // 搜索时自动展开所有匹配路径上的节点
  useEffect(() => {
    if (!searchKeyword) return;
    const expandable = collectExpandableUuids(filteredTree);
    setExpandedSet((prev) => {
      const next = new Set(prev);
      for (const id of expandable) next.add(id);
      if (next.size === prev.size) {
        let same = true;
        for (const id of next) {
          if (!prev.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, [filteredTree, searchKeyword]);

  // FLIP 动画
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
      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = 'transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1)';
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

  const expandAll = () => {
    setExpandedSet(new Set(allNodeIds));
  };

  const collapseAll = () => {
    setExpandedSet(new Set());
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
    editor.resetShiftMultiselectState();
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

  const renameNode = useCallback((uuid: string, newName: string) => {
    if (!editor) return;
    void editor.setObjectPropertyByUuid(uuid, 'name', newName, {
      recordHistory: true,
      operationName: 'Rename',
    });
  }, [editor]);

  const moveNode = (sourceUuid: string, targetUuid: string, placement: DropPlacement) => {
    if (!editor) return;
    editor.moveObjectByUuid(sourceUuid, targetUuid, placement);
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
    <div className="flex h-full flex-col">
      {/* 搜索框 + 展开折叠按钮 */}
      <div className="flex shrink-0 items-center gap-1 px-3 pt-2 pb-1">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M7.5 7.5L10.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder={t.structureSearchPlaceholder}
            className={`w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-input)] py-1 pl-6 text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] ${searchKeyword ? 'pr-5' : 'pr-1.5'}`}
          />
          {searchKeyword ? (
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              onClick={() => setSearchKeyword('')}
              aria-label="clear search"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          onClick={collapseAll}
          title={t.structureCollapseAll}
          aria-label={t.structureCollapseAll}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          onClick={expandAll}
          title={t.structureExpandAll}
          aria-label={t.structureExpandAll}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 树列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {tree.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)]">{t.structureEmpty}</div>
        ) : filteredTree.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)]">{t.structureEmpty}</div>
        ) : (
          <ul>
            {filteredTree.map((node) => (
              <SceneTreeItem
                key={node.uuid}
                node={node}
                depth={0}
                expandedSet={expandedSet}
                renamingUuid={renamingUuid}
                selectedUuid={selectedUuid}
                onToggle={toggleNode}
                onSelect={selectNode}
                onToggleVisible={toggleVisible}
                onDelete={deleteNode}
                onRenameStart={setRenamingUuid}
                onRenameCommit={renameNode}
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
    </div>
  );
}
