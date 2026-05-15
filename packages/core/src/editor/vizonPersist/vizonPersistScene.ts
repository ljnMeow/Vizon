/**
 * **场景侧持久化**：把 `THREE.Scene` 用户子树打成 `VizonDocument['content']` 树（`serializeVizonSceneContent`），
 * 并在导入时提供 **helper / layer / 材质 / 灯光 target** 等与运行时编辑器一致的行为。
 * 体量较大：序列化与反序列化共用 `RUNTIME_HELPER_TYPES` 等约定，见 `vizonPersistConstants`。
 *
 * 本模块职责：
 * 1. 将 THREE.Object3D 的图层位掩码（Layers bitmask）转换为可序列化的数字数组，以便存储到文档中；
 * 2. 判断哪些对象是编辑器内部对象（transform controls、overlay 层等），在序列化时予以跳过；
 * 3. 清洗 userData，去除运行时引用（Object3D、Material、Texture 等 THREE 对象）使其可 JSON 化；
 * 4. 将场景节点递归序列化为 VizonContentNode 树，供文档保存；
 * 5. 导入时恢复灯光 target 位置、创建运行时 helper（灯光辅助线、相机视锥等）。
 */
import * as THREE from 'three';
import { forEachMaterial, VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS } from '../../infra/utils';
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import type { VizonContentNode, VizonNode } from '../../types/document';
import type { SceneTreeNodeKind } from '../../settings/sceneTree';
import { VIZON_EDITOR_OVERLAY_LAYER } from '../picking/pickLayers';
import { configureEditorHelperObject, createLightTargetHandle, readPersistedLightTarget } from '../helpers/lightHelperUtils';
import { RUNTIME_HELPER_TYPES } from './vizonPersistConstants';
import { isRecord, toBool, toFiniteNumber, toString } from './vizonPersistShared';

/**
 * 将 THREE.Object3D 当前启用的图层（Layers）转换为图层编号数组。
 *
 * THREE.Layers 内部用一个 32 位整数的位掩码来记录对象属于哪些图层。
 * 序列化时需要把这个掩码展开成数字数组，方便 JSON 存储与阅读。
 *
 * @param obj 要读取图层信息的 Three.js 对象
 * @returns 对象所属图层编号的数组，例如 [0, 3, 31]
 */
function toLayers(obj: THREE.Object3D): number[] {
  const out: number[] = []; // 收集所有已启用图层编号的输出数组
  for (let i = 0; i < 32; i++) {
    // THREE.Layers 最多支持 32 个图层（0-31），逐一检测
    const layer = new THREE.Layers(); // 创建一个临时 Layers 实例，用于单图层测试
    layer.set(i); // 将该临时实例设置为仅启用第 i 层，便于与目标对象做 test
    if (obj.layers.test(layer)) out.push(i); // 若对象的图层掩码与第 i 层有重叠，则说明对象属于该层，记录编号
  }
  return out; // 返回所有命中的图层编号列表
}

/**
 * 将图层编号数组应用到 THREE.Object3D，恢复其图层状态。
 *
 * 这是 toLayers 的逆操作，在从文档导入对象时调用，
 * 把存储的图层编号数组重新写回对象的 Layers 掩码。
 *
 * @param obj    目标 Three.js 对象
 * @param layers 要启用的图层编号数组（来自序列化数据）
 */
export function applyLayers(obj: THREE.Object3D, layers: number[]) {
  obj.layers.disableAll(); // 先清除所有已启用的图层，避免历史状态污染
  for (const i of layers) {
    // 遍历序列化数据中的图层编号列表
    if (Number.isInteger(i) && i >= 0 && i < 32) obj.layers.enable(i);
    // 只接受合法范围（0-31）的整数图层编号，防止非法数据导致掩码异常
  }
}

/**
 * 判断对象是否为编辑器内部专用对象（不应出现在用户文档中）。
 *
 * 编辑器内部对象包括：
 * - 渲染在 Overlay 层上的对象（如选中高亮、辅助线框）
 * - Transform Controls 及其子 Gizmo / Plane 对象
 * - 编辑器专属命名的控件对象
 *
 * 这些对象不属于用户创作的场景内容，序列化时必须跳过。
 *
 * @param obj 待检测的 Three.js 对象
 * @returns true 表示该对象是编辑器内部对象，应被过滤
 */
function isEditorInternalObject(obj: THREE.Object3D) {
  const overlay = new THREE.Layers(); // 创建临时 Layers 实例，用于检测 Overlay 层
  overlay.set(VIZON_EDITOR_OVERLAY_LAYER); // 设置为编辑器 Overlay 专用层
  if (obj.layers.test(overlay)) return true; // 若对象在 Overlay 层，则属于编辑器内部（如高亮选中框）
  if ((obj as any).isTransformControls) return true; // 检测 TransformControls 根对象（平移/旋转/缩放控件）
  if (obj.type === 'TransformControlsGizmo' || obj.type === 'TransformControlsPlane') return true;
  // 检测 TransformControls 内部的 Gizmo（可视手柄）和 Plane（拖拽平面）子对象
  if (obj.name === 'TransformControlsEditor') return true; // 检测编辑器自定义命名的控件根节点
  return false; // 以上条件均不满足，则不是编辑器内部对象
}

/**
 * 判断对象是否为运行时辅助对象（runtime helper），序列化时应跳过。
 *
 * 运行时辅助对象包括：
 * - 所有编辑器内部对象（调用 isEditorInternalObject 检测）
 * - 在 RUNTIME_HELPER_TYPES 中注册的 Three.js 类型（如 DirectionalLightHelper、CameraHelper 等）
 * - 标记为灯光 target handle 的对象（用于拖拽调整平行光/聚光灯方向）
 * - 同时标记为"不可选中"且"在编辑器中隐藏"的对象（通常是辅助结构体）
 *
 * @param obj 待检测的 Three.js 对象
 * @returns true 表示该对象是运行时辅助对象，不应被序列化到文档
 */
function isRuntimeHelperObject(obj: THREE.Object3D) {
  if (isEditorInternalObject(obj)) return true; // 编辑器内部对象一定也是运行时辅助对象
  if (RUNTIME_HELPER_TYPES.has(obj.type)) return true; // 检测对象类型是否在已知的运行时辅助类型集合中（如灯光/相机 helper）
  const ud: any = obj.userData as any; // 取出 userData，用于检测自定义标记
  if (ud?.[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET_HANDLE]) return true;
  // 检测是否为灯光 target 的拖拽 handle 对象（平行光/聚光灯目标点指示器）
  if (ud?.[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] && ud?.[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR]) return true;
  // 同时满足"不可选中"和"在编辑器中隐藏"两个标记，则认为是辅助结构，不序列化
  return false; // 以上条件均不满足，则不是运行时辅助对象
}

/**
 * 就地清洗对象的 userData，移除运行时引用，使其可被 JSON 序列化。
 *
 * userData 可能包含：
 * - 运行时专用的键（pick target、helper 引用等），这些键不应持久化
 * - THREE.js 对象引用（Object3D、Material、Texture、Geometry、数学对象等），无法 JSON 化
 * - 函数、Symbol、BigInt 等不可序列化的 JavaScript 类型
 *
 * 本函数直接修改传入对象的 userData（in-place），调用前应先备份原始数据（见 createObjectSnapshot）。
 *
 * @param obj 需要清洗 userData 的 Three.js 对象
 */
function sanitizeUserDataInPlace(obj: THREE.Object3D) {
  const ud = (obj.userData ??= {}) as Record<string, unknown>;
  // 确保 userData 不为 null/undefined，并断言为字符串键的对象类型

  // 定义需要从 userData 中删除的运行时专用键列表
  const runtimeKeys = [
    VIZON_USER_DATA_KEYS.COMMON.PICK_TARGET,          // 拾取（picking）目标引用，指向被代理的对象，无法序列化
    VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER,       // 相机辅助线（CameraHelper）对象引用
    VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER,        // 灯光辅助线（LightHelper）对象引用
    VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE, // 灯光 target 拖拽 handle 对象引用
    VIZON_USER_DATA_KEYS.HELPERS.BORDER_LINE_HELPER,  // 边框线辅助对象引用
  ];
  for (const key of runtimeKeys) delete ud[key];
  // 第一轮：提前删除已知的运行时键，避免其被 toSerializable 误处理

  /**
   * 递归将任意值转换为可 JSON 序列化的安全值。
   * - null/undefined 原样返回（JSON 支持 null）
   * - 基本类型（string/number/boolean）直接返回
   * - function/symbol/bigint 返回 undefined（JSON 不支持，序列化时会被跳过）
   * - 数组：递归处理每个元素，过滤掉 undefined 结果
   * - 普通对象：检测循环引用（WeakSet），过滤掉 THREE.js 对象，递归处理剩余属性
   */
  const toSerializable = (value: unknown, seen: WeakSet<object>): unknown => {
    if (value == null) return value; // null 和 undefined 可以直接序列化（JSON 支持 null）
    const t = typeof value; // 获取值的原始类型，避免多次 typeof 调用
    if (t === 'string' || t === 'number' || t === 'boolean') return value; // 基本类型可安全序列化，直接返回
    if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;
    // 函数、Symbol、BigInt 无法 JSON 化，返回 undefined 表示"跳过此字段"

    if (Array.isArray(value)) {
      // 数组需要逐元素递归处理
      const out: unknown[] = [];
      for (const item of value) {
        const s = toSerializable(item, seen); // 递归转换数组中的每个元素
        if (s !== undefined) out.push(s); // 过滤掉不可序列化的元素（undefined 表示跳过）
      }
      return out; // 返回清洗后的纯净数组
    }

    if (t === 'object') {
      // 处理普通对象（非数组、非 null）
      const objValue = value as Record<string, unknown>;
      if (seen.has(objValue as object)) return undefined;
      // 检测循环引用：如果此对象已在处理栈中，则跳过，防止无限递归
      seen.add(objValue as object); // 将当前对象加入已处理集合，标记为"正在处理中"

      const anyV = value as any;
      if (
        anyV?.isObject3D ||   // THREE.Object3D 及其所有子类（Mesh、Group、Light 等）
        anyV?.isMaterial ||   // THREE.Material 及其所有子类（MeshStandardMaterial 等）
        anyV?.isTexture ||    // THREE.Texture 及其子类
        anyV?.isGeometry ||   // THREE.BufferGeometry 等几何体
        anyV?.isVector2 ||    // THREE.Vector2
        anyV?.isVector3 ||    // THREE.Vector3
        anyV?.isVector4 ||    // THREE.Vector4
        anyV?.isEuler ||      // THREE.Euler（欧拉角）
        anyV?.isColor ||      // THREE.Color
        anyV?.isMatrix3 ||    // THREE.Matrix3
        anyV?.isMatrix4 ||    // THREE.Matrix4
        anyV?.isQuaternion    // THREE.Quaternion（四元数）
      ) {
        return undefined;
        // 以上均为 THREE.js 特有对象，含循环引用/不可枚举属性，无法安全 JSON 化，直接跳过
      }

      const out: Record<string, unknown> = {}; // 存放当前对象可序列化属性的输出对象
      for (const [k, v] of Object.entries(objValue)) {
        // 遍历对象的所有自有枚举属性
        const s = toSerializable(v, seen); // 递归处理每个属性值
        if (s !== undefined) out[k] = s; // 只保留可序列化的属性（undefined 表示跳过）
      }
      return out; // 返回清洗后的纯净对象
    }

    return undefined; // 兜底：未知类型，返回 undefined 跳过
  };

  const safe = toSerializable(ud, new WeakSet()) as Record<string, unknown> | undefined;
  // 用全新的 WeakSet 开始递归清洗，WeakSet 用于在整个调用树中追踪循环引用
  obj.userData = safe ?? {};
  // 将清洗结果写回对象，若结果为 undefined（极少见），则用空对象兜底

  for (const key of runtimeKeys) {
    delete (obj.userData as Record<string, unknown>)[key];
    // 第二轮删除：即使 toSerializable 保留了这些键（理论上不会，因为第一轮已删除），再次确保清除
  }
}

/**
 * 根据 THREE.Object3D 的具体类型，返回对应的场景树节点类型（SceneTreeNodeKind）。
 *
 * 这个分类用于在 Vizon 文档的场景树面板中显示不同的图标和行为。
 * 判断顺序有意义：Scene > Camera > Light > Group > 默认 object，
 * 确保特殊类型优先匹配，不被默认分支吞掉。
 *
 * @param obj 要分类的 Three.js 对象
 * @returns 对应的场景树节点类型字符串
 */
function getSceneNodeKind(obj: THREE.Object3D): SceneTreeNodeKind {
  if (obj.type === 'Scene') return 'scene';   // THREE.Scene 本身，作为场景根节点处理
  if ((obj as any).isCamera) return 'camera'; // 所有相机类型（PerspectiveCamera、OrthographicCamera 等）
  if ((obj as any).isLight) return 'light';   // 所有灯光类型（DirectionalLight、PointLight 等）
  if (obj.type === 'Group') return 'group';   // THREE.Group，通常作为组合/层级容器
  return 'object';                            // 其他所有类型（Mesh、Line、Sprite 等）统一归为 object
}

/**
 * 将 THREE.Material 或 Material 数组序列化为 JSON 安全的普通对象。
 *
 * 使用 Three.js 内置的 material.toJSON() 方法进行序列化，
 * 并通过 forEachMaterial 统一处理单材质和多材质数组两种情况。
 * 若 toJSON() 抛出异常（例如自定义材质未实现该方法），则静默跳过该材质。
 *
 * @param material 要序列化的材质（单个或数组，也可以为 null/undefined）
 * @returns 序列化后的材质数据，或 undefined（如果输入为空或全部序列化失败）
 */
function serializeMaterial(
  material: THREE.Material | THREE.Material[] | null | undefined
): Record<string, unknown> | Array<Record<string, unknown>> | undefined {
  if (!material) return undefined; // 没有材质则直接返回 undefined，避免后续空指针
  const list: Record<string, unknown>[] = []; // 收集所有成功序列化的材质 JSON 对象
  forEachMaterial(material, (m) => {
    // forEachMaterial 统一迭代单材质和材质数组，回调接收每个 Material 实例
    try {
      list.push(m.toJSON() as unknown as Record<string, unknown>);
      // 调用 Three.js 内置的 toJSON() 方法，返回包含材质全部属性的普通对象
    } catch {
      /* skip */
      // 若 toJSON() 失败（如自定义着色器材质未实现序列化），静默跳过，不阻断整体流程
    }
  });
  if (Array.isArray(material)) {
    // 原始输入为材质数组（如 Mesh 使用多材质时），输出也应为数组
    return list.length ? list : undefined; // 若全部序列化失败则返回 undefined
  }
  return list[0]; // 原始输入为单材质，返回第一个（也是唯一一个）序列化结果
}

/**
 * 将任意 userData 输入值转换为可 JSON 序列化的纯对象。
 *
 * 与 sanitizeUserDataInPlace 的逻辑类似，但本函数是纯函数（不修改原始对象），
 * 返回一个全新的清洗后对象，供序列化时存入文档。
 *
 * 过滤规则：
 * - 基本类型（string/number/boolean）直接保留
 * - 函数、Symbol、BigInt 过滤掉（无法 JSON 化）
 * - THREE.js 对象（Object3D、Material、Texture、数学对象等）过滤掉（含循环引用）
 * - 循环引用对象过滤掉（用 WeakSet 追踪）
 * - 数组和普通对象递归处理
 *
 * @param input 原始 userData 值（通常是 object，但也可能是其他类型）
 * @returns 清洗后可安全 JSON 化的纯对象，若输入无法转换则返回空对象 {}
 */
function toSerializableUserData(input: unknown): Record<string, unknown> {
  /**
   * 内部递归函数，深度优先遍历值并过滤不可序列化的部分。
   * seen 用于检测循环引用，传入外层 WeakSet 以跨递归层级追踪。
   */
  const walk = (value: unknown, seen: WeakSet<object>): unknown => {
    if (value == null) return value; // null/undefined 可直接序列化（JSON 支持 null）
    const t = typeof value; // 获取值类型，用于后续分支判断
    if (t === 'string' || t === 'number' || t === 'boolean') return value; // 基本类型直接保留
    if (t === 'function' || t === 'symbol' || t === 'bigint') return undefined;
    // 函数、Symbol、BigInt 无法 JSON 化，返回 undefined 表示"此字段应跳过"

    if (Array.isArray(value)) {
      // 数组：逐元素递归，过滤掉 undefined 结果（即不可序列化的元素）
      const out: unknown[] = [];
      for (const item of value) {
        const mapped = walk(item, seen); // 递归处理数组元素
        if (mapped !== undefined) out.push(mapped); // 只保留可序列化的元素
      }
      return out; // 返回纯净数组
    }

    if (!isRecord(value)) return undefined;
    // 不是普通对象记录（Record<string, unknown>），也不是数组，则不可安全序列化，跳过
    if (seen.has(value)) return undefined;
    // 检测循环引用：若此对象已在处理栈中出现过，则跳过，防止死循环
    seen.add(value); // 将当前对象标记为"正在处理"，加入已访问集合

    const anyV = value as any;
    if (
      anyV?.isObject3D ||   // THREE.Object3D 及所有场景节点（含循环引用 parent/children）
      anyV?.isMaterial ||   // THREE.Material 及其子类
      anyV?.isTexture ||    // THREE.Texture 及其子类
      anyV?.isGeometry ||   // THREE.BufferGeometry 等几何体
      anyV?.isVector2 ||    // THREE.Vector2
      anyV?.isVector3 ||    // THREE.Vector3
      anyV?.isVector4 ||    // THREE.Vector4
      anyV?.isEuler ||      // THREE.Euler（欧拉角旋转表示）
      anyV?.isColor ||      // THREE.Color
      anyV?.isMatrix3 ||    // THREE.Matrix3（3x3 矩阵）
      anyV?.isMatrix4 ||    // THREE.Matrix4（4x4 变换矩阵）
      anyV?.isQuaternion    // THREE.Quaternion（四元数旋转表示）
    ) {
      return undefined;
      // 以上均为 THREE.js 特有对象，不可直接 JSON 化（含不可枚举属性/循环引用），一律跳过
    }

    const out: Record<string, unknown> = {}; // 存放当前对象中可序列化属性的输出容器
    for (const [k, v] of Object.entries(value)) {
      // 遍历对象的所有自有可枚举属性（即用户存入 userData 的字段）
      const mapped = walk(v, seen); // 递归处理属性值
      if (mapped !== undefined) out[k] = mapped; // 只保留可序列化的属性
    }
    return out; // 返回清洗后的纯净对象
  };

  const normalized = walk(input, new WeakSet());
  // 用空 WeakSet 开始全新的递归遍历，WeakSet 自动垃圾回收，无内存泄漏风险
  return isRecord(normalized) ? normalized : {};
  // 若清洗结果是合法对象则直接返回，否则（如输入为基本类型）返回空对象作为兜底
}

/**
 * 从对象的 userData 中读取特效组件（Effects Component）数据。
 *
 * 特效数据存储在 userData 中的 VIZON_STORAGE_KEYS.EFFECTS 键下，
 * 包含描边（border）和辉光（glow）两类效果的参数。
 * 本函数负责将原始 userData 数据转换为类型安全的特效配置对象。
 *
 * @param obj 要读取特效配置的 Three.js 对象
 * @returns 包含 effects 字段的组件对象，若无特效数据则返回空对象 {}
 */
function readEffectsComponent(obj: THREE.Object3D): VizonNode['components'] {
  const raw = (obj.userData as any)?.[VIZON_STORAGE_KEYS.EFFECTS];
  // 从 userData 中取出特效原始数据（可能为 undefined 或任意类型）
  if (!isRecord(raw)) return {};
  // 若不是合法的对象记录（Record），则该对象没有特效配置，返回空组件对象

  // 使用类型安全的转换函数逐个提取特效属性，并提供默认值（防止数据损坏/缺失）
  const effects = {
    borderEnabled: toBool(raw.borderEnabled, false),          // 描边是否启用，默认关闭
    borderWidth: toFiniteNumber(raw.borderWidth, 1),          // 描边宽度（像素），默认 1
    borderColor: toString(raw.borderColor, '#ff0000'),        // 描边颜色（十六进制字符串），默认红色
    glowEnabled: toBool(raw.glowEnabled, false),              // 辉光是否启用，默认关闭
    glowColor: toString(raw.glowColor, '#66ccff'),            // 辉光颜色（十六进制字符串），默认天蓝色
    glowRange: toFiniteNumber(raw.glowRange, 30),             // 辉光扩散范围（像素），默认 30
    glowBrightness: toFiniteNumber(raw.glowBrightness, 1),   // 辉光亮度倍数，默认 1
  };
  return { effects }; // 将特效参数包装进 components 结构体返回
}

/**
 * 运行时辅助对象（helper）的持久化快照类型。
 *
 * 用于在序列化文档时记录灯光 helper 和相机 helper 的存在状态，
 * 以便下次导入时能重建对应的辅助显示对象。
 *
 * 注意：这里只记录 helper 是否存在（enabled: true）及其类型，
 * 而不存储 helper 对象的完整状态（因为导入时 helper 会根据灯光/相机状态重新创建）。
 */
type PersistedHelperSnapshot = {
  enabled: true; // 常量 true，表示该 helper 处于启用状态（目前仅存储已启用的 helper）
  /** helper 的 three 类型（例如 DirectionalLightHelper / Group 等），用于调试/前向兼容 */
  type: string;
  /** helper 自身的 toJSON 快照（不用于直接 restore 绑定，但保留数据以便未来演进） */
  objectSnapshot?: Record<string, unknown>;
};

/**
 * 将导入文档时存储在 userData 中的灯光 target 位置应用到灯光对象上。
 *
 * 平行光（DirectionalLight）和聚光灯（SpotLight）有一个 target 属性，
 * 决定灯光照射的方向（灯光方向 = 灯光位置 → target.position）。
 * 文档保存时 target 位置存入 userData，导入后需要通过本函数将其恢复。
 *
 * 注意：本函数仅从 userData 原始数据读取并应用位置，
 * 创建 target handle（可视拖拽点）请调用 ensureImportedLightTargetHandle。
 *
 * @param light 刚导入的灯光对象
 */
export function applyImportedLightTargetFromUserData(light: THREE.Light) {
  const anyLight: any = light as any; // 使用 any 绕过 TypeScript 对灯光子类属性的类型检测
  if (!(anyLight?.isDirectionalLight || anyLight?.isSpotLight)) return;
  // 只有平行光和聚光灯才有 target 概念，点光源和半球光不需要处理

  const ud: any = light.userData ?? {}; // 取出 userData（兜底空对象，防止 null 访问）
  const t = ud?.[VIZON_USER_DATA_KEYS.DEFAULTS.LIGHT_TARGET];
  // 读取存储在 userData 中的灯光 target 位置数据（应为 {x, y, z} 格式的对象）
  if (!t || typeof t !== 'object') return;
  // 若没有 target 数据或格式不对，则跳过（可能是旧版文档或未保存过 target）

  // 用类型安全的转换函数提取坐标分量，无效数据则回退到 0
  const x = toFiniteNumber((t as any).x, 0); // target 的 X 轴坐标
  const y = toFiniteNumber((t as any).y, 0); // target 的 Y 轴坐标
  const z = toFiniteNumber((t as any).z, 0); // target 的 Z 轴坐标

  if (anyLight.target?.position?.set) {
    // 确认 target 对象存在且支持 position.set（防止类型不符导致运行时错误）
    anyLight.target.position.set(x, y, z); // 将恢复的坐标设置到灯光的 target 位置
    anyLight.target.updateMatrixWorld?.(true); // 强制更新 target 的世界矩阵，确保灯光方向立即生效
  }
  // 同步阴影矩阵，保证导入后阴影视锥 helper 立即正确
  anyLight.shadow?.updateMatrices?.(anyLight);
  // 若灯光有阴影相机，需要同步更新其投影矩阵，否则阴影视锥 helper 位置错误
}

/**
 * 确保导入的灯光对象有对应的 target handle（可视拖拽指示点）。
 *
 * 平行光和聚光灯的 target 位置决定照射方向。导入文档后，
 * 需要在场景中为这些灯光创建可拖拽的 target handle（小圆点或锥形指示器），
 * 让用户可以在 3D 视口中直接拖拽调整灯光方向。
 *
 * 本函数的调用逻辑：
 * 1. 若 handle 已存在（userData 中已有标记），则跳过，防止重复创建
 * 2. 从持久化数据中读取 target 信息（readPersistedLightTarget）
 * 3. 同步平行光/聚光灯的 target.position
 * 4. 调用 createLightTargetHandle 在场景中创建可视 handle，并持久化 target 数据
 *
 * @param light 刚导入的灯光对象
 */
export function ensureImportedLightTargetHandle(light: THREE.Light) {
  const ud: any = light.userData ?? {}; // 取出 userData（兜底空对象）
  if (ud?.[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_TARGET_HANDLE]) return;
  // 若 userData 中已有 LIGHT_TARGET_HANDLE 标记，说明 handle 已创建，无需重复处理

  const persisted = readPersistedLightTarget(light);
  // 从灯光的 userData 中读取持久化的 target 信息（包括 target 位置和灯光类型）
  if (!persisted) return;
  // 若无持久化的 target 数据（如旧版文档、非方向性灯光），则跳过

  const anyLight: any = light as any; // 使用 any 绕过 TypeScript 对灯光子类属性的类型检测
  if ((persisted.type === 'DirectionalLight' || persisted.type === 'SpotLight') && anyLight.target) {
    // 只有平行光和聚光灯才有 target 对象，确认类型匹配后再操作
    if (anyLight.target.position?.copy) anyLight.target.position.copy(persisted.target);
    // 将持久化的 target 位置向量复制到灯光的 target.position，恢复照射方向
    anyLight.target?.updateMatrixWorld?.(true); // 强制更新 target 的世界矩阵，使变换立即生效
    anyLight.shadow?.updateMatrices?.(anyLight); // 同步阴影相机的投影矩阵，确保阴影视锥正确
  }
  createLightTargetHandle(light, persisted.target, persisted.type, { persistTargetData: true });
  // 在场景中创建可拖拽的 target handle 对象，并将 target 数据持久化到 userData，
  // 以便下次保存文档时能正确序列化 target 位置
}

/**
 * 根据灯光类型创建对应的运行时可视辅助对象（light helper）。
 *
 * 每种灯光类型都有专属的 helper 可视化方式：
 * - DirectionalLight：方向线 + 可选的阴影视锥相机 helper（组合在 Group 中）
 * - PointLight：球形线框
 * - SpotLight：锥形线框
 * - HemisphereLight：半球形指示器
 * - RectAreaLight：矩形面积指示框
 *
 * helper 被包裹在 Group 中是为了将来可以挂载额外的子辅助对象（如阴影相机视锥），
 * 并通过 configureEditorHelperObject 将 helper 标记为"编辑器内部对象"，使其在序列化时被跳过。
 *
 * update() 方法由编辑器在每帧或灯光属性变化时调用，以保持 helper 视觉同步。
 *
 * @param light 需要创建 helper 的灯光对象
 * @returns 创建好的 helper 对象（可能是 Group 或直接的 Helper），或 null（不支持的灯光类型）
 */
export function createRuntimeLightHelper(light: THREE.Light): THREE.Object3D | null {
  const anyLight: any = light as any; // 使用 any 访问 Three.js 灯光子类的特有标记属性（如 isDirectionalLight）

  if (anyLight?.isDirectionalLight) {
    // 处理平行光（DirectionalLight）：方向线 + 可选的阴影视锥
    const helperGroup = new THREE.Group(); // 用 Group 包裹，便于统一管理灯光 helper 和阴影相机 helper
    helperGroup.name = 'DirectionalLightHelpers'; // 命名便于调试时在场景树中识别
    const lightHelper = new THREE.DirectionalLightHelper(light as any, 1.2) as any;
    // 创建平行光方向线辅助对象，尺寸 1.2 适合大多数场景比例
    helperGroup.add(lightHelper); // 将灯光 helper 加入 Group，Group 统一管理所有相关辅助对象
    // CameraHelper（阴影视锥）后续会被编辑器懒创建/同步；这里先不强制创建，避免导入时矩阵未稳定。
    (helperGroup as any).update = () => {
      // 定义 Group 的 update 方法，编辑器每帧/灯光变化时调用
      (lightHelper as any).update?.(); // 更新灯光方向线，使其跟随灯光位置/方向变化
      // 阴影视锥 helper 是 ThreeEditor.ensureShadowCameraHelper 懒创建并挂到 helperGroup 里的，
      // 这里需要同步调用其 update()，否则移动灯光时阴影视锥不会跟随更新。
      helperGroup.traverse((n: any) => {
        // 遍历 Group 的所有子节点，找到阴影相机视锥 helper 并更新
        if (n === helperGroup) return; // 跳过 Group 本身，只处理子节点
        if (n?.isCameraHelper || n?.type === 'CameraHelper') n.update?.();
        // 找到阴影相机视锥 helper（CameraHelper）并调用其 update，保持视锥同步
      });
    };
    return configureEditorHelperObject(helperGroup, light);
    // 将 helperGroup 标记为关联于 light 的编辑器辅助对象（设置特殊 userData 标记，使其在序列化时被跳过）
  }

  if (anyLight?.isPointLight) {
    // 处理点光源（PointLight）：球形线框指示照射范围
    const helperGroup = new THREE.Group(); // 用 Group 包裹，保持结构统一
    helperGroup.name = 'PointLightHelpers'; // 命名便于调试
    const lightHelper = new THREE.PointLightHelper(light as any, 0.45) as any;
    // 创建点光源球形辅助对象，球体半径 0.45 适合视觉识别
    helperGroup.add(lightHelper); // 将点光源 helper 加入 Group
    (helperGroup as any).update = () => (lightHelper as any).update?.();
    // 点光源 helper 只需更新自身，不涉及阴影相机视锥，直接调用 lightHelper.update()
    return configureEditorHelperObject(helperGroup, light);
    // 标记为编辑器内部辅助对象
  }

  if (anyLight?.isSpotLight) {
    // 处理聚光灯（SpotLight）：锥形线框指示照射范围和方向
    const helperGroup = new THREE.Group(); // 用 Group 包裹
    helperGroup.name = 'SpotLightHelpers'; // 命名便于调试
    const lightHelper = new THREE.SpotLightHelper(light as any) as any;
    // 创建聚光灯锥形辅助对象（锥体大小由聚光灯的 angle/distance 属性决定）
    helperGroup.add(lightHelper); // 将聚光灯 helper 加入 Group
    (helperGroup as any).update = () => {
      // 聚光灯也可能有阴影视锥，逻辑与平行光相同
      (lightHelper as any).update?.(); // 更新锥形 helper，跟随灯光属性变化
      helperGroup.traverse((n: any) => {
        // 遍历子节点，找到阴影相机视锥 helper 并更新
        if (n === helperGroup) return; // 跳过 Group 本身
        if (n?.isCameraHelper || n?.type === 'CameraHelper') n.update?.();
        // 更新阴影相机视锥，保持与灯光位置/角度同步
      });
    };
    return configureEditorHelperObject(helperGroup, light);
    // 标记为编辑器内部辅助对象
  }

  if (anyLight?.isHemisphereLight) {
    // 处理半球光（HemisphereLight）：半球形指示器，直接使用 Three.js 内置 helper，无需 Group 包裹
    const helper = new THREE.HemisphereLightHelper(light as any, 0.9) as any;
    // 创建半球光辅助对象，球体尺寸 0.9 适合大多数场景
    configureEditorHelperObject(helper, light); // 标记为编辑器内部辅助对象
    (helper as any).update?.(); // 立即调用一次 update，确保初始显示正确
    return helper; // 半球光 helper 直接返回，不包装在 Group 中
  }

  if (anyLight?.isRectAreaLight) {
    // 处理矩形面积光（RectAreaLight）：矩形线框，使用 Three.js 示例库中的专用 helper
    const helper = new RectAreaLightHelper(light as any) as any;
    // 创建矩形面积光辅助对象（面积光需要专用 helper，Three.js 核心库中没有内置）
    configureEditorHelperObject(helper, light); // 标记为编辑器内部辅助对象
    (helper as any).update?.(); // 立即调用一次 update，确保初始显示正确
    return helper; // 直接返回，不包装在 Group 中
  }

  return null; // 不支持的灯光类型（如 AmbientLight 没有方向，不需要 helper）
}

/**
 * 为相机创建运行时视锥辅助对象（CameraHelper）。
 *
 * CameraHelper 以线框形式显示相机的视锥体，帮助用户理解相机的拍摄范围。
 * renderOrder 设为 9000 确保视锥线框始终渲染在场景对象之上，不被遮挡。
 *
 * @param camera 需要创建辅助视锥的相机对象
 * @returns 配置好的 CameraHelper 对象
 */
export function createRuntimeCameraHelper(camera: THREE.Camera): THREE.CameraHelper {
  const helper = new THREE.CameraHelper(camera); // 创建相机视锥辅助对象，线框形态显示视锥体
  configureEditorHelperObject(helper, camera); // 标记为编辑器内部辅助对象，序列化时跳过
  helper.renderOrder = 9_000;
  // 设置较高的 renderOrder，确保视锥线框始终渲染在其他场景对象之上，不被场景遮挡
  return helper;
}

/**
 * 将 THREE.Object3D 对象树序列化为 Three.js 标准 JSON 快照（objectSnapshot）。
 *
 * 这个快照用于在导入文档时通过 THREE.ObjectLoader 完整重建对象树
 * （包括几何体、材质、纹理等），因为 VizonContentNode 仅存储轻量元数据。
 *
 * 技术难点：
 * 1. 序列化前需要清洗 userData（移除运行时引用），但序列化后需要恢复，避免影响编辑器运行
 * 2. THREE.Object3D.clone() 会生成新的 uuid，需要手动对齐源对象 uuid 以保证导入后能按 uuid 关联
 * 3. 克隆树中需要剔除运行时 helper 对象（避免 helper 被持久化到文档中）
 *
 * 实现策略：
 * - 先清洗源对象树的 userData（就地修改），记录原始数据以便恢复
 * - 克隆对象树（含清洗后的 userData）
 * - 在克隆树中删除 runtime helper 节点
 * - 将克隆树的 uuid 对齐回源对象的 uuid
 * - 调用 toJSON() 序列化克隆树
 * - finally 块确保源对象树的 userData 一定被恢复
 *
 * @param root 要序列化的根对象
 * @param options.includeRuntimeHelpers 是否在快照中包含运行时 helper 对象（通常为 false）
 * @returns Three.js JSON 格式的对象快照
 */
function createObjectSnapshot(
  root: THREE.Object3D,
  options?: { includeRuntimeHelpers?: boolean }
): Record<string, unknown> {
  const includeRuntimeHelpers = Boolean(options?.includeRuntimeHelpers);
  // 将选项转换为布尔值（undefined → false），控制是否在快照中包含运行时辅助对象
  const originalUserData = new WeakMap<THREE.Object3D, Record<string, unknown>>();
  // WeakMap 用于在清洗 userData 前备份原始数据，key 为对象引用，value 为原始 userData 的浅拷贝

  /**
   * 收集源对象树中所有需要序列化的节点（按 traverse 顺序）。
   * 若不包含 runtime helper，则跳过 helper 对象。
   * 收集顺序必须与 collectClonedNodes 一致，以便后续对齐 uuid。
   */
  const collectSourceNodes = (node: THREE.Object3D) => {
    const out: THREE.Object3D[] = []; // 收集满足条件的源节点列表
    node.traverse((obj) => {
      if (!includeRuntimeHelpers && isRuntimeHelperObject(obj)) return;
      // 若不需要包含 runtime helper，则跳过辅助对象（traverse 中 return 不会停止遍历，只是跳过当前节点的处理）
      out.push(obj); // 将满足条件的节点加入列表
    });
    return out; // 返回按 traverse 顺序排列的源节点列表
  };

  /**
   * 收集克隆树中所有节点（按 traverse 顺序）。
   * 克隆树已经过 pruneRuntimeChildrenInPlace 处理，不含 runtime helper，
   * 因此直接收集全部节点即可。
   */
  const collectClonedNodes = (node: THREE.Object3D) => {
    const out: THREE.Object3D[] = []; // 收集克隆树中所有节点的列表
    node.traverse((obj) => out.push(obj)); // 遍历克隆树，将每个节点加入列表
    return out; // 返回按 traverse 顺序排列的克隆节点列表
  };

  /**
   * 递归清洗源对象树的 userData（就地修改），同时备份原始数据。
   * 只清洗需要序列化的节点（跳过 runtime helper），与 collectSourceNodes 逻辑一致。
   * 必须在 clone() 之前调用，这样克隆出来的 userData 已经是干净的。
   */
  const sanitizeSourceUserDataBeforeClone = (node: THREE.Object3D) => {
    if (!includeRuntimeHelpers && isRuntimeHelperObject(node)) return;
    // 若不需要包含 runtime helper，跳过辅助对象的清洗（它们不会被序列化）
    originalUserData.set(node, { ...(node.userData as Record<string, unknown> | undefined) });
    // 浅拷贝原始 userData 存入 WeakMap，供后续恢复使用（浅拷贝足够，因为 sanitizeUserDataInPlace 会替换整个 userData 对象）
    sanitizeUserDataInPlace(node); // 就地清洗：移除运行时键和不可序列化的值
    for (const child of node.children) sanitizeSourceUserDataBeforeClone(child);
    // 递归处理所有子节点（Three.js traverse 方法无法提前中止，这里用手动递归以精确控制）
  };

  /**
   * 递归恢复源对象树的 userData（从 WeakMap 中读取备份）。
   * 必须在 clone() 和 toJSON() 完成后调用，确保编辑器运行时不受影响。
   * 放在 finally 块中调用，保证即使 toJSON() 抛出异常也能恢复。
   */
  const restoreSourceUserDataAfterClone = (node: THREE.Object3D) => {
    if (originalUserData.has(node)) node.userData = originalUserData.get(node)!;
    // 若此节点有备份，则恢复原始 userData（！断言因为 has() 已确认存在）
    for (const child of node.children) restoreSourceUserDataAfterClone(child);
    // 递归恢复所有子节点的 userData
  };

  /**
   * 递归删除克隆树中的 runtime helper 子节点（就地修改克隆树）。
   * 从后向前遍历 children 数组，避免删除操作导致索引偏移。
   * 只在 includeRuntimeHelpers 为 false 时有效。
   */
  const pruneRuntimeChildrenInPlace = (node: THREE.Object3D) => {
    if (includeRuntimeHelpers) return; // 若需要包含 runtime helper，则跳过剪枝步骤
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      // 从末尾向前遍历，避免删除元素后数组长度变化导致索引错误
      const child = node.children[i];
      if (isRuntimeHelperObject(child)) {
        node.remove(child); // 从克隆树中移除 runtime helper 节点（不影响源对象树）
      } else {
        pruneRuntimeChildrenInPlace(child); // 递归处理非 helper 子节点的子树
      }
    }
  };

  sanitizeSourceUserDataBeforeClone(root);
  // 第一步：清洗源对象树 userData（就地），同时备份原始数据到 WeakMap

  try {
    const sourceNodes = collectSourceNodes(root);
    // 第二步：收集源对象树中所有需要序列化的节点（按 traverse 顺序）
    const cloned = root.clone(true);
    // 第三步：深克隆整个对象树（true 表示递归克隆所有子节点），此时克隆树的 userData 已经是清洗后的
    pruneRuntimeChildrenInPlace(cloned);
    // 第四步：从克隆树中删除 runtime helper 节点，避免它们被序列化进文档
    const clonedNodes = collectClonedNodes(cloned);
    // 第五步：收集克隆树中所有节点（此时已不含 runtime helper）

    // THREE.Object3D.clone() 默认会生成新的 uuid；为了让导入后能按 uuid 回补 helper/面板联动，
    // 这里把 clone 子树的 uuid 强制对齐到源对象（同时保持 prune 后的结构）。
    const n = Math.min(sourceNodes.length, clonedNodes.length);
    // 取两个列表的最小长度，防止因数量不一致（理论上 prune 后可能减少）导致越界
    for (let i = 0; i < n; i++) clonedNodes[i].uuid = sourceNodes[i].uuid;
    // 将克隆节点的 uuid 强制对齐为源节点的 uuid，保证导入后按 uuid 关联的逻辑正常工作

    return cloned.toJSON() as unknown as Record<string, unknown>;
    // 第六步：序列化克隆树为 Three.js 标准 JSON 格式（含几何体/材质/纹理的完整数据）
  } finally {
    restoreSourceUserDataAfterClone(root);
    // 无论成功还是失败，都必须恢复源对象树的 userData，确保编辑器运行时数据完整
  }
}

/**
 * 将单个 THREE.Object3D 序列化为 VizonContentNode（文档内容节点）。
 *
 * VizonContentNode 是 Vizon 文档格式中的轻量节点描述，包含：
 * - 基础标识信息（uuid、name、type、kind）
 * - 可见性、阴影设置
 * - 变换信息（position、rotation、quaternion、scale）
 * - 图层信息（layers）
 * - 用户数据（userData，经过序列化安全处理）
 * - 特效组件（effects，如描边、辉光）
 * - helper 快照（记录灯光/相机 helper 的存在状态）
 * - 子节点列表（递归序列化，过滤掉 runtime helper）
 * - 根节点才包含完整的 objectSnapshot（用于导入时重建几何体/材质）
 *
 * @param obj    要序列化的 Three.js 对象
 * @param isRoot 是否为场景的顶层节点（根节点）；
 *               仅根节点需要生成 objectSnapshot（用于 importDocument 恢复），
 *               子节点的快照在导入时从未被读取，写入只会增大包体积。
 * @returns 序列化后的 VizonContentNode 对象
 */
function serializeNodeForContent(obj: THREE.Object3D, isRoot = false): VizonContentNode {
  const children = obj.children
    .filter((child) => !isRuntimeHelperObject(child))
    // 过滤掉运行时辅助对象（如灯光 helper、相机视锥、transform controls 等），这些不应出现在文档中
    .map((child) => serializeNodeForContent(child));
  // 递归序列化每个子节点（子节点 isRoot 默认为 false，不生成 objectSnapshot）

  const anyObj = obj as any; // 使用 any 访问 Three.js 子类的特有属性（如 isLight、isCamera、castShadow 等）
  const effectsComponent = readEffectsComponent(obj); // 从 userData 中读取特效配置（描边/辉光）
  const effects = effectsComponent?.effects as Record<string, unknown> | undefined;
  // 提取特效数据，若无特效则为 undefined（避免在文档中写入空的 effects 字段）

  // 收集灯光和相机的 helper 快照，记录它们当前是否已创建对应的编辑器辅助对象
  const helperSnapshots: { light?: PersistedHelperSnapshot; camera?: PersistedHelperSnapshot } = {};
  const rawUd: any = obj.userData as any; // 直接读取原始 userData，获取 helper 引用

  if (anyObj?.isLight) {
    // 若当前对象是灯光，检测是否有对应的灯光 helper
    const helper = rawUd?.[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] as THREE.Object3D | undefined;
    // 从 userData 中读取灯光 helper 引用（由 createRuntimeLightHelper 创建时写入）
    if (helper && (helper as any).isObject3D) {
      // 确认 helper 是有效的 Three.js 对象（防止 userData 中存有过期或无效引用）
      helperSnapshots.light = {
        enabled: true,    // 标记 helper 当前已启用（存在即启用）
        type: helper.type, // 记录 helper 的 Three.js 类型名，供调试和前向兼容使用
      };
    }
  }

  if (anyObj?.isCamera) {
    // 若当前对象是相机，检测是否有对应的相机视锥 helper
    const helper = rawUd?.[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER] as THREE.Object3D | undefined;
    // 从 userData 中读取相机 helper 引用（由 createRuntimeCameraHelper 创建时写入）
    if (helper && (helper as any).isObject3D) {
      // 确认 helper 是有效的 Three.js 对象
      helperSnapshots.camera = {
        enabled: true,     // 标记 helper 当前已启用
        type: helper.type, // 记录 helper 类型（通常为 'CameraHelper'）
      };
    }
  }

  return {
    uuid: obj.uuid,           // Three.js 自动生成的全局唯一 ID，用于在导入时关联对象
    name: obj.name || obj.type, // 优先使用对象名称，若为空则回退到类型名（防止空名称在 UI 中难以识别）
    type: obj.type,           // Three.js 对象类型字符串（如 'Mesh'、'DirectionalLight' 等）
    visible: obj.visible,     // 对象的可见性状态（false 时在场景中隐藏）
    kind: getSceneNodeKind(obj), // Vizon 自定义的节点分类（scene/camera/light/group/object）
    children,                 // 递归序列化后的子节点列表（已过滤 runtime helper）
    attribute: {
      objectSnapshot: isRoot ? createObjectSnapshot(obj) : undefined,
      // 根节点生成完整的 Three.js JSON 快照（用于导入时重建几何体/材质/纹理）；
      // 子节点不生成（导入时只读取根节点的 objectSnapshot 重建整棵树），避免冗余数据膨胀包体积
      castShadow: typeof anyObj.castShadow === 'boolean' ? anyObj.castShadow : undefined,
      // 仅当对象有 castShadow 属性（如 Mesh）时序列化，Light/Camera 等没有此属性则写 undefined
      receiveShadow: typeof anyObj.receiveShadow === 'boolean' ? anyObj.receiveShadow : undefined,
      // 同理，仅当对象有 receiveShadow 属性时序列化
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      // 本地坐标系下的位置（相对于父节点），序列化为普通对象避免 Three.js Vector3 引用
      rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
      // 本地欧拉角旋转（弧度制，XYZ 轴），序列化为普通对象
      quaternion: { x: obj.quaternion.x, y: obj.quaternion.y, z: obj.quaternion.z, w: obj.quaternion.w },
      // 四元数旋转（与 rotation 冗余存储，导入时优先使用四元数精度更高）
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
      // 本地缩放比例（通常为 {1,1,1}），序列化为普通对象
      layers: toLayers(obj),  // 将图层位掩码展开为图层编号数组，便于 JSON 存储
      userData: toSerializableUserData(obj.userData),
      // 用户自定义数据，经过清洗（移除运行时引用和不可序列化值）后存入文档
      ...(helperSnapshots.light ? { light: { helper: helperSnapshots.light } } : {}),
      // 若有灯光 helper 快照，则将其合并到 attribute 中（条件展开，无 helper 时不写入该字段）
      ...(helperSnapshots.camera ? { camera: { helper: helperSnapshots.camera } } : {}),
      // 若有相机 helper 快照，则将其合并到 attribute 中（条件展开，无 helper 时不写入该字段）
    },
    effects, // 特效组件数据（描边/辉光参数），无特效时为 undefined（不写入文档）
  };
}

/**
 * 序列化场景根下所有可编辑内容节点，生成 VizonDocument['content'] 数组。
 *
 * 遍历场景的直接子节点，过滤掉运行时辅助对象（light helper、camera helper、
 * transform controls 等），对每个顶层节点调用 serializeNodeForContent（isRoot=true），
 * 生成包含完整 objectSnapshot 的内容节点树。
 *
 * 仅顶层节点传 isRoot=true，子节点递归时默认 false，不生成 objectSnapshot，
 * 避免重复存储几何体/材质数据导致文档体积膨胀。
 *
 * @param scene 要序列化的 Three.js 场景对象
 * @returns VizonContentNode 数组，对应文档的 content 字段
 */
export function serializeVizonSceneContent(scene: THREE.Scene): VizonContentNode[] {
  return scene.children
    .filter((root) => !isRuntimeHelperObject(root))
    // 过滤掉场景直接子节点中的所有运行时辅助对象（仅保留用户创建的内容节点）
    .map((root) => serializeNodeForContent(root, true));
    // 对每个顶层内容节点进行序列化，isRoot=true 使其生成完整的 objectSnapshot
}
