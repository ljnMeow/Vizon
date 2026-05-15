/**
 * 项目包导入导出辅助工具。
 *
 * 项目包职责：
 * - 把当前场景文档序列化成 `scene.json`
 * - 收集场景里实际引用到的全部贴图资产
 * - 同时保留“当前启用”和“已配置但当前关闭”的贴图
 * - 在导入时恢复材质绑定关系与禁用态缓存
 *
 * 项目包结构：
 * - `scene.json`
 * - `assets/textures/<asset-id>.<ext>`
 */
import { importDocument, loadEquirectEnvMapTextureFromFile, loadImageTextureFromFile, type ThreeEditor, type VizonDocument } from 'vizon-3d-core';
import { allTextureFieldKeys, type TextureFieldKey } from '../pages/DesignPage/Inspector/Material/materialConstants';
import {
  attachTextureAssetRef,
  cacheTextureAssetFile,
  getAssetExtension,
  getCachedTextureAsset,
  getCachedTextureAssetBytes,
  getTextureAssetRef
} from './textureAssetSession';
import { WEB_USER_DATA_KEYS } from './keys';
import { createZip, parseZip } from './zipStore';

/** 记录在项目包清单中的单个贴图资产项。 */
type BundleTextureAsset = {
  id: string;
  path: string;
  originalName: string;
  mimeType: string;
  size: number;
  lastModified: number;
};

/** 一条对象 / 材质槽位 到 贴图资产 id 的绑定记录。 */
type BundleTextureBinding = {
  objectId: string;
  materialIndex: number;
  fieldKey: TextureFieldKey;
  assetId: string;
};

/** 嵌入到场景文档中的贴图清单载荷。 */
type BundleTexturesPayload = {
  items: Record<string, BundleTextureAsset>;
  bindings: BundleTextureBinding[];
  environmentHdriAssetId?: string;
};

/** 在原始场景文档上扩展出的、带 web 侧贴图元数据的文档类型。 */
type BundleDocument = VizonDocument & {
  assets?: VizonDocument['assets'] & {
    textures?: BundleTexturesPayload;
  };
};

/** 将对象编码为 JSON 字节。最小化输出以减小包体积，调试时可直接 JSON.parse 查看。 */
function encodeJson(input: unknown) {
  return new TextEncoder().encode(JSON.stringify(input));
}

/** 从解包后的字节中恢复 JSON 对象。 */
function decodeJson<T>(bytes: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/** 根据材质贴图槽位选择正确的贴图加载器。 */
function getTextureLoader(fieldKey: TextureFieldKey) {
  return fieldKey === 'envMap' ? loadEquirectEnvMapTextureFromFile : loadImageTextureFromFile;
}

function toBundleTextureAsset(ref: {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  lastModified: number;
}): BundleTextureAsset {
  return {
    id: ref.id,
    path: `assets/textures/${ref.id}.${getAssetExtension(ref)}`,
    originalName: ref.originalName,
    mimeType: ref.mimeType,
    size: ref.size,
    lastModified: ref.lastModified
  };
}

async function ensureEnvironmentHdriAsset(
  hdri: VizonDocument['environment']['hdri']
): Promise<
  | {
      asset: BundleTextureAsset;
      assetId: string;
    }
  | null
> {
  if (hdri.type !== 'uploaded') return null;

  const existingAssetId = typeof hdri.assetId === 'string' ? hdri.assetId : null;
  if (existingAssetId) {
    const cached = getCachedTextureAsset(existingAssetId);
    if (cached) {
      return {
        asset: toBundleTextureAsset(cached),
        assetId: cached.id
      };
    }
  }

  if (!hdri.url) return null;

  const response = await fetch(hdri.url);
  const blob = await response.blob();
  const originalName = hdri.fileName?.trim() || 'environment-map';
  const textureFile = new File([blob], originalName, {
    type: hdri.mimeType || blob.type || 'application/octet-stream',
    lastModified: Date.now()
  });
  const ref = await cacheTextureAssetFile(textureFile, existingAssetId ?? undefined);
  return {
    asset: toBundleTextureAsset(ref),
    assetId: ref.id
  };
}

/** 把 `object.material` 统一规整成数组，兼容单材质和多材质对象。 */
function getMaterials(object: unknown): any[] {
  const material = (object as { material?: any } | null)?.material;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

/**
 * 遍历场景并收集项目包所需的全部贴图资产。
 *
 * 数据来源：
 * - 启用态贴图直接来自 `material[fieldKey]`
 * - 已配置但禁用的贴图来自 `TEXTURE_BINDINGS` 与会话缓存的组合
 */
async function buildBundleTexturePayload(editor: ThreeEditor, document: BundleDocument): Promise<BundleTexturesPayload> {
  const items: Record<string, BundleTextureAsset> = {};
  const bindings: BundleTextureBinding[] = [];
  let environmentHdriAssetId: string | undefined;

  const hdriAsset = await ensureEnvironmentHdriAsset(document.environment.hdri);
  if (hdriAsset) {
    items[hdriAsset.assetId] ??= hdriAsset.asset;
    environmentHdriAssetId = hdriAsset.assetId;
    const hdri = document.environment.hdri;
    // ensureEnvironmentHdriAsset 仅在 uploaded 时返回非 null；此处收窄以便符合 SceneSettingsHdri
    if (hdri.type === 'uploaded') {
      document.environment = {
        ...document.environment,
        hdri: {
          ...hdri,
          assetId: hdriAsset.assetId,
          fileName: hdriAsset.asset.originalName,
          mimeType: hdriAsset.asset.mimeType
        }
      };
    }
  }

  editor.scene.traverse((object: any) => {
    const materials = getMaterials(object);
    if (materials.length === 0) return;

    materials.forEach((material, materialIndex) => {
      allTextureFieldKeys.forEach((fieldKey) => {
        const texture = material?.[fieldKey];
        const ref =
          getTextureAssetRef(texture) ??
          (() => {
            // 禁用态槽位会把材质字段清成 `null`，因此导出时必须从绑定表和会话资产仓库里反查元数据。
            const assetId = material?.userData?.[WEB_USER_DATA_KEYS.MATERIAL.TEXTURE_BINDINGS]?.[fieldKey];
            if (typeof assetId !== 'string') return null;
            const cached = getCachedTextureAsset(assetId);
            if (!cached) return null;
            return {
              id: cached.id,
              originalName: cached.originalName,
              mimeType: cached.mimeType,
              size: cached.size,
              lastModified: cached.lastModified
            };
          })();
        if (!ref) return;

        items[ref.id] ??= toBundleTextureAsset(ref);
        bindings.push({
          objectId: object.uuid,
          materialIndex,
          fieldKey,
          assetId: ref.id
        });
      });
    });
  });

  return { items, bindings, environmentHdriAssetId };
}

/**
 * 基于当前编辑器状态构建一个项目包。
 *
 * 步骤：
 * 1. 向 core 读取当前场景文档
 * 2. 挂上 web 侧贴图资产清单
 * 3. 读取会话缓存里的贴图字节并打成 Store 模式 zip
 */
export async function buildProjectBundle(editor: ThreeEditor, options?: { generator?: string }) {
  const document = editor.getVizonDocument({ generator: options?.generator }) as BundleDocument;
  const texturesPayload = await buildBundleTexturePayload(editor, document);

  document.assets = {
    ...(document.assets ?? {}),
    textures: texturesPayload
  };

  const entries: Array<{ path: string; data: Uint8Array; lastModified?: number; compress?: boolean }> = [
    {
      path: 'scene.json',
      data: encodeJson(document),
      // 文本 JSON 压缩效果显著（约 70-80%），贴图已是压缩格式无需再压
      compress: true
    }
  ];

  const assets = Object.values(texturesPayload.items);
  for (const asset of assets) {
    const bytes = await getCachedTextureAssetBytes(asset.id);
    if (!bytes) {
      throw new Error(`Missing cached texture asset: ${asset.originalName}`);
    }
    entries.push({
      path: asset.path,
      data: bytes,
      lastModified: asset.lastModified
    });
  }

  const zipBytes = createZip(entries);
  return {
    document,
    blob: new Blob([zipBytes], { type: 'application/zip' })
  };
}

/**
 * 把一个项目包导入到编辑器中。
 *
 * 步骤：
 * 1. 先恢复 `scene.json`
 * 2. 再用项目包里的资产重建贴图文件
 * 3. 按对象 / 材质绑定关系把贴图重新挂回去
 * 4. 如果槽位本来是禁用态，则只恢复缓存，不直接启用
 */
export async function importProjectBundle(editor: ThreeEditor, file: File, onProgress?: (percent: number) => void) {
  const zipBytes = new Uint8Array(await file.arrayBuffer());
  const entries = parseZip(zipBytes);
  onProgress?.(5);
  const sceneBytes = entries.get('scene.json');
  if (!sceneBytes) {
    throw new Error('Bundle is missing scene.json.');
  }

  const document = decodeJson<BundleDocument>(sceneBytes);
  const texturesPayload = document.assets?.textures;
  let importedHdriObjectUrl: string | null = null;

  if (texturesPayload?.environmentHdriAssetId && document.environment?.hdri?.type === 'uploaded') {
    const asset = texturesPayload.items[texturesPayload.environmentHdriAssetId];
    if (asset) {
      const assetBytes = entries.get(asset.path);
      if (!assetBytes) {
        throw new Error(`Bundle is missing texture asset: ${asset.path}`);
      }

      const fileBytes = new Uint8Array(assetBytes.byteLength);
      fileBytes.set(assetBytes);
      const hdriFile = new File([fileBytes], asset.originalName, {
        type: asset.mimeType,
        lastModified: asset.lastModified
      });
      const ref = await cacheTextureAssetFile(hdriFile, asset.id);
      importedHdriObjectUrl = URL.createObjectURL(hdriFile);
      document.environment = {
        ...document.environment,
        hdri: {
          ...document.environment.hdri,
          assetId: ref.id,
          url: importedHdriObjectUrl,
          fileName: asset.originalName,
          mimeType: asset.mimeType
        }
      };
    }
  } else if (document.environment?.hdri?.type === 'uploaded') {
    document.environment = {
      ...document.environment,
      hdri: { type: 'none' }
    };
  }

  await importDocument(editor, document);
  onProgress?.(40);

  if (!texturesPayload) {
    editor.render();
    onProgress?.(100);
    return;
  }

  const total = texturesPayload.bindings.length;
  for (let i = 0; i < total; i++) {
    const binding = texturesPayload.bindings[i];
    const asset = texturesPayload.items[binding.assetId];
    if (!asset) continue;

    const assetBytes = entries.get(asset.path);
    if (!assetBytes) {
      throw new Error(`Bundle is missing texture asset: ${asset.path}`);
    }

    const object = editor.scene.getObjectByProperty('uuid', binding.objectId);
    if (!object) continue;

    const materials = getMaterials(object);
    const material = materials[binding.materialIndex];
    if (!material) continue;

    // 复制成一个普通 ArrayBuffer-backed 视图，避免解包结果来自 SharedArrayBuffer 类来源时
    // 与 File 构造器的类型兼容性产生问题。
    const fileBytes = new Uint8Array(assetBytes.byteLength);
    fileBytes.set(assetBytes);
    const textureFile = new File([fileBytes], asset.originalName, {
      type: asset.mimeType,
      lastModified: asset.lastModified
    });
    const ref = await cacheTextureAssetFile(textureFile, asset.id);
    const texture = await getTextureLoader(binding.fieldKey)(textureFile);
    attachTextureAssetRef(texture as { name?: string; userData?: Record<string, unknown> }, ref);
    const disabledMap = material?.userData?.[WEB_USER_DATA_KEYS.MATERIAL.TEXTURE_EFFECT_DISABLED] ?? {};
    if (disabledMap?.[binding.fieldKey] === true) {
      // 禁用态槽位需要保持视觉上关闭，因此这里只恢复缓存，不立即写回活动材质字段。
      material.userData ??= {};
      (material.userData[WEB_USER_DATA_KEYS.MATERIAL.TEXTURE_EFFECT_CACHE] ??= {})[binding.fieldKey] = texture;
    } else {
      material[binding.fieldKey] = texture;
    }
    // 无论当前是否启用，都要重新登记槽位到资产 id 的绑定，
    // 这样后续再次导出时，即使槽位保持禁用态，也仍然能找到对应资源。
    (material.userData ??= {});
    (material.userData[WEB_USER_DATA_KEYS.MATERIAL.TEXTURE_BINDINGS] ??= {})[binding.fieldKey] = asset.id;
    material.needsUpdate = true;
    // 每张贴图加载完成后上报进度：贴图阶段占总进度的 40-95%
    onProgress?.(Math.round(40 + ((i + 1) / total) * 55));
  }

  editor.render();
  onProgress?.(100);
}
