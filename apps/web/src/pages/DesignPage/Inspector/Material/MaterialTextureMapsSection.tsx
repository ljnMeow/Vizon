/**
 * 材质贴图区渲染组件。
 *
 * 它只负责“按材质能力把各类贴图槽和强度控件排出来”，
 * 真正的状态读写、历史记录、禁用态缓存等逻辑都留在父组件中。
 */
import { loadEquirectEnvMapTextureFromFile, loadImageTextureFromFile } from 'vizon-3d-core';
import { type TextureMeta } from '../../../../api/textures';
import { categoryFromTextureSlot } from '../../../../utils/textureCategoryMap';
import { TextureMapItem, type TextureMapItemLabels } from './TextureMapItem';

/** 局部声明的贴图字段 key 类型（与 materialConstants.ts 保持同步，避免循环依赖） */
type TextureFieldKey =
  | 'map' | 'envMap' | 'alphaMap' | 'lightMap' | 'aoMap' | 'specularMap' | 'emissiveMap'
  | 'bumpMap' | 'normalMap' | 'displacementMap' | 'roughnessMap' | 'metalnessMap'
  | 'gradientMap' | 'anisotropyMap' | 'clearcoatMap' | 'clearcoatRoughnessMap'
  | 'clearcoatNormalMap' | 'iridescenceMap' | 'iridescenceThicknessMap'
  | 'sheenColorMap' | 'sheenRoughnessMap' | 'transmissionMap' | 'thicknessMap'
  | 'specularIntensityMap' | 'specularColorMap';

type TextureSupport = Partial<Record<TextureFieldKey, true>>;

/** 颜色贴图：允许 PNG/JPEG/WebP */
const ACCEPT_COLOR = 'image/png,image/jpeg,image/webp';
/** 数据贴图：仅允许 PNG（无损，避免压缩伪影） */
const ACCEPT_DATA = 'image/png';
/** 颜色贴图格式提示 */
const HINT_COLOR = 'PNG / JPEG / WebP';
/** 数据贴图格式提示 */
const HINT_DATA = 'PNG only';

/** 每个 fieldKey 对应的 accept 和格式提示 */
const FIELD_ACCEPT: Record<TextureFieldKey, { accept: string; hint: string }> = {
  // 颜色贴图
  map: { accept: ACCEPT_COLOR, hint: HINT_COLOR },
  emissiveMap: { accept: ACCEPT_COLOR, hint: HINT_COLOR },
  sheenColorMap: { accept: ACCEPT_COLOR, hint: HINT_COLOR },
  specularColorMap: { accept: ACCEPT_COLOR, hint: HINT_COLOR },
  iridescenceMap: { accept: ACCEPT_COLOR, hint: HINT_COLOR },
  envMap: { accept: ACCEPT_COLOR, hint: HINT_COLOR },
  // 数据贴图
  alphaMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  lightMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  aoMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  bumpMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  normalMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  displacementMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  roughnessMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  metalnessMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  specularMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  gradientMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  clearcoatNormalMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  clearcoatMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  clearcoatRoughnessMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  transmissionMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  thicknessMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  iridescenceThicknessMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  sheenRoughnessMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  anisotropyMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
  specularIntensityMap: { accept: ACCEPT_DATA, hint: HINT_DATA },
};

/**
 * 贴图区 Section 的 props 定义。
 * 贴图按 Basic / Lighting / Normal / PBR / Advanced 五组渲染，每组按材质类型的白名单控制可见性。
 */
type MaterialTextureMapsSectionProps = {
  p: any; tf: any; textureSupport: TextureSupport; textureMapLabels: TextureMapItemLabels;
  hasTextureGroupBasic: boolean; hasTextureGroupLighting: boolean; hasTextureGroupNormal: boolean; hasTextureGroupPbr: boolean; hasTextureGroupAdvanced: boolean;
  selectedEnvMapIntensity: number; setSelectedEnvMapIntensity: (v: number) => void;
  /** 不同材质类型下，环境反射强度实际写入的字段可能不同。 */
  envMapIntensityPropertyKey: string;
  /** 不同字段的合理范围不同：PBR 常用 0~5，reflectivity 常用 0~1。 */
  envMapIntensityMax: number;
  selectedAoMapIntensity: number; setSelectedAoMapIntensity: (v: number) => void;
  selectedNormalScale: { x: number; y: number }; setSelectedNormalScale: (v: { x: number; y: number }) => void;
  selectedClearcoatNormalScale: { x: number; y: number }; setSelectedClearcoatNormalScale: (v: { x: number; y: number }) => void;
  getTextureForUi: (k: TextureFieldKey) => any | null;
  makeTextureDebugToggle: (k: TextureFieldKey) => { label: string; checked: boolean; onChange: (checked: boolean) => void };
  makeTextureUploadHandler: (k: TextureFieldKey, loader: (f: File) => Promise<any>) => (f: File) => Promise<void>;
  makeTextureSelectFromLibraryHandler: (k: TextureFieldKey, loader: (f: File) => Promise<any>) => (meta: TextureMeta) => Promise<void>;
  makeTextureClearHandler: (k: TextureFieldKey) => () => void;
  onPropertyChange: (key: string, value: any) => void;
};

/**
 * 材质贴图映射区，包含 BaseColor、环境贴图、光照贴图、法线贴图、PBR 及物理扩展贴图。
 * 仅在当前材质支持对应贴图槽时才渲染该组（white-list 由 textureSupportByMaterialType 提供）。
 */
export function MaterialTextureMapsSection({
  p, tf, textureSupport, textureMapLabels, hasTextureGroupBasic, hasTextureGroupLighting, hasTextureGroupNormal, hasTextureGroupPbr, hasTextureGroupAdvanced,
  selectedEnvMapIntensity, setSelectedEnvMapIntensity, envMapIntensityPropertyKey, envMapIntensityMax, selectedAoMapIntensity, setSelectedAoMapIntensity,
  selectedNormalScale, setSelectedNormalScale, selectedClearcoatNormalScale, setSelectedClearcoatNormalScale,
  getTextureForUi, makeTextureDebugToggle, makeTextureUploadHandler, makeTextureSelectFromLibraryHandler, makeTextureClearHandler, onPropertyChange,
}: MaterialTextureMapsSectionProps) {
  return (
    <div className="space-y-2 pt-4">
      {/* 仅在当前材质存在至少一个可用贴图槽时才渲染本区块 */}
      <div className="text-[11px] font-semibold tracking-wide text-[var(--text-muted)]">{p.materialTextureMapsTitle}</div>
      <div className="space-y-3">
        {/* 基础贴图组：BaseColor / 环境 / 透明相关 */}
        {hasTextureGroupBasic ? <div className="space-y-2"><div className="text-[10px] font-semibold tracking-wide text-[var(--text-secondary)]">{p.materialTextureMapsGroupBasic}</div>
          {textureSupport.map ? <TextureMapItem labels={textureMapLabels} title={tf.map} texture={getTextureForUi('map')} debugToggle={makeTextureDebugToggle('map')} onUpload={makeTextureUploadHandler('map', loadImageTextureFromFile)} category={categoryFromTextureSlot('map')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('map', loadImageTextureFromFile)} onClear={makeTextureClearHandler('map')} accept={FIELD_ACCEPT.map.accept} formatHint={FIELD_ACCEPT.map.hint} /> : null}
          {textureSupport.envMap ? <TextureMapItem labels={textureMapLabels} title={tf.envMap} texture={getTextureForUi('envMap')} debugToggle={makeTextureDebugToggle('envMap')} onUpload={makeTextureUploadHandler('envMap', loadEquirectEnvMapTextureFromFile)} category={categoryFromTextureSlot('envMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('envMap', loadEquirectEnvMapTextureFromFile)} onClear={makeTextureClearHandler('envMap')} accept={FIELD_ACCEPT.envMap.accept} formatHint={FIELD_ACCEPT.envMap.hint} intensity={{ type: 'number', label: p.materialTexturePropEnvMapIntensity, value: selectedEnvMapIntensity, min: 0, max: envMapIntensityMax, step: 0.01, onDragStart: () => onPropertyChange(`${envMapIntensityPropertyKey}__dragStart`, selectedEnvMapIntensity), onPreviewChange: (v) => { setSelectedEnvMapIntensity(v); onPropertyChange(`${envMapIntensityPropertyKey}__preview`, v); }, onCommit: (v) => { setSelectedEnvMapIntensity(v); onPropertyChange(envMapIntensityPropertyKey, v); } }} /> : null}
          {textureSupport.alphaMap ? <TextureMapItem labels={textureMapLabels} title={tf.alphaMap} texture={getTextureForUi('alphaMap')} debugToggle={makeTextureDebugToggle('alphaMap')} onUpload={makeTextureUploadHandler('alphaMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('alphaMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('alphaMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('alphaMap')} accept={FIELD_ACCEPT.alphaMap.accept} formatHint={FIELD_ACCEPT.alphaMap.hint} /> : null}
        </div> : null}
        {/* 光照贴图组：light/ao/emissive 等与光照表现相关 */}
        {hasTextureGroupLighting ? <div className="space-y-2"><div className="text-[10px] font-semibold tracking-wide text-[var(--text-secondary)]">{p.materialTextureMapsGroupLighting}</div>
          {textureSupport.lightMap ? <TextureMapItem labels={textureMapLabels} title={tf.lightMap} texture={getTextureForUi('lightMap')} debugToggle={makeTextureDebugToggle('lightMap')} onUpload={makeTextureUploadHandler('lightMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('lightMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('lightMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('lightMap')} accept={FIELD_ACCEPT.lightMap.accept} formatHint={FIELD_ACCEPT.lightMap.hint} /> : null}
          {textureSupport.aoMap ? <TextureMapItem labels={textureMapLabels} title={tf.aoMap} texture={getTextureForUi('aoMap')} debugToggle={makeTextureDebugToggle('aoMap')} onUpload={makeTextureUploadHandler('aoMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('aoMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('aoMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('aoMap')} accept={FIELD_ACCEPT.aoMap.accept} formatHint={FIELD_ACCEPT.aoMap.hint} intensity={{ type: 'number', label: p.materialTexturePropAoMapIntensity, value: selectedAoMapIntensity, min: 0, max: 1, step: 0.01, onDragStart: () => onPropertyChange('aoMapIntensity__dragStart', selectedAoMapIntensity), onPreviewChange: (v) => { setSelectedAoMapIntensity(v); onPropertyChange('aoMapIntensity__preview', v); }, onCommit: (v) => { setSelectedAoMapIntensity(v); onPropertyChange('aoMapIntensity', v); } }} /> : null}
          {textureSupport.emissiveMap ? <TextureMapItem labels={textureMapLabels} title={tf.emissiveMap} texture={getTextureForUi('emissiveMap')} debugToggle={makeTextureDebugToggle('emissiveMap')} onUpload={makeTextureUploadHandler('emissiveMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('emissiveMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('emissiveMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('emissiveMap')} accept={FIELD_ACCEPT.emissiveMap.accept} formatHint={FIELD_ACCEPT.emissiveMap.hint} /> : null}
        </div> : null}
        {/* 法线形变组：normal/bump/displacement */}
        {hasTextureGroupNormal ? <div className="space-y-2"><div className="text-[10px] font-semibold tracking-wide text-[var(--text-secondary)]">{p.materialTextureMapsGroupNormal}</div>
          {textureSupport.bumpMap ? <TextureMapItem labels={textureMapLabels} title={tf.bumpMap} texture={getTextureForUi('bumpMap')} debugToggle={makeTextureDebugToggle('bumpMap')} onUpload={makeTextureUploadHandler('bumpMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('bumpMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('bumpMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('bumpMap')} accept={FIELD_ACCEPT.bumpMap.accept} formatHint={FIELD_ACCEPT.bumpMap.hint} /> : null}
          {textureSupport.normalMap ? <TextureMapItem labels={textureMapLabels} title={tf.normalMap} texture={getTextureForUi('normalMap')} debugToggle={makeTextureDebugToggle('normalMap')} onUpload={makeTextureUploadHandler('normalMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('normalMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('normalMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('normalMap')} accept={FIELD_ACCEPT.normalMap.accept} formatHint={FIELD_ACCEPT.normalMap.hint} intensity={{ type: 'vector2', labelX: p.materialTexturePropNormalScaleX, labelY: p.materialTexturePropNormalScaleY, value: selectedNormalScale, minX: 0, maxX: 5, stepX: 0.01, minY: 0, maxY: 5, stepY: 0.01, onDragStart: () => onPropertyChange('normalScale__dragStart', selectedNormalScale), onPreviewChange: (v) => { setSelectedNormalScale(v); onPropertyChange('normalScale__preview', v); }, onCommit: (v) => { setSelectedNormalScale(v); onPropertyChange('normalScale', v); } }} /> : null}
          {textureSupport.displacementMap ? <TextureMapItem labels={textureMapLabels} title={tf.displacementMap} texture={getTextureForUi('displacementMap')} debugToggle={makeTextureDebugToggle('displacementMap')} onUpload={makeTextureUploadHandler('displacementMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('displacementMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('displacementMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('displacementMap')} accept={FIELD_ACCEPT.displacementMap.accept} formatHint={FIELD_ACCEPT.displacementMap.hint} /> : null}
        </div> : null}
        {/* PBR 基础组：粗糙度/金属度 */}
        {hasTextureGroupPbr ? <div className="space-y-2"><div className="text-[10px] font-semibold tracking-wide text-[var(--text-secondary)]">{p.materialTextureMapsGroupPbr}</div>
          {textureSupport.roughnessMap ? <TextureMapItem labels={textureMapLabels} title={tf.roughnessMap} texture={getTextureForUi('roughnessMap')} debugToggle={makeTextureDebugToggle('roughnessMap')} onUpload={makeTextureUploadHandler('roughnessMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('roughnessMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('roughnessMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('roughnessMap')} accept={FIELD_ACCEPT.roughnessMap.accept} formatHint={FIELD_ACCEPT.roughnessMap.hint} /> : null}
          {textureSupport.metalnessMap ? <TextureMapItem labels={textureMapLabels} title={tf.metalnessMap} texture={getTextureForUi('metalnessMap')} debugToggle={makeTextureDebugToggle('metalnessMap')} onUpload={makeTextureUploadHandler('metalnessMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('metalnessMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('metalnessMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('metalnessMap')} accept={FIELD_ACCEPT.metalnessMap.accept} formatHint={FIELD_ACCEPT.metalnessMap.hint} /> : null}
        </div> : null}
        {/* 高级物理组：仅 Physical 材质下展示 */}
        {hasTextureGroupAdvanced ? <div className="space-y-2"><div className="text-[10px] font-semibold tracking-wide text-[var(--text-secondary)]">{p.materialTextureMapsGroupAdvanced}</div>
          {textureSupport.clearcoatNormalMap ? <TextureMapItem labels={textureMapLabels} title={tf.clearcoatNormalMap} texture={getTextureForUi('clearcoatNormalMap')} debugToggle={makeTextureDebugToggle('clearcoatNormalMap')} onUpload={makeTextureUploadHandler('clearcoatNormalMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('clearcoatNormalMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('clearcoatNormalMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('clearcoatNormalMap')} accept={FIELD_ACCEPT.clearcoatNormalMap.accept} formatHint={FIELD_ACCEPT.clearcoatNormalMap.hint} intensity={{ type: 'vector2', labelX: p.materialTexturePropClearcoatNormalScaleX, labelY: p.materialTexturePropClearcoatNormalScaleY, value: selectedClearcoatNormalScale, minX: 0, maxX: 5, stepX: 0.01, minY: 0, maxY: 5, stepY: 0.01, onDragStart: () => onPropertyChange('clearcoatNormalScale__dragStart', selectedClearcoatNormalScale), onPreviewChange: (v) => { setSelectedClearcoatNormalScale(v); onPropertyChange('clearcoatNormalScale__preview', v); }, onCommit: (v) => { setSelectedClearcoatNormalScale(v); onPropertyChange('clearcoatNormalScale', v); } }} /> : null}
          {textureSupport.clearcoatMap ? <TextureMapItem labels={textureMapLabels} title={tf.clearcoatMap} texture={getTextureForUi('clearcoatMap')} debugToggle={makeTextureDebugToggle('clearcoatMap')} onUpload={makeTextureUploadHandler('clearcoatMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('clearcoatMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('clearcoatMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('clearcoatMap')} accept={FIELD_ACCEPT.clearcoatMap.accept} formatHint={FIELD_ACCEPT.clearcoatMap.hint} /> : null}
          {textureSupport.clearcoatRoughnessMap ? <TextureMapItem labels={textureMapLabels} title={tf.clearcoatRoughnessMap} texture={getTextureForUi('clearcoatRoughnessMap')} debugToggle={makeTextureDebugToggle('clearcoatRoughnessMap')} onUpload={makeTextureUploadHandler('clearcoatRoughnessMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('clearcoatRoughnessMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('clearcoatRoughnessMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('clearcoatRoughnessMap')} accept={FIELD_ACCEPT.clearcoatRoughnessMap.accept} formatHint={FIELD_ACCEPT.clearcoatRoughnessMap.hint} /> : null}
          {textureSupport.transmissionMap ? <TextureMapItem labels={textureMapLabels} title={tf.transmissionMap} texture={getTextureForUi('transmissionMap')} debugToggle={makeTextureDebugToggle('transmissionMap')} onUpload={makeTextureUploadHandler('transmissionMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('transmissionMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('transmissionMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('transmissionMap')} accept={FIELD_ACCEPT.transmissionMap.accept} formatHint={FIELD_ACCEPT.transmissionMap.hint} /> : null}
          {textureSupport.thicknessMap ? <TextureMapItem labels={textureMapLabels} title={tf.thicknessMap} texture={getTextureForUi('thicknessMap')} debugToggle={makeTextureDebugToggle('thicknessMap')} onUpload={makeTextureUploadHandler('thicknessMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('thicknessMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('thicknessMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('thicknessMap')} accept={FIELD_ACCEPT.thicknessMap.accept} formatHint={FIELD_ACCEPT.thicknessMap.hint} /> : null}
          {textureSupport.iridescenceMap ? <TextureMapItem labels={textureMapLabels} title={tf.iridescenceMap} texture={getTextureForUi('iridescenceMap')} debugToggle={makeTextureDebugToggle('iridescenceMap')} onUpload={makeTextureUploadHandler('iridescenceMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('iridescenceMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('iridescenceMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('iridescenceMap')} accept={FIELD_ACCEPT.iridescenceMap.accept} formatHint={FIELD_ACCEPT.iridescenceMap.hint} /> : null}
          {textureSupport.iridescenceThicknessMap ? <TextureMapItem labels={textureMapLabels} title={tf.iridescenceThicknessMap} texture={getTextureForUi('iridescenceThicknessMap')} debugToggle={makeTextureDebugToggle('iridescenceThicknessMap')} onUpload={makeTextureUploadHandler('iridescenceThicknessMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('iridescenceThicknessMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('iridescenceThicknessMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('iridescenceThicknessMap')} accept={FIELD_ACCEPT.iridescenceThicknessMap.accept} formatHint={FIELD_ACCEPT.iridescenceThicknessMap.hint} /> : null}
          {textureSupport.sheenColorMap ? <TextureMapItem labels={textureMapLabels} title={tf.sheenColorMap} texture={getTextureForUi('sheenColorMap')} debugToggle={makeTextureDebugToggle('sheenColorMap')} onUpload={makeTextureUploadHandler('sheenColorMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('sheenColorMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('sheenColorMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('sheenColorMap')} accept={FIELD_ACCEPT.sheenColorMap.accept} formatHint={FIELD_ACCEPT.sheenColorMap.hint} /> : null}
          {textureSupport.sheenRoughnessMap ? <TextureMapItem labels={textureMapLabels} title={tf.sheenRoughnessMap} texture={getTextureForUi('sheenRoughnessMap')} debugToggle={makeTextureDebugToggle('sheenRoughnessMap')} onUpload={makeTextureUploadHandler('sheenRoughnessMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('sheenRoughnessMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('sheenRoughnessMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('sheenRoughnessMap')} accept={FIELD_ACCEPT.sheenRoughnessMap.accept} formatHint={FIELD_ACCEPT.sheenRoughnessMap.hint} /> : null}
          {textureSupport.anisotropyMap ? <TextureMapItem labels={textureMapLabels} title={tf.anisotropyMap} texture={getTextureForUi('anisotropyMap')} debugToggle={makeTextureDebugToggle('anisotropyMap')} onUpload={makeTextureUploadHandler('anisotropyMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('anisotropyMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('anisotropyMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('anisotropyMap')} accept={FIELD_ACCEPT.anisotropyMap.accept} formatHint={FIELD_ACCEPT.anisotropyMap.hint} /> : null}
          {textureSupport.specularIntensityMap ? <TextureMapItem labels={textureMapLabels} title={tf.specularIntensityMap} texture={getTextureForUi('specularIntensityMap')} debugToggle={makeTextureDebugToggle('specularIntensityMap')} onUpload={makeTextureUploadHandler('specularIntensityMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('specularIntensityMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('specularIntensityMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('specularIntensityMap')} accept={FIELD_ACCEPT.specularIntensityMap.accept} formatHint={FIELD_ACCEPT.specularIntensityMap.hint} /> : null}
          {textureSupport.specularColorMap ? <TextureMapItem labels={textureMapLabels} title={tf.specularColorMap} texture={getTextureForUi('specularColorMap')} debugToggle={makeTextureDebugToggle('specularColorMap')} onUpload={makeTextureUploadHandler('specularColorMap', loadImageTextureFromFile)} category={categoryFromTextureSlot('specularColorMap')} onSelectFromLibrary={makeTextureSelectFromLibraryHandler('specularColorMap', loadImageTextureFromFile)} onClear={makeTextureClearHandler('specularColorMap')} accept={FIELD_ACCEPT.specularColorMap.accept} formatHint={FIELD_ACCEPT.specularColorMap.hint} /> : null}
        </div> : null}
      </div>
    </div>
  );
}
