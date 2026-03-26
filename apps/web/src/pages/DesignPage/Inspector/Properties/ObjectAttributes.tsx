import { useCallback, useMemo, useState } from 'react';
import type { DefaultModelKey, ThreeEditor } from 'vizon-3d-core';
import { useLocale } from '../../../../hooks/useLocale';
import { basicModels } from '../../../../utils/models';
import { appMessages } from '../../../../i18n/messages';

type SelectedObjectInfo = {
  uuid: string;
  type: string;
  name: string;
} | null;

type AttributeItem = {
  label: string;
  paramKey: string;
  fallback?: unknown;
  format?: (v: unknown) => string;
};

const BASIC_MODEL_KEYS = new Set(basicModels.map((m) => m.key));

type ParamMeta = { min: number; max: number; step: number; integer: boolean };

/**
 * 几何体参数约束：
 * - 最小值：避免退化（例如半径/尺寸为 0，segments 为 0）
 * - 最大值：避免渲染/编辑瞬时重建 geometry 过重
 */
const PARAM_META: Record<string, ParamMeta> = {
  // Box / Plane / Cylinder / Cone 尺寸
  width: { min: 0.01, max: 100, step: 0.01, integer: false },
  height: { min: 0.01, max: 100, step: 0.01, integer: false },
  depth: { min: 0.01, max: 100, step: 0.01, integer: false },
  radius: { min: 0.01, max: 100, step: 0.01, integer: false },
  radiusTop: { min: 0.01, max: 100, step: 0.01, integer: false },
  radiusBottom: { min: 0.01, max: 100, step: 0.01, integer: false },
  tube: { min: 0.001, max: 50, step: 0.001, integer: false },

  // Segment 参数（必须为整数）
  segments: { min: 3, max: 256, step: 1, integer: true },
  widthSegments: { min: 3, max: 256, step: 1, integer: true },
  heightSegments: { min: 1, max: 128, step: 1, integer: true },
  radialSegments: { min: 3, max: 256, step: 1, integer: true },
  tubularSegments: { min: 3, max: 512, step: 1, integer: true },
  pathControlPoints: { min: 2, max: 32, step: 1, integer: true },

  // Torus 弧长
  arc: { min: 0.0, max: Math.PI * 2, step: 0.01, integer: false }
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatNumber(n: unknown) {
  if (typeof n === 'number') {
    if (!Number.isFinite(n)) return String(n);
    return (Math.round(n * 100) / 100).toString();
  }
  return String(n);
}

export function ObjectAttributes({
  editor,
  selectedInfo
}: {
  editor: ThreeEditor | null;
  selectedInfo: SelectedObjectInfo;
}) {
  const { locale } = useLocale();
  const inspectorT = appMessages[locale].designPage.inspector;
  const objAttrT = inspectorT.objectAttributes;

  const [refreshKey, setRefreshKey] = useState(0);

  const { modelKey, modelTitle, geometryType, attributes } = useMemo(() => {
    if (!editor || !selectedInfo?.uuid) {
      return { modelKey: null as DefaultModelKey | null, modelTitle: '', geometryType: '', attributes: null as AttributeItem[] | null };
    }

    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    const key = obj?.userData?.__vizonDefaultModelKey as DefaultModelKey | undefined;
    if (key && !BASIC_MODEL_KEYS.has(key)) {
      return { modelKey: null as DefaultModelKey | null, modelTitle: '', geometryType: '', attributes: null as AttributeItem[] | null };
    }
    const geometry = obj?.geometry as any;
    const parameters = geometry?.parameters as Record<string, unknown> | undefined;

    if (!key) {
      return { modelKey: null as DefaultModelKey | null, modelTitle: '', geometryType: geometry?.type ?? '', attributes: null as AttributeItem[] | null };
    }

    const SPECIAL_ATTRIBUTES_BY_MODEL: Record<DefaultModelKey, { title: string; items: AttributeItem[] }> = {
      cube: {
        title: objAttrT.models.cubeTitle,
        items: [
          { label: objAttrT.attributes.cube.widthLabel, paramKey: 'width', fallback: 1 },
          { label: objAttrT.attributes.cube.heightLabel, paramKey: 'height', fallback: 1 },
          { label: objAttrT.attributes.cube.depthLabel, paramKey: 'depth', fallback: 1 }
        ]
      },
      sphere: {
        title: objAttrT.models.sphereTitle,
        items: [
          { label: objAttrT.attributes.sphere.radiusLabel, paramKey: 'radius', fallback: 0.65 },
          { label: objAttrT.attributes.sphere.widthSegmentsLabel, paramKey: 'widthSegments', fallback: 32 },
          { label: objAttrT.attributes.sphere.heightSegmentsLabel, paramKey: 'heightSegments', fallback: 18 }
        ]
      },
      plane: {
        title: objAttrT.models.planeTitle,
        items: [
          { label: objAttrT.attributes.plane.widthLabel, paramKey: 'width', fallback: 2 },
          { label: objAttrT.attributes.plane.heightLabel, paramKey: 'height', fallback: 2 }
        ]
      },
      circular: {
        title: objAttrT.models.circularTitle,
        items: [
          { label: objAttrT.attributes.circular.radiusLabel, paramKey: 'radius', fallback: 0.75 },
          { label: objAttrT.attributes.circular.segmentsLabel, paramKey: 'segments', fallback: 32 }
        ]
      },
      cone: {
        title: objAttrT.models.coneTitle,
        items: [
          { label: objAttrT.attributes.cone.radiusLabel, paramKey: 'radius', fallback: 0.6 },
          { label: objAttrT.attributes.cone.heightLabel, paramKey: 'height', fallback: 1.2 },
          { label: objAttrT.attributes.cone.radialSegmentsLabel, paramKey: 'radialSegments', fallback: 24 },
          { label: objAttrT.attributes.cone.heightSegmentsLabel, paramKey: 'heightSegments', fallback: 1 }
        ]
      },
      cylinder: {
        title: objAttrT.models.cylinderTitle,
        items: [
          { label: objAttrT.attributes.cylinder.radiusTopLabel, paramKey: 'radiusTop', fallback: 0.55 },
          { label: objAttrT.attributes.cylinder.radiusBottomLabel, paramKey: 'radiusBottom', fallback: 0.55 },
          { label: objAttrT.attributes.cylinder.heightLabel, paramKey: 'height', fallback: 1.2 },
          { label: objAttrT.attributes.cylinder.radialSegmentsLabel, paramKey: 'radialSegments', fallback: 24 },
          { label: objAttrT.attributes.cylinder.heightSegmentsLabel, paramKey: 'heightSegments', fallback: 1 }
        ]
      },
      torus: {
        title: objAttrT.models.torusTitle,
        items: [
          { label: objAttrT.attributes.torus.radiusLabel, paramKey: 'radius', fallback: 0.55 },
          { label: objAttrT.attributes.torus.tubeLabel, paramKey: 'tube', fallback: 0.18 },
          { label: objAttrT.attributes.torus.radialSegmentsLabel, paramKey: 'radialSegments', fallback: 12 },
          { label: objAttrT.attributes.torus.tubularSegmentsLabel, paramKey: 'tubularSegments', fallback: 48 },
          {
            label: objAttrT.attributes.torus.arcLabel,
            paramKey: 'arc',
            fallback: 2 * Math.PI,
            format: (v) => {
              const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
              if (!Number.isFinite(n)) return String(v);
              return `${(n / Math.PI).toFixed(2)}π`;
            }
          }
        ]
      },
      theConduit: {
        title: objAttrT.models.theConduitTitle,
        items: [
          {
            label: objAttrT.attributes.theConduit.tubularSegmentsLabel,
            paramKey: 'tubularSegments',
            fallback: 20
          },
          { label: objAttrT.attributes.theConduit.radiusLabel, paramKey: 'radius', fallback: 0.14 },
          {
            label: objAttrT.attributes.theConduit.radialSegmentsLabel,
            paramKey: 'radialSegments',
            fallback: 12
          },
          {
            label: objAttrT.attributes.theConduit.closedLabel,
            paramKey: 'closed',
            fallback: false,
            format: (v) => (v ? objAttrT.yesLabel : objAttrT.noLabel)
          }
        ]
      }
    };

    const base = SPECIAL_ATTRIBUTES_BY_MODEL[key];

    // TubeGeometry：把 pathControlPoints 做成“派生属性”，避免直接展示 curve 对象。
    if (key === 'theConduit') {
      const path = parameters?.path as any;
      // 直线（LineCurve3）没有 points；曲线（CatmullRomCurve3）才有 points
      const controlPoints = Array.isArray(path?.points) ? path.points.length : 2;
      return { modelKey: key, modelTitle: base.title, geometryType: geometry?.type ?? '', attributes: base.items, controlPoints };
    }

    return { modelKey: key, modelTitle: base.title, geometryType: geometry?.type ?? '', attributes: base.items };
  }, [editor, selectedInfo?.uuid, locale, objAttrT]);

  const applyParam = useCallback(
    (paramKey: string, nextValue: unknown) => {
      if (!editor || !selectedInfo?.uuid || !modelKey || !modelTitle || !attributes) return;

      const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
      if (!obj?.geometry) return;

      const oldGeometry = obj.geometry as any;
      const parameters = (oldGeometry as any).parameters as Record<string, unknown> | undefined;
      const baseParams: Record<string, unknown> = parameters ? { ...parameters } : {};

      // 兜底：对数值参数进行范围裁剪，避免 UI 清空/异常导致 geometry 参数退化
      const meta = PARAM_META[paramKey];
      if (meta && typeof nextValue === 'number' && Number.isFinite(nextValue)) {
        const clamped = clamp(nextValue, meta.min, meta.max);
        baseParams[paramKey] = meta.integer ? Math.round(clamped) : clamped;
      } else {
        baseParams[paramKey] = nextValue;
      }

      let nextGeometry: any = null;

      switch (modelKey) {
        case 'cube': {
          nextGeometry = new (oldGeometry.constructor as any)(
            Number(baseParams.width ?? 1),
            Number(baseParams.height ?? 1),
            Number(baseParams.depth ?? 1)
          );
          break;
        }
        case 'sphere': {
          nextGeometry = new (oldGeometry.constructor as any)(
            Number(baseParams.radius ?? 0.65),
            Number(baseParams.widthSegments ?? 32),
            Number(baseParams.heightSegments ?? 18)
          );
          break;
        }
        case 'plane': {
          nextGeometry = new (oldGeometry.constructor as any)(Number(baseParams.width ?? 2), Number(baseParams.height ?? 2));
          break;
        }
        case 'circular': {
          nextGeometry = new (oldGeometry.constructor as any)(Number(baseParams.radius ?? 0.75), Number(baseParams.segments ?? 32));
          break;
        }
        case 'cone': {
          nextGeometry = new (oldGeometry.constructor as any)(
            Number(baseParams.radius ?? 0.6),
            Number(baseParams.height ?? 1.2),
            Number(baseParams.radialSegments ?? 24),
            Number(baseParams.heightSegments ?? 1)
          );
          break;
        }
        case 'cylinder': {
          nextGeometry = new (oldGeometry.constructor as any)(
            Number(baseParams.radiusTop ?? 0.55),
            Number(baseParams.radiusBottom ?? 0.55),
            Number(baseParams.height ?? 1.2),
            Number(baseParams.radialSegments ?? 24),
            Number(baseParams.heightSegments ?? 1)
          );
          break;
        }
        case 'torus': {
          nextGeometry = new (oldGeometry.constructor as any)(
            Number(baseParams.radius ?? 0.55),
            Number(baseParams.tube ?? 0.18),
            Number(baseParams.radialSegments ?? 12),
            Number(baseParams.tubularSegments ?? 48),
            Number(baseParams.arc ?? 2 * Math.PI)
          );
          break;
        }
        case 'theConduit': {
          const oldPath = (baseParams.path as any) ?? (parameters as any)?.path;
          const tubeGeometryCtor = oldGeometry.constructor as any;
          // 直线（LineCurve3）没有 points，直接复用即可；曲线（CatmullRomCurve3）则可用 points 重建
          const curve = Array.isArray(oldPath?.points) ? new (oldPath.constructor as any)(oldPath.points) : oldPath;
          if (!curve) return;

          nextGeometry = new tubeGeometryCtor(
            curve,
            Number(baseParams.tubularSegments ?? 20),
            Number(baseParams.radius ?? 0.14),
            Number(baseParams.radialSegments ?? 12),
            Boolean(baseParams.closed ?? false)
          );
          break;
        }
      }

      if (!nextGeometry) return;

      try {
        obj.geometry = nextGeometry;
      } finally {
        oldGeometry?.dispose?.();
      }
      obj.updateMatrixWorld?.(true);
      setRefreshKey((x) => x + 1);
    },
    [attributes, editor, modelKey, modelTitle, selectedInfo?.uuid]
  );

  if (!selectedInfo || !modelKey || !modelTitle || !attributes) {
    return (
      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 text-xs text-[var(--text-muted)] space-y-2">
        <div className="font-semibold text-[10px]">{objAttrT.header}</div>
        <div>{objAttrT.notDefaultText}</div>
      </div>
    );
  }

  const isConduit = modelKey === 'theConduit';

  const conduitEditEnabled = (() => {
    if (!editor || !selectedInfo?.uuid) return false;
    const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
    return Boolean(obj?.userData?.__vizonConduitEditEnabled);
  })();

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{objAttrT.modelTypeLabel}</span>
          <span className="text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{modelTitle}</span>
        </div>
        {geometryType ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{objAttrT.geometryTypeLabel}</span>
            <span className="text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">{geometryType}</span>
          </div>
        ) : null}
      </div>

      {isConduit ? (
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">
              {objAttrT.conduitEditToggleLabel}
            </span>
            <input
              type="checkbox"
              checked={conduitEditEnabled}
              onChange={(e) => {
                if (!editor || !selectedInfo?.uuid) return;
                const obj = editor.scene.getObjectByProperty('uuid', selectedInfo.uuid) as any;
                if (!obj) return;
                obj.userData = obj.userData ?? {};
                obj.userData.__vizonConduitEditEnabled = e.target.checked;
                // force rerender so toggle reflects immediately
                setRefreshKey((x) => x + 1);
                // re-emit selection sync (core controller listens on select)
                editor.select(obj);
              }}
              className="h-4 w-4"
            />
          </label>
        </div>
      ) : null}

      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 p-2 space-y-2">
        {(() => {
          // 这里重新读取 geometry.parameters，以便拿到最新 value。
          const obj = editor?.scene?.getObjectByProperty?.('uuid', selectedInfo.uuid) as any;
          const parameters = obj?.geometry?.parameters as Record<string, unknown> | undefined;

          return (
            <div className="space-y-2">
              {attributes.map((it) => {
                const getParamValue = () => {
                  if (it.paramKey === 'pathControlPoints') {
                    const path = parameters?.path as any;
                    return Array.isArray(path?.points) ? path.points.length : it.fallback;
                  }

                  return parameters?.[it.paramKey] ?? it.fallback;
                };

                const v = getParamValue();
                const num = typeof v === 'number' ? v : Number(v);
                const meta = PARAM_META[it.paramKey];
                const isInteger = meta?.integer ?? false;
                const min = meta?.min ?? 0;
                const max = meta?.max ?? 9999;
                const step = meta?.step ?? 0.01;
                const clampedCurrent = Number.isFinite(num) ? clamp(num, min, max) : min;

                return (
                  <div key={it.paramKey} className="space-y-1.5">
                    <label className="block text-[10px] font-semibold tracking-wide text-[var(--text-muted)]">{it.label}</label>
                    {it.paramKey === 'closed' ? (
                      <label className="flex cursor-pointer items-center justify-between gap-3">
                        <span className="text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                          {Boolean(v) ? objAttrT.yesLabel : objAttrT.noLabel}
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(v)}
                          onChange={(e) => applyParam(it.paramKey, e.target.checked)}
                          className="h-4 w-4"
                        />
                      </label>
                    ) : (
                      <input
                        key={`${it.paramKey}-${refreshKey}`}
                        type="number"
                        inputMode="decimal"
                        step={step}
                        min={min}
                        max={max}
                        defaultValue={clampedCurrent}
                        onBlur={(e) => {
                          const next = e.target.valueAsNumber;
                          if (!Number.isFinite(next)) {
                            // 不允许空值：回退到当前有效值
                            e.currentTarget.value = String(clampedCurrent);
                            return;
                          }

                          const clamped = clamp(next, min, max);
                          const applied = isInteger ? Math.round(clamped) : clamped;
                          e.currentTarget.value = String(applied);
                          applyParam(it.paramKey, applied);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.currentTarget.blur();
                        }}
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none transition-colors disabled:opacity-60 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

