import { useEffect, useMemo, useState } from 'react';
import type { SceneTreeNode } from 'vizon-3d-core';
import { useSceneSettings } from '../../../../hooks/useSceneSettings';
import { getAssetUrl } from '../../../../utils/utils';

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
  onDelete
}: {
  node: SceneTreeNode;
  depth: number;
  expandedSet: Set<string>;
  onToggle: (uuid: string) => void;
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  onToggleVisible: (node: SceneTreeNode) => void;
  onDelete: (uuid: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedSet.has(node.uuid);
  const selectable = node.kind !== 'scene' && node.kind !== 'camera';
  const selected = selectable && selectedUuid === node.uuid;

  return (
    <li>
      <div
        className={`grid h-8 grid-cols-[16px_18px_minmax(0,1fr)] items-center gap-1 rounded px-1 text-xs outline-none focus:outline-none focus-visible:outline-none ${
          selected
            ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
            : `text-[var(--text-primary)] ${selectable ? 'hover:bg-[var(--surface-hover)]' : ''}`
        }`}
        style={{ paddingLeft: `${depth * 14}px` }}
        role={selectable ? 'button' : undefined}
        tabIndex={selectable ? 0 : -1}
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
          {selectable ? (
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
    const obj = editor.scene.getObjectByProperty('uuid', uuid) ?? null;
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
            />
          ))}
        </ul>
      )}
    </div>
  );
}

