import { Accordion } from '../../../../components/Accordion';
import { Tooltip } from '../../../../components/Tooltip';
import { basicModels, type ModelCategoryKey } from '../../../../utils/models';
import { appMessages } from '../../../../i18n/messages';
import { useLocale } from '../../../../hooks/useLocale';
import { DATA_TRANSFER_KEYS } from '../../../../utils/keys';

/**
 * 模型资产列表，按类别分组显示为 Accordion 折叠面板。
 * 每个模型卡片支持拖拽到视口，通过 MODEL_MIME DataTransfer key 传递模型 key。
 */
export function ModelList() {
  const { locale } = useLocale();
  const t = appMessages[locale];
  const MODEL_DRAG_MIME = DATA_TRANSFER_KEYS.MODEL_MIME;

  return (
    <Accordion<ModelCategoryKey>
      defaultOpenKeys="basic"
      items={[
        {
          key: 'basic',
          header: t.systemAssets.modelList.basicHeader,
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
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(MODEL_DRAG_MIME, m.key);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        className={[
                          'group overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/45',
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
                  'rounded-md border border-dashed border-[var(--border-subtle)]',
                  'bg-[var(--bg-elevated)]/30 p-3 text-xs text-[var(--text-muted)]'
                ].join(' ')}
              >
                {t.systemAssets.modelList.emptyBasic}
              </div>
            )
          )
        }
      ]}
    />
  );
}

