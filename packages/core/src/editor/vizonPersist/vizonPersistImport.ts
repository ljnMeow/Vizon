/**
 * **导入执行层**：在 `ThreeEditor` 已清空用户节点的前提下，把 **已解析** 的 `VizonDocument` 写回场景。
 * 负责按 content 树实例化对象、恢复 `objectSnapshot`（Three.js JSON）、默认资源占位、灯光 target helper、
 * 以及应用 `SceneSettings`；错误路径通过 `VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT` 等常量标识。
 *
 * 整体导入策略优先级（从高到低）：
 *   1. doc.content（包含 objectSnapshot 的新格式，推荐）
 *   2. doc.sceneSnapshot（整场景 Three.js JSON 快照，旧格式兼容）
 *   3. doc.nodes（最原始的节点列表格式，只含默认资源 + 变换信息，最老格式兼容）
 */
import * as THREE from 'three';
import type { ThreeEditor } from '../ThreeEditor';
import { createDefaultCamera } from '../../defaults/defaultCameras';
import { createDefaultLight } from '../../defaults/defaultLights';
import { createDefaultModel } from '../../defaults/defaultModels';
import { VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS } from '../../infra/utils';
import { normalizeSceneSettings } from '../../settings/sceneSettings';
import type { SceneSettings } from '../../settings/sceneSettings';
import type { VizonContentNode, VizonDocument, VizonNode } from '../../types/document';
import { VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT } from './vizonPersistConstants';
import {
  applyImportedLightTargetFromUserData,
  applyLayers,
  createRuntimeCameraHelper,
  createRuntimeLightHelper,
  ensureImportedLightTargetHandle,
} from './vizonPersistScene';
import { isRecord, toFiniteNumber, toString } from './vizonPersistShared';

/**
 * 与序列化侧 attribute.helper 字段对齐的类型定义。
 * 导入时只读取 enabled 和 type 两个字段，用于判断是否需要重建运行时 helper 对象。
 * objectSnapshot 为可选字段，预留给未来可能存储 helper 自身 JSON 的扩展路径。
 */
type PersistedHelperSnapshot = {
  enabled: true;           // 标记该 helper 处于启用状态（禁用时不序列化此结构）
  type: string;            // helper 类型字符串，如 'DirectionalLightHelper'，未知时为 'unknown'
  objectSnapshot?: Record<string, unknown>; // 预留：helper 自身的 Three.js JSON 快照（当前未使用）
};

/**
 * 从 VizonContentNode 的 attribute 字段中提取 Three.js `toJSON()` 产生的 object 块。
 * 只识别 `attribute.objectSnapshot` 这一规范字段，其他字段一律忽略，
 * 确保导入路径唯一、可预测，避免歧义数据被错误当作场景对象解析。
 *
 * @param node - 待提取快照的内容节点
 * @returns 合法的 objectSnapshot 对象，若不存在则返回 undefined
 */
function extractObjectSnapshot(node: VizonContentNode): Record<string, unknown> | undefined {
  const attr = node.attribute; // 取出节点的 attribute 字段，该字段存储序列化时写入的各类元数据
  if (!isRecord(attr)) return undefined; // attribute 不是对象（如 null/undefined/原始值），无法提取，直接返回
  if (isRecord(attr.objectSnapshot)) return attr.objectSnapshot as Record<string, unknown>; // objectSnapshot 是合法的普通对象，直接返回作为 Three.js JSON 解析源
  return undefined; // objectSnapshot 不存在或不是对象（如数组/null），返回 undefined 表示该节点无快照
}

/**
 * helper 索引的类型别名：key 为节点 uuid，value 记录该节点需要恢复的 lightHelper 与 cameraHelper 信息。
 * 使用 Map 而非普通对象是为了保证 uuid 字符串键的类型安全和查找效率（O(1)）。
 */
type ImportedContentHelperIndex = Map<
  string,
  { lightHelper?: PersistedHelperSnapshot; cameraHelper?: PersistedHelperSnapshot }
>;

/**
 * 遍历所有 content 节点树，把需要恢复运行时 helper 的节点 uuid 和对应元数据收集到 Map 中。
 * 这个预构建索引的目的是：让后续的场景对象遍历可以 O(1) 查询某个对象是否需要挂载 helper，
 * 而不必每次都重新遍历 content 树（content 树结构与场景对象树可能不完全对应）。
 *
 * @param roots - content 树的根节点数组
 * @returns 以 uuid 为 key 的 helper 元数据索引
 */
function buildImportedContentHelperIndex(roots: VizonContentNode[]): ImportedContentHelperIndex {
  const index: ImportedContentHelperIndex = new Map(); // 初始化结果 Map，后续递归填充
  const visit = (n: VizonContentNode) => {
    const attr = n.attribute; // 读取当前节点的 attribute，helper 信息存储在 attribute.light.helper 或 attribute.camera.helper
    if (isRecord(attr)) {
      // 提取 attribute.light 子对象（序列化时灯光相关配置存在这里，包含 helper 字段）
      const light = isRecord((attr as any).light) ? ((attr as any).light as any) : null;
      // 提取 attribute.camera 子对象（相机相关配置存在这里，包含 helper 字段）
      const camera = isRecord((attr as any).camera) ? ((attr as any).camera as any) : null;

      /**
       * 将序列化后可能有多种形态的 helper 字段统一规范化为内部类型。
       * 历史原因导致 helper 字段可能是：
       *   - boolean true（旧版只存启用状态，无类型信息）
       *   - 对象 { enabled: true, type: 'xxx' }（新版完整格式）
       *   - { enabled: false }（显式禁用）
       *   - 其他非法值（忽略）
       */
      const normalizeHelper = (value: unknown): PersistedHelperSnapshot | undefined => {
        if (value === true) return { enabled: true, type: 'unknown' }; // 旧版布尔形式：只知道开启，不知道类型，用 'unknown' 占位
        if (!isRecord(value)) return undefined; // 非对象形式（如数字、null、字符串等）无效，忽略
        // 兼容：只要不是显式 enabled:false，都视为希望恢复 helper
        if ((value as any).enabled === false) return undefined; // 显式关闭的 helper 不需要恢复，返回 undefined
        return {
          enabled: true, // 标记为启用
          type: typeof (value as any).type === 'string' ? String((value as any).type) : 'unknown', // 读取 type 字符串，非法时降级为 'unknown'
        };
      };

      const lightHelper = light ? normalizeHelper(light.helper) : undefined; // 只有 light 子对象存在时才尝试提取 helper，否则该节点无灯光 helper
      const cameraHelper = camera ? normalizeHelper(camera.helper) : undefined; // 同上，针对相机 helper

      // 只有至少有一种 helper 需要恢复时，才将该节点 uuid 写入索引，节省内存和后续查找开销
      if (lightHelper || cameraHelper) {
        index.set(n.uuid, {
          lightHelper: lightHelper as PersistedHelperSnapshot | undefined,
          cameraHelper: cameraHelper as PersistedHelperSnapshot | undefined,
        });
      }
    }
    // 递归处理所有子节点，children 可能为 undefined，用 ?? [] 兜底避免报错
    for (const c of n.children ?? []) visit(c);
  };
  // 对每棵根节点树启动深度优先遍历
  for (const r of roots) visit(r);
  return index; // 返回构建完成的索引 Map
}

/**
 * 在场景对象已经通过 `importSceneFromContentNodes` 加入场景之后，
 * 再次遍历 helperIndex，对场景中已存在的灯光/相机对象补充挂载运行时 helper。
 * 这是一个"兜底"步骤：确保即使在 add() 阶段 helper 绑定出现遗漏，这里也能修复。
 *
 * @param editor - ThreeEditor 实例，用于访问场景和 rebind 方法
 * @param roots  - content 树根节点数组，用于重建 helperIndex
 */
function restoreRuntimeHelpersFromImportedContent(editor: ThreeEditor, roots: VizonContentNode[]) {
  const helperIndex = buildImportedContentHelperIndex(roots); // 重建 helper 索引（与 importSceneFromContentNodes 中的逻辑保持一致）
  for (const [uuid, meta] of helperIndex.entries()) {
    // 通过 uuid 在当前场景中查找对应的 Three.js 对象
    const obj = editor.scene.getObjectByProperty('uuid', uuid) as any;
    if (!obj) continue; // 场景中不存在该 uuid 的对象（可能导入失败或被跳过），跳过

    // 处理相机 helper：只对实际是相机的对象操作，避免误操作同名但类型不同的对象
    if (meta.cameraHelper && obj?.isCamera) {
      const cam = obj as THREE.Camera;
      const ud = ((cam as any).userData ??= {}) as any; // 确保 userData 存在（防御性初始化）
      if (!ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER]) {
        // 只在 userData 中还没有相机 helper 时才创建，避免重复创建导致内存泄漏
        ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER] = createRuntimeCameraHelper(cam);
      }
      editor.rebindRuntimeHelpersForSubtree(cam); // 通知编辑器重新绑定该子树的所有运行时 helper（含新创建的）
      continue; // 相机处理完毕，跳到下一个 uuid
    }
    // 处理灯光 helper：只对实际是灯光的对象操作
    if (meta.lightHelper && obj?.isLight) {
      const light = obj as THREE.Light;
      const ud = ((light as any).userData ??= {}) as any; // 确保 userData 存在
      if (!ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER]) {
        // 只在 userData 中还没有灯光 helper 时才创建
        const helper = createRuntimeLightHelper(light);
        if (helper) ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helper; // createRuntimeLightHelper 返回 null 时（如不支持的灯光类型）不写入
      }
      ensureImportedLightTargetHandle(light); // 确保方向性灯光的 target 有可见的操作手柄对象
      editor.rebindRuntimeHelpersForSubtree(light); // 通知编辑器重新绑定该子树所有运行时 helper
    }
  }
}

/**
 * 从 content 节点树中解析并向编辑器场景中添加所有 Three.js 对象。
 *
 * 策略说明：
 * - 以 content 为主：优先挂带 objectSnapshot 的节点；若当前节点无快照则下钻子节点（兼容仅子级带快照的导出）。
 * - 若节点已有快照，则视为整棵子树已由 Three 序列化，不再递归子 content 以免重复挂接。
 *
 * 该函数还负责：
 * 1. 在 add() 前写入 helper/target userData（确保 ThreeEditor.add 时能正确 bind）
 * 2. 对解析出的对象树进行数值清洗（修复 NaN/Infinity 等非法变换值）
 * 3. 在所有对象添加完毕后进行二次兜底的 helper 重绑定
 *
 * @param editor - ThreeEditor 实例
 * @param roots  - content 树根节点数组
 * @returns 成功添加到场景的顶级对象数量（0 表示无有效快照）
 */
function importSceneFromContentNodes(editor: ThreeEditor, roots: VizonContentNode[]): number {
  const loader = new THREE.ObjectLoader(); // Three.js 标准 JSON 解析器，用于将 objectSnapshot 还原为 Object3D
  let count = 0; // 记录成功添加到场景的顶级对象数量，用于外层判断是否有效导入
  const helperIndex = buildImportedContentHelperIndex(roots); // 预构建 helper 索引，避免每次 add 时重复遍历 content 树
  const addedRoots: THREE.Object3D[] = []; // 记录所有成功添加的顶级对象，用于后续二次兜底绑定 helper

  /**
   * 将未知类型的值安全转换为有限数字。
   * 当值本身不是数字或结果不是有限数时，返回 fallback 默认值，
   * 防止 NaN/Infinity 进入 Three.js 变换属性导致矩阵崩坏。
   */
  const fixNum = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' ? v : Number(v); // 若已是 number 直接用，否则尝试转换
    return Number.isFinite(n) ? n : fallback; // 有限数返回自身，否则返回安全默认值
  };

  /**
   * 对导入的对象树做完整的数值合法性修复，遍历该树中每一个节点：
   * - 检测并修复矩阵中的 NaN/Infinity（matrix 崩坏会导致整个子树渲染异常）
   * - 如果 matrixAutoUpdate 被关闭（导出时静态冻结），先分解矩阵到 TRS，再清洗各分量
   * - 针对透视相机/正交相机/灯光各自的属性做范围修正
   * - 最后强制重算 matrix 和 matrixWorld
   */
  const sanitizeImportedObjectTree = (root: THREE.Object3D) => {
    root.traverse((obj) => {
      // 检查矩阵 16 个元素中是否存在非有限数（NaN 或 Infinity）
      const badMatrix = (obj.matrix?.elements ?? []).some((x: number) => !Number.isFinite(x));
      if (badMatrix) {
        // 矩阵数据彻底损坏，重置为单位矩阵以及对应的默认 TRS，确保对象可见且在场景原点
        obj.matrix.identity();
        obj.position.set(0, 0, 0);   // 重置位置到原点
        obj.quaternion.set(0, 0, 0, 1); // 重置旋转为无旋转（单位四元数）
        obj.scale.set(1, 1, 1);         // 重置缩放为 1:1:1
      } else {
        // ObjectLoader 在 JSON 含 matrix 且 matrixAutoUpdate=false（导出前被静态冻结）时只恢复 matrix，不会分解到 TRS；
        // 下面 updateMatrix() 始终用 position/quaternion/scale 重算 matrix，若不先分解，会用默认 TRS 覆盖正确矩阵。
        if (obj.matrixAutoUpdate === false) {
          // 先把已知正确的 matrix 分解回 TRS，后续清洗后再由 updateMatrix 重组
          obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
        }
        // 逐分量清洗位置，fallback 为 0（位移为 0 是安全默认值）
        obj.position.set(
          fixNum(obj.position.x, 0),
          fixNum(obj.position.y, 0),
          fixNum(obj.position.z, 0)
        );
        // 逐分量清洗缩放，fallback 为 1（缩放为 1 保持原始大小）
        obj.scale.set(
          fixNum(obj.scale.x, 1),
          fixNum(obj.scale.y, 1),
          fixNum(obj.scale.z, 1)
        );
        // 逐分量清洗四元数，fallback 为单位四元数 (0,0,0,1)
        obj.quaternion.set(
          fixNum(obj.quaternion.x, 0),
          fixNum(obj.quaternion.y, 0),
          fixNum(obj.quaternion.z, 0),
          fixNum(obj.quaternion.w, 1)
        );
        // 四元数模长为 0 或非有限数时（全零或 NaN），视为无效，强制重置为单位四元数
        if (!Number.isFinite(obj.quaternion.lengthSq()) || obj.quaternion.lengthSq() === 0) {
          obj.quaternion.set(0, 0, 0, 1); // 重置为无旋转
        } else {
          obj.quaternion.normalize(); // 归一化：消除浮点误差累积导致的轻微偏差，保证旋转精确
        }
      }
      // 导入后按常规参与矩阵更新，避免残留 false 与编辑器/gizmo 链路不一致。
      obj.matrixAutoUpdate = true; // 恢复自动矩阵更新，让编辑器 gizmo 等工具能正常驱动变换
      const anyObj = obj as any; // 临时 any 类型，用于访问特定类型（相机/灯光）的额外属性

      // --- 透视相机参数清洗 ---
      if (anyObj?.isPerspectiveCamera) {
        if (!Number.isFinite(anyObj.fov)) anyObj.fov = 50;   // fov 非法时设为常用默认值 50°
        if (!Number.isFinite(anyObj.near)) anyObj.near = 0.01; // near 非法时设为合理的近裁剪面
        if (!Number.isFinite(anyObj.far)) anyObj.far = 1000;   // far 非法时设为常用远裁剪面
        anyObj.near = Math.max(0.001, anyObj.near); // near 必须大于 0，否则深度测试出错
        anyObj.far = Math.max(anyObj.near + 1e-3, Math.min(100_000, anyObj.far)); // far 必须大于 near 且不超过 10 万（防止深度精度损失）
        anyObj.fov = Math.max(10, Math.min(120, anyObj.fov)); // fov 限制在 [10°, 120°]，超出范围会导致画面严重变形
        anyObj.updateProjectionMatrix?.(); // 参数改变后必须重算投影矩阵，否则渲染仍用旧参数
      } else if (anyObj?.isOrthographicCamera) {
        // --- 正交相机参数清洗 ---
        if (!Number.isFinite(anyObj.near)) anyObj.near = 0.01;
        if (!Number.isFinite(anyObj.far)) anyObj.far = 1000;
        if (!Number.isFinite(anyObj.left)) anyObj.left = -10;   // 视锥左边界默认 -10
        if (!Number.isFinite(anyObj.right)) anyObj.right = 10;  // 视锥右边界默认 10
        if (!Number.isFinite(anyObj.top)) anyObj.top = 10;      // 视锥上边界默认 10
        if (!Number.isFinite(anyObj.bottom)) anyObj.bottom = -10; // 视锥下边界默认 -10
        if (!Number.isFinite(anyObj.zoom)) anyObj.zoom = 1;     // zoom 非法时默认 1:1 缩放
        anyObj.near = Math.max(0.001, anyObj.near);
        anyObj.far = Math.max(anyObj.near + 1e-3, Math.min(100_000, anyObj.far));
        anyObj.zoom = Math.max(0.01, anyObj.zoom); // zoom 必须为正数，否则画面翻转
        anyObj.updateProjectionMatrix?.(); // 重算正交投影矩阵
      }

      // --- 灯光参数清洗 ---
      if (anyObj?.isLight) {
        if ('intensity' in anyObj && !Number.isFinite(anyObj.intensity)) anyObj.intensity = 1; // 光照强度非法时默认 1（正常亮度）
        if ('distance' in anyObj && !Number.isFinite(anyObj.distance)) anyObj.distance = 0;   // 衰减距离非法时默认 0（无限距离衰减）
        if ('decay' in anyObj && !Number.isFinite(anyObj.decay)) anyObj.decay = 2;             // 物理衰减指数非法时默认 2（平方反比，符合物理规律）
        if ('angle' in anyObj && !Number.isFinite(anyObj.angle)) anyObj.angle = Math.PI / 3;  // 聚光灯锥角非法时默认 60°
        if ('penumbra' in anyObj && !Number.isFinite(anyObj.penumbra)) anyObj.penumbra = 0;   // 聚光灯半影非法时默认 0（硬边）
        const shadowCam = anyObj.shadow?.camera as any; // 灯光的阴影相机（用于阴影贴图渲染）
        if (shadowCam) {
          // 阴影相机参数异常会导致阴影完全消失或覆盖全屏
          if (!Number.isFinite(shadowCam.near)) shadowCam.near = 0.1;
          if (!Number.isFinite(shadowCam.far)) shadowCam.far = 1000;
          shadowCam.near = Math.max(0.001, shadowCam.near);
          shadowCam.far = Math.max(shadowCam.near + 1e-3, Math.min(100_000, shadowCam.far));
          shadowCam.updateProjectionMatrix?.(); // 阴影相机参数改变后也需要重算投影矩阵
        }
      }

      obj.updateMatrix();           // 根据清洗后的 position/quaternion/scale 重新计算本地矩阵
      obj.updateMatrixWorld(true);  // 强制递归更新世界矩阵（true = 强制更新，不依赖 dirty 标记）
    });
  };

  /**
   * 将一个已解析的 Three.js 对象（或场景）添加到编辑器场景中。
   * 在调用 editor.add() 之前，先遍历整棵树写入 helper/target userData，
   * 因为 ThreeEditor.add() 内部会立即执行 helper 绑定，必须在这之前准备好数据。
   *
   * @param parsed - THREE.ObjectLoader.parse() 返回的对象（可能是 Scene 也可能是普通 Object3D）
   */
  const addParsedObject = (parsed: THREE.Object3D) => {
    // 在 add() 之前把 helper/target handle 写入 userData，确保 ThreeEditor.add 能正确 bind。
    parsed.traverse((node: any) => {
      const meta = helperIndex.get(node?.uuid); // 查找该对象 uuid 是否有需要恢复的 helper 元数据

      // 为相机对象预写入相机 helper
      if (meta?.cameraHelper && node?.isCamera) {
        const cam = node as THREE.Camera;
        const ud = ((cam as any).userData ??= {}) as any; // 防御性确保 userData 存在
        if (!ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER]) {
          // 避免重复创建：只有 userData 中还没有 helper 时才新建
          ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER] = createRuntimeCameraHelper(cam);
        }
      }

      // 为灯光对象预写入灯光 helper 和 target 手柄
      if (meta?.lightHelper && node?.isLight) {
        const light = node as THREE.Light;
        const ud = ((light as any).userData ??= {}) as any; // 防御性确保 userData 存在
        if (!ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER]) {
          const helper = createRuntimeLightHelper(light); // 根据灯光类型创建对应的 helper 对象
          if (helper) ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helper; // 不支持的类型返回 null，跳过写入
        }
        applyImportedLightTargetFromUserData(light); // 将 userData 中存储的 target 位置信息恢复到 light.target 对象
        ensureImportedLightTargetHandle(light);      // 确保 light.target 有对应的可操作手柄对象存在于场景
      }
    });

    // 处理 ObjectLoader 解析出来的结果是 THREE.Scene 的情况（整场景序列化时可能产生此结构）
    if ((parsed as any).isScene) {
      const scene = parsed as THREE.Scene;
      const children = [...scene.children]; // 复制子节点数组，因为 add() 会改变原数组（从旧父节点移除）
      for (const child of children) {
        sanitizeImportedObjectTree(child); // 对每个子树进行数值清洗，防止非法变换值进入场景
        editor.add(child, {
          recordHistory: false,              // 不记录历史，导入不应产生 undo/redo 记录
          operationName: 'Import document content', // 操作名用于调试日志追踪
          freezeSubtreeAfterAdd: false,      // 不冻结子树，让后续操作可以继续修改
        });
        addedRoots.push(child); // 记录到已添加列表，用于后续二次 helper 绑定
        count++;                // 每添加一个顶级子节点计数加一
      }
      return; // 场景类型处理完毕，直接返回，不走下面的单对象分支
    }

    // 普通 Object3D（非 Scene）的处理路径
    sanitizeImportedObjectTree(parsed); // 对整棵解析树进行数值清洗
    editor.add(parsed, {
      recordHistory: false,
      operationName: 'Import document content',
      freezeSubtreeAfterAdd: false,
    });
    addedRoots.push(parsed); // 记录到已添加列表
    count++;                 // 顶级对象计数加一
  };

  /**
   * 将单个 objectSnapshot（Three.js JSON 格式对象）解析并添加到场景。
   * 先用 ObjectLoader 还原为 Object3D，再交给 addParsedObject 统一处理后续逻辑。
   *
   * @param snapshot - 符合 Three.js ObjectLoader 格式的普通对象（来自 attribute.objectSnapshot）
   */
  const addOne = (snapshot: Record<string, unknown>) => {
    const parsed = loader.parse(snapshot as any); // 将 JSON 格式的快照解析为 Three.js Object3D 对象
    addParsedObject(parsed); // 交给统一的添加函数处理 helper 注入和 editor.add
  };

  /**
   * 深度优先遍历 content 节点树，优先处理有 objectSnapshot 的节点。
   * 一旦找到快照就立即添加并停止下探（子树已包含在快照内，不需要也不应该再重复添加）。
   * 没有快照的节点继续向子节点下探，直到找到有快照的节点为止。
   */
  const visit = (node: VizonContentNode): void => {
    const snap = extractObjectSnapshot(node); // 尝试从当前节点提取 objectSnapshot
    if (snap) {
      addOne(snap); // 有快照则直接解析添加，不再递归子节点（子树已包含在快照内）
      return;
    }
    // 当前节点无快照，递归处理子节点（支持部分节点无快照的混合场景结构）
    for (const c of node.children ?? []) visit(c);
  };

  // 对每个根节点启动深度优先遍历，完成所有对象的添加
  for (const root of roots) visit(root);

  // 二次兜底：避免 helper 元数据存在但在 add() 时未被绑定（例如外部 JSON/兼容分支导致的延后写入）。
  for (const root of addedRoots) {
    // 再次遍历所有已添加对象的子树，补充可能遗漏的 helper 创建
    root.traverse((node: any) => {
      const meta = helperIndex.get(node?.uuid); // 再次查找该对象的 helper 元数据

      // 兜底：确保相机 helper 已创建
      if (meta?.cameraHelper && node?.isCamera) {
        const cam = node as THREE.Camera;
        const ud = ((cam as any).userData ??= {}) as any;
        if (!ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER]) {
          // 如果 add() 阶段未能成功创建，这里补充创建
          ud[VIZON_USER_DATA_KEYS.HELPERS.CAMERA_HELPER] = createRuntimeCameraHelper(cam);
        }
      }

      // 兜底：确保灯光 helper 和 target 手柄已创建
      if (meta?.lightHelper && node?.isLight) {
        const light = node as THREE.Light;
        const ud = ((light as any).userData ??= {}) as any;
        if (!ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER]) {
          const helper = createRuntimeLightHelper(light);
          if (helper) ud[VIZON_USER_DATA_KEYS.HELPERS.LIGHT_HELPER] = helper;
        }
        ensureImportedLightTargetHandle(light); // 再次确保 target 手柄存在
      }
    });
    editor.rebindRuntimeHelpersForSubtree(root); // 通知编辑器对整棵子树重新执行 helper 绑定逻辑
  }

  return count; // 返回成功添加的顶级对象数量（0 表示无有效内容，调用方会抛出错误）
}

/**
 * 将文档中存储的场景设置（背景/环境/相机/网格/renderer 等）应用到编辑器。
 * 注意：sceneTree 字段必须使用当前场景重建，禁止直接使用文档里的过期 sceneTree 快照，
 * 因为 sceneTree 依赖场景中实际存在的对象，文档里的是序列化时的历史状态。
 *
 * @param editor        - ThreeEditor 实例
 * @param doc           - 已解析的 VizonDocument，包含各类场景设置字段
 * @param importOptions - 可选配置，resetSceneSettings 为 false 时跳过场景设置应用（如增量导入）
 */
async function applyImportedDocumentSettings(
  editor: ThreeEditor,
  doc: VizonDocument,
  importOptions?: { resetSceneSettings?: boolean }
): Promise<void> {
  if (importOptions?.resetSceneSettings === false) return; // 调用方明确要求不重置场景设置（如仅添加对象而不改变环境），直接返回

  await editor.setSceneSettings(
    normalizeSceneSettings({
      basic: doc.basic,           // 基础场景设置（背景色/雾效等）
      environment: doc.environment, // 环境贴图/HDRI 等环境设置
      camera: doc.camera,         // 默认相机设置（视角/近远平面等）
      grid: doc.grid,             // 网格辅助线设置
      helpers: doc.helpers,       // 全局 helper 显示设置（坐标轴等）
      renderer: doc.renderer,     // 渲染器参数（色调映射/阴影等）
      sceneTree: editor.getSceneTree(), // 必须用当前场景重建 sceneTree，而非文档里的历史快照
    } as SceneSettings), // normalizeSceneSettings 会填充所有可选字段的默认值，保证结构完整
    {
      recordHistory: false,                   // 场景设置应用不记录历史，不生成 undo 条目
      operationName: 'Import scene settings', // 操作名用于调试日志
      forceApply: true,                       // 强制应用所有设置，即使与当前设置相同也执行（防止差异检测跳过必要更新）
    }
  );
}

/**
 * 将一个已完成 JSON 解析的 `VizonDocument` 完整恢复到编辑器场景中。
 * 调用方须在调用此函数前已执行 `clearSceneNodes()`，确保场景处于干净状态。
 *
 * 导入策略按以下优先级降级处理：
 * 1. **doc.content 路径**（推荐，新格式）：每个 content 节点包含完整的 objectSnapshot，
 *    通过 Three.js ObjectLoader 精确还原几何体/材质/纹理等所有属性。
 * 2. **doc.sceneSnapshot 路径**（兼容，旧格式）：整个场景的 Three.js JSON 快照，
 *    直接用 ObjectLoader 解析整个场景。
 * 3. **doc.nodes 路径**（最老格式）：只有节点的基本变换和默认资源引用，
 *    通过 createDefaultXxx 工厂函数重建对象后手动应用变换属性。
 *
 * @param editor  - ThreeEditor 实例（须已清空用户节点）
 * @param doc     - 已完成解析的 VizonDocument 文档对象
 * @param options - 可选导入配置，resetSceneSettings 控制是否覆盖当前场景设置
 */
export async function importParsedDocument(
  editor: ThreeEditor,
  doc: VizonDocument,
  options?: { resetSceneSettings?: boolean }
): Promise<void> {
  // ===== 路径 1：优先使用 content 格式（新格式，包含 objectSnapshot） =====
  // 以 content 为唯一场景数据来源（物体/场景内灯光/场景内相机等均应在 objectSnapshot 内）
  if (Array.isArray(doc.content) && doc.content.length > 0) {
    // 从 content 节点树中解析并添加所有对象，返回成功添加的顶级对象数量
    const added = importSceneFromContentNodes(editor, doc.content);
    if (added === 0) {
      // content 存在但所有节点都缺少 objectSnapshot，属于数据损坏，抛出明确错误
      throw new Error(VIZON_IMPORT_ERROR_NO_OBJECT_SNAPSHOT);
    }
    await applyImportedDocumentSettings(editor, doc, options); // 应用文档中的场景设置（环境/相机/渲染器等）
    // 显式按 content helper 标记补齐并重绑定（不依赖 add() 时机与隐式链路）
    restoreRuntimeHelpersFromImportedContent(editor, doc.content); // 兜底恢复所有 helper，确保 add() 阶段没有遗漏
    editor.resetShiftMultiselectState(); // 清除多选状态，防止导入后残留旧的选中对象引用
    editor.render(); // 触发一次渲染，让新加入的对象立即可见
    return; // 处理完毕，退出函数
  }

  // ===== 路径 2：回退到整场景快照格式（旧格式，doc.sceneSnapshot） =====
  if (doc.sceneSnapshot && isRecord(doc.sceneSnapshot)) {
    const loader = new THREE.ObjectLoader(); // 创建 Three.js JSON 解析器
    const parsed = loader.parse(doc.sceneSnapshot as any); // 将整个场景 JSON 快照解析为对象

    // 解析结果可能是 THREE.Scene（场景级序列化）或普通 Object3D（对象级序列化）
    if ((parsed as any).isScene) {
      const parsedScene = parsed as THREE.Scene;
      // 逐个将场景子节点添加到编辑器（不能直接 add 整个场景，编辑器只管理用户节点）
      for (const child of parsedScene.children) {
        editor.add(child, {
          recordHistory: false,
          operationName: 'Import document snapshot',
          freezeSubtreeAfterAdd: false,
        });
      }
    } else {
      // 非场景类型，直接作为对象添加
      editor.add(parsed, {
        recordHistory: false,
        operationName: 'Import document snapshot',
        freezeSubtreeAfterAdd: false,
      });
    }

    await applyImportedDocumentSettings(editor, doc, options); // 应用文档中的场景设置
    editor.resetShiftMultiselectState(); // 清除多选状态
    editor.render(); // 触发渲染
    return; // 处理完毕，退出函数
  }

  // ===== 路径 3：最老的 nodes 格式兼容处理 =====
  // 使用 Map 存储已创建的对象，key 为节点 id，用于后续建立父子关系
  const created = new Map<string, THREE.Object3D>();

  /**
   * 根据节点的 components.defaults 信息，用工厂函数创建对应类型的默认对象。
   * 这是最老格式下重建对象的方式：不保存完整几何/材质，只记录"使用哪个默认资源"。
   * 若节点没有任何默认资源标识，创建一个空 Group 作为容器占位。
   *
   * @param n - VizonNode 节点对象
   * @returns 对应的 Three.js Object3D 实例
   */
  const createObjectForNode = (n: VizonNode): THREE.Object3D => {
    const defaults = n.components?.defaults; // 读取默认资源引用配置
    if (defaults?.modelKey) return createDefaultModel(defaults.modelKey as any);   // 有模型 key：创建对应的默认模型（如 box/sphere 等）
    if (defaults?.lightKey) return createDefaultLight(defaults.lightKey as any, { target: { x: 0, y: 0, z: 0 } }); // 有灯光 key：创建对应的默认灯光，target 初始指向原点
    if (defaults?.cameraKey) return createDefaultCamera(defaults.cameraKey as any); // 有相机 key：创建对应的默认相机
    return new THREE.Group(); // 没有任何默认资源标识：创建空 Group 作为逻辑容器
  };

  /**
   * 将节点的变换、名称、可见性、flags 和 effects 等属性应用到对应的 Three.js 对象上。
   * 这一步使创建的默认对象具有文档中记录的正确属性状态。
   *
   * @param n   - VizonNode 节点（提供属性数据）
   * @param obj - 对应的 Three.js Object3D（接收属性数据）
   */
  const applyNodeToObject = (n: VizonNode, obj: THREE.Object3D) => {
    obj.uuid = n.id;             // 使对象 uuid 与文档节点 id 一致，便于后续通过 id 查找对象
    obj.name = n.name ?? '';     // 恢复对象名称，缺失时用空字符串（避免 undefined 污染）
    obj.visible = Boolean(n.visible); // 恢复可见性（Boolean 转换确保类型正确）

    // 恢复变换：位置/四元数旋转/缩放（直接 set 保证精确赋值，不通过 Euler 转换损失精度）
    obj.position.set(n.position.x, n.position.y, n.position.z);
    obj.quaternion.set(n.quaternion.x, n.quaternion.y, n.quaternion.z, n.quaternion.w);
    obj.scale.set(n.scale.x, n.scale.y, n.scale.z);
    obj.updateMatrixWorld(true); // 立即更新世界矩阵，让子节点后续添加时能获取到正确的父矩阵

    applyLayers(obj, n.layers); // 恢复对象所属的渲染层（控制相机可见性和射线检测范围）

    const ud = (obj.userData ??= {}) as any; // 确保 userData 存在，后续写入各类自定义标记
    if (n.flags) {
      // 仅在 flags 字段中明确设置了该属性时才写入（null/undefined 表示未设置，不覆盖默认值）
      if (n.flags.hideInEditor != null) ud[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = Boolean(n.flags.hideInEditor);   // 是否在编辑器场景树中隐藏
      if (n.flags.nonSelectable != null) ud[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] = Boolean(n.flags.nonSelectable); // 是否禁止被选中
      if (n.flags.nonPickable != null) ud[VIZON_USER_DATA_KEYS.COMMON.NON_PICKABLE] = Boolean(n.flags.nonPickable);       // 是否禁止被射线拾取
      if (n.flags.dynamic != null) ud[VIZON_USER_DATA_KEYS.COMMON.DYNAMIC] = Boolean(n.flags.dynamic);                   // 是否为动态对象（影响更新频率）
    }

    // 恢复视觉特效配置（边框发光等）
    const effects = n.components?.effects;
    if (effects) {
      ud[VIZON_STORAGE_KEYS.EFFECTS] = {
        borderEnabled: Boolean(effects.borderEnabled),                    // 是否启用边框效果
        borderWidth: toFiniteNumber(effects.borderWidth, 1),              // 边框宽度，非法值用默认值 1 替代
        borderColor: toString(effects.borderColor, '#ff0000'),            // 边框颜色，非法值用默认红色替代
        glowEnabled: Boolean(effects.glowEnabled),                        // 是否启用发光效果
        glowColor: toString(effects.glowColor, '#66ccff'),                // 发光颜色，默认淡蓝色
        glowRange: toFiniteNumber(effects.glowRange, 30),                 // 发光范围（像素），默认 30
        glowBrightness: toFiniteNumber(effects.glowBrightness, 1),        // 发光亮度倍数，默认 1
      };
    }

    const anyObj: any = obj as any; // 临时 any 类型，用于访问灯光/相机的特有属性

    // 恢复灯光属性（仅在对象确实是灯光时才操作，避免对非灯光对象赋予无意义属性）
    const light = n.components?.light;
    if (light && anyObj?.isLight) {
      if (typeof light.intensity === 'number') anyObj.intensity = light.intensity;   // 恢复光照强度
      if (typeof light.castShadow === 'boolean') anyObj.castShadow = light.castShadow; // 恢复阴影投射开关
      if (typeof light.color === 'string') {
        try {
          anyObj.color?.set?.(light.color); // 用颜色字符串（如 '#ffffff'）设置灯光颜色
        } catch {
          // 非法颜色忽略：color.set 对无效颜色字符串会抛出异常，这里安全忽略保持默认颜色
        }
      }
    }

    // 恢复相机属性（仅在对象确实是相机时才操作）
    const cam = n.components?.camera;
    if (cam && anyObj?.isCamera) {
      if (typeof cam.near === 'number') anyObj.near = cam.near; // 恢复近裁剪面距离
      if (typeof cam.far === 'number') anyObj.far = cam.far;   // 恢复远裁剪面距离
      if (typeof cam.fov === 'number') anyObj.fov = cam.fov;   // 恢复视野角（仅透视相机有效）
      anyObj.updateProjectionMatrix?.(); // 相机参数改变后必须重算投影矩阵
    }
  };

  // 第一遍：为所有节点创建对象并应用属性，存入 Map 以便后续建立父子关系
  for (const n of doc.nodes ?? []) {
    const obj = createObjectForNode(n); // 根据默认资源 key 创建对应的 Three.js 对象
    applyNodeToObject(n, obj);          // 将节点属性（变换/名称/flags/effects 等）应用到对象
    created.set(n.id, obj);             // 以节点 id 为 key 存入 Map，供后续父子关系建立使用
  }

  // 第二遍：建立父子关系，将有 parentId 的对象添加到对应父对象中
  for (const n of doc.nodes ?? []) {
    const obj = created.get(n.id)!; // 从 Map 中取出当前节点对应的对象（前一遍必然已创建）
    if (n.parentId && created.has(n.parentId)) {
      // 有父节点且父节点已创建（防御性检查，避免引用不存在的父节点）
      created.get(n.parentId)!.add(obj); // 将当前对象添加为父对象的子节点，建立场景层级
    }
  }

  // 第三遍：将所有根节点（没有父节点的顶级对象）添加到编辑器场景
  for (const n of doc.nodes ?? []) {
    if (n.parentId) continue; // 有父节点的对象已在第二遍中被添加到父对象，这里跳过
    const obj = created.get(n.id)!; // 取出根节点对应的 Three.js 对象
    editor.add(obj, {
      recordHistory: false,        // 不记录历史，导入操作不参与 undo/redo
      operationName: 'Import document',
      freezeSubtreeAfterAdd: false, // 不冻结子树，允许后续继续修改
    });
  }

  await applyImportedDocumentSettings(editor, doc, options); // 应用文档中的场景设置（环境/相机/渲染器等）
  editor.resetShiftMultiselectState(); // 清除多选状态，避免残留旧选中对象引用导致异常
  editor.render(); // 触发一次渲染，让所有新添加的对象立即显示在视口中
}
