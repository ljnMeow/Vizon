import { Accordion } from '../../../components/Accordion';
import { Tooltip } from '../../../components/Tooltip';
import { basicModels, type ModelCategoryKey } from '../../../utils/models';
import { useSceneSettings } from '../../../hooks/useSceneSettings';
import { createDefaultModel, type DefaultModelKey } from 'vizon-3d-core';
import { useLocale } from '../../../hooks/useLocale';
import { appMessages } from '../../../i18n/messages';

export function ModelList() {
  const { locale } = useLocale();
  const t = appMessages[locale];
  const { editor } = useSceneSettings();

  const addDefaultModelToScene = (key: string) => {
    if (!editor) return;

    const typedKey = key as DefaultModelKey;

    const count = editor.scene.children.filter((c) => (c.userData as any).__vizonDefaultModel).length;

    // 轻微错位放置，避免完全重叠
    const cols = 4;
    const col = count % cols;
    const row = Math.floor(count / cols);

    const x = (col - (cols - 1) / 2) * 1.6;
    const z = row * 1.6;

    const obj = createDefaultModel(typedKey, {
      position: { x, y: 0, z }
    });

    editor.add(obj);
    editor.select(obj);
  };

  return (
    <Accordion<ModelCategoryKey>
      defaultOpenKeys="basic"
      items={[
        {
          key: 'basic',
          header: '基础几何体',
          content: (
            basicModels.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {basicModels.map((m) => (
                  (() => {
                    const name = (t.modelNames as Record<string, string>)[m.key] ?? m.key;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => addDefaultModelToScene(m.key)}
                        className={[
                          'group overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/45',
                          'text-center transition-colors hover:border-[var(--border-strong)]'
                        ].join(' ')}
                      >
                        <div
                          className={[
                            'relative flex h-20 w-full items-center justify-center',
                            m.imageUrl ? 'bg-[var(--accent-soft)]/35' : 'bg-[var(--bg-elevated)]/70',
                            'flex items-center justify-center'
                          ].join(' ')}
                        >
                          {m.imageUrl ? (
                            <img
                              src={m.imageUrl}
                              alt={name}
                              className="h-12 w-12 object-contain"
                              draggable={false}
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                              <span className="text-sm font-semibold leading-none">{name.slice(0, 1)}</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 px-2.5 py-1">
                          <Tooltip content={name} placement="top" triggerClassName="flex w-full min-w-0">
                            <div className="w-full truncate text-xs font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                              {name}
                            </div>
                          </Tooltip>
                        </div>
                      </button>
                    );
                  })()
                ))}
              </div>
            ) : (
              <div
                className={[
                  'rounded-xl border border-dashed border-[var(--border-subtle)]',
                  'bg-[var(--bg-elevated)]/30 p-3 text-xs text-[var(--text-muted)]'
                ].join(' ')}
              >
                暂无模型数据
              </div>
            )
          )
        },
        {
          key: 'environment',
          header: '环境',
          content: <div className="text-xs text-[var(--text-muted)]">暂无环境模型</div>,
        },
        {
          key: 'characters',
          header: '角色',
          content: <div className="text-xs text-[var(--text-muted)]">暂无角色模型</div>,
        }
      ]}
    />
  );
}

