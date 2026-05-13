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
import { createStoredZip, parseStoredZip } from './zipStore';

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
};

/** 在原始场景文档上扩展出的、带 web 侧贴图元数据的文档类型。 */
type BundleDocument = VizonDocument & {
  assets?: VizonDocument['assets'] & {
    textures?: BundleTexturesPayload;
  };
};

/** 以稳定缩进格式编码 JSON，便于直接检查导出的 `scene.json`。 */
function encodeJson(input: unknown) {
  return new TextEncoder().encode(JSON.stringify(input, null, 2));
}

/** 从解包后的字节中恢复 JSON 对象。 */
function decodeJson<T>(bytes: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

/** 根据材质贴图槽位选择正确的贴图加载器。 */
function getTextureLoader(fieldKey: TextureFieldKey) {
  return fieldKey === 'envMap' ? loadEquirectEnvMapTextureFromFile : loadImageTextureFromFile;
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
function buildBundleTexturePayload(editor: ThreeEditor): BundleTexturesPayload {
  const items: Record<string, BundleTextureAsset> = {};
  const bindings: BundleTextureBinding[] = [];

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

        const assetPath = `assets/textures/${ref.id}.${getAssetExtension(ref)}`;
        items[ref.id] ??= {
          id: ref.id,
          path: assetPath,
          originalName: ref.originalName,
          mimeType: ref.mimeType,
          size: ref.size,
          lastModified: ref.lastModified
        };
        bindings.push({
          objectId: object.uuid,
          materialIndex,
          fieldKey,
          assetId: ref.id
        });
      });
    });
  });

  return { items, bindings };
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
  const texturesPayload = buildBundleTexturePayload(editor);

  document.assets = {
    ...(document.assets ?? {}),
    textures: texturesPayload
  };

  const entries: Array<{ path: string; data: Uint8Array; lastModified?: number }> = [
    {
      path: 'scene.json',
      data: encodeJson(document)
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

  const zipBytes = createStoredZip(entries);
  return {
    document,
    blob: new Blob([zipBytes], { type: 'application/zip' })
  };
}

/** 在导入后的场景树中按 uuid 查找对象。 */
function getObjectByUuid(editor: ThreeEditor, objectId: string) {
  let found: any = null;
  editor.scene.traverse((object: any) => {
    if (found || object.uuid !== objectId) return;
    found = object;
  });
  return found;
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
export async function importProjectBundle(editor: ThreeEditor, file: File) {
  const zipBytes = new Uint8Array(await file.arrayBuffer());
  const entries = parseStoredZip(zipBytes);
  const sceneBytes = entries.get('scene.json');
  if (!sceneBytes) {
    throw new Error('Bundle is missing scene.json.');
  }

  const document = decodeJson<BundleDocument>(sceneBytes);
  const texturesPayload = document.assets?.textures;
  await importDocument(editor, document);

  if (!texturesPayload) {
    editor.render();
    return;
  }

  for (const binding of texturesPayload.bindings) {
    const asset = texturesPayload.items[binding.assetId];
    if (!asset) continue;

    const assetBytes = entries.get(asset.path);
    if (!assetBytes) {
      throw new Error(`Bundle is missing texture asset: ${asset.path}`);
    }

    const object = getObjectByUuid(editor, binding.objectId);
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
  }

  editor.render();
}
