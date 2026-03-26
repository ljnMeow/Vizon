import * as THREE from 'three';
import { isNonSelectableInHierarchy } from '../picking/objectGuards';
import { configureRaycasterForScenePicking } from '../picking/pickLayers';
import { clamp, computeAverageCenterVec3, fromVec3, toVec3, type XYZ } from '../../infra/utils';

type ConduitPoint = XYZ;

/**
 * 读取并确保导线（conduit）编辑用的“局部点集 pointsLocal”。
 * 优先使用 mesh.userData 的版本化数据；若缺失，则从 TubeGeometry.parameters.path 推断；
 * 推断失败则使用与 defaultModels 保持一致的默认端点。
 */
function ensureConduitPointsLocal(mesh: THREE.Mesh): ConduitPoint[] {
  const ud = mesh.userData as any;
  const CURRENT_POINTS_VERSION = 2;
  if (
    ud.__vizonConduitPointsLocalVersion === CURRENT_POINTS_VERSION &&
    Array.isArray(ud.__vizonConduitPointsLocal) &&
    ud.__vizonConduitPointsLocal.length >= 2
  ) {
    return ud.__vizonConduitPointsLocal as ConduitPoint[];
  }

  // 尝试从 TubeGeometry.parameters.path 推断点：
  // - LineCurve3：使用 v1/v2 作为端点
  // - CatmullRomCurve3：使用 points 作为控制点
  // 注意：TubeGeometry.parameters 已经是“几何局部空间(geometry-local)”的坐标，
  // 不需要也不应该再做 worldToLocal（否则会引入重复坐标系变换误差）。
  const geom: any = (mesh as any).geometry;
  const path: any = geom?.parameters?.path;
  let pts: ConduitPoint[] | null = null;
  if (Array.isArray(path?.points) && path.points.length >= 2) {
    pts = path.points.map((p: THREE.Vector3) => fromVec3(p.clone()));
  } else if (path?.v1 && path?.v2) {
    const v1 = (path.v1 as THREE.Vector3).clone();
    const v2 = (path.v2 as THREE.Vector3).clone();
    pts = [fromVec3(v1), fromVec3(v2)];
  }

  if (!pts) {
    // 推断失败时使用默认端点（与 `packages/core/src/defaults/defaultModels.ts` 保持一致）。
    pts = [fromVec3(new THREE.Vector3(-0.6, 0, -0.2)), fromVec3(new THREE.Vector3(0.6, 0, 0))];
  }

  ud.__vizonConduitPointsLocal = pts;
  ud.__vizonConduitPointsLocalVersion = CURRENT_POINTS_VERSION;
  return pts;
}

// 从 conduit 当前 TubeGeometry 上读取几何参数，并对关键数值做 clamp 限幅。
function readTubeParams(mesh: THREE.Mesh) {
  const geom: any = (mesh as any).geometry;
  const p: any = geom?.parameters ?? {};
  return {
    tubularSegments: clamp(Number(p.tubularSegments ?? 20), 3, 512),
    radius: clamp(Number(p.radius ?? 0.14), 0.001, 50),
    radialSegments: clamp(Number(p.radialSegments ?? 12), 3, 256),
    closed: Boolean(p.closed ?? false)
  };
}

// 根据局部点集创建弯曲导线的 TubeGeometry（CurveCtor=CatmullRomCurve3）。
function buildTubeGeometryFromPoints(
  pointsLocal: ConduitPoint[],
  TubeGeometryCtor: any,
  CurveCtor: any,
  opts: { tubularSegments: number; radius: number; radialSegments: number; closed: boolean }
) {
  // 显式传入参数，避免 Array.map 的第二参数 index 影响到 toVec3 的类型推断。
  const pts = pointsLocal.map((p) => toVec3(p));
  const curve = new CurveCtor(pts);
  return new TubeGeometryCtor(curve, opts.tubularSegments, opts.radius, opts.radialSegments, opts.closed);
}

// 根据“两端点”创建直线导线 TubeGeometry（CurveCtor=LineCurve3）。
function buildStraightTubeGeometry(
  aLocal: ConduitPoint,
  bLocal: ConduitPoint,
  TubeGeometryCtor: any,
  LineCurveCtor: any,
  opts: { tubularSegments: number; radius: number; radialSegments: number; closed: boolean }
) {
  const v1 = toVec3(aLocal);
  const v2 = toVec3(bLocal);
  const curve = new LineCurveCtor(v1, v2);
  return new TubeGeometryCtor(curve, opts.tubularSegments, opts.radius, opts.radialSegments, opts.closed);
}

export class ConduitEditController {
  private dom: HTMLElement | null = null;
  private abort: AbortController | null = null;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private dragging = false;
  private dragNodeIndex: number | null = null;
  private dragPlane = new THREE.Plane();
  private dragHit = new THREE.Vector3();

  private activeConduit: THREE.Mesh | null = null;
  private helperGroup: THREE.Group | null = null;
  private nodes: THREE.Mesh[] = [];
  private maxConduitPoints = 12;

  // 为了避免每帧都重算 helper 节点位置：记录上一次同步 helper 时导线的 world 矩阵。
  // 如果矩阵没变，就无需再执行 local->world 转换与节点定位。
  private lastConduitWorldMatrix = new THREE.Matrix4();
  private lastConduitWorldMatrixValid = false;

  // 临时向量复用，减少 updateHelpersFromConduit 高频调用时的 GC 压力。
  private tmpVec3 = new THREE.Vector3();

  constructor(
    private readonly init: {
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      orbit: { enabled: boolean } | null;
    }
  ) {
    configureRaycasterForScenePicking(this.raycaster);
  }

  setDomElement(dom: HTMLElement) {
    this.dom = dom;
    this.rebindPointerEvents();
  }

  /** 每帧由编辑器渲染循环调用：同步 conduit 控制点 helper 的位置。 */
  update() {
    const conduit = this.activeConduit;
    if (!conduit) return;
    if (!this.helperGroup) return;

    // 只要在“拖动 conduit 节点”编辑过程中，helper 必须跟随拖拽实时变化。
    if (this.dragging) {
      // 这里的几何/transform 变更在指针事件回调中已触发 updateMatrixWorld(true)，
      // 但额外调用一次 updateMatrixWorld(false) 可以保证矩阵处于最新状态（同时避免对子树的额外遍历）。
      conduit.updateMatrixWorld(false);
      this.updateHelpersFromConduit();
      return;
    }

    // 非拖拽情况下：helper 节点位置只依赖当前导线的 world 矩阵与局部点集。
    // 局部点集在大多数时间不会变化，所以用矩阵变化作为触发条件可显著降低每帧 CPU 开销。
    conduit.updateMatrixWorld(false);
    if (this.lastConduitWorldMatrixValid && this.lastConduitWorldMatrix.equals(conduit.matrixWorld)) {
      return;
    }

    this.updateHelpersFromConduit();
  }

  /** 当 selection 可能变化时调用：确认是否为可编辑 conduit，并完成 helper 重新挂载/解绑。 */
  syncFromSelection(selected: THREE.Object3D | null) {
    const conduit = this.resolveConduit(selected);
    if (conduit !== this.activeConduit) {
      this.activeConduit = conduit;
      // 选择切换时强制刷新一次缓存：避免上一对象的 matrix 相等导致跳过同步。
      this.lastConduitWorldMatrixValid = false;
      this.remountHelpers();
    }

    // 当当前仍处于 activeConduit 上时，保持 helper 与 conduit 同步；否则释放 pointer 事件。
    if (this.activeConduit) {
      this.updateHelpersFromConduit();
      this.rebindPointerEvents();
    } else {
      this.disposePointerEvents();
    }
  }

  // 将 selection 映射为“可编辑导线（conduit）mesh”，不满足条件则返回 null。
  private resolveConduit(selected: THREE.Object3D | null): THREE.Mesh | null {
    if (!selected) return null;
    const obj: any = selected;
    const isConduit = obj?.userData?.__vizonDefaultModelKey === 'theConduit';
    const enabled = Boolean(obj?.userData?.__vizonConduitEditEnabled);
    if (isConduit && enabled && (obj as any).isMesh) return obj as THREE.Mesh;
    return null;
  }

  // 当 activeConduit 切换时：移除旧的控制点 helper，并根据新 conduit 重建 helper 与节点列表。
  private remountHelpers() {
    if (this.helperGroup) {
      this.helperGroup.parent?.remove(this.helperGroup);
      // 释放控制点节点的几何与材质，避免多次挂载造成 WebGL 内存泄漏。
      for (const n of this.nodes) {
        (n.geometry as any)?.dispose?.();
        const m = n.material as any;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
        else m?.dispose?.();
      }
      this.nodes = [];
      this.helperGroup = null;
    }

    const conduit = this.activeConduit;
    if (!conduit) return;

    const group = new THREE.Group();
    group.name = 'VizonConduitEditHelpers';
    (group.userData as any).hideInEditor = true;
    // 这里的策略是：节点保持在“内容层”参与可见/拾取过滤，
    // 同时通过材质 depthTest=false 来达到 overlay 式的“更容易看清”效果。
    group.renderOrder = 998;
    // 关键约束：
    // - 不要把 helpers 作为 conduit mesh 的子节点挂接到它的子树上。
    // - ThreeEditor 的选择框逻辑依赖 `selected.children.length` 来判断是否显示 BoxHelper。
    // - 如果 helpers 是子节点，会导致 BoxHelper 显示时机错误。
    this.init.scene.add(group);
    this.helperGroup = group;

    this.nodes = [];
    this.updateHelpersFromConduit();
  }

  // 根据当前 conduit 的 pointsLocal：生成/更新控制点节点数量与位置，并刷新 world 矩阵缓存。
  private updateHelpersFromConduit() {
    const conduit = this.activeConduit;
    if (!conduit || !this.helperGroup) return;
    const pts = ensureConduitPointsLocal(conduit);

    // 控制点数量与当前节点数量不一致时：重建节点（包含释放旧节点几何/材质）。
    if (this.nodes.length !== pts.length) {
      for (const n of this.nodes) {
        this.helperGroup?.remove(n);
        (n.geometry as any)?.dispose?.();
        const m = n.material as any;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
        else m?.dispose?.();
      }
      this.nodes = [];

      const createNode = (index: number, total: number) => {
        const g = new THREE.SphereGeometry(0.06, 16, 12);
        const color = index === 0 ? 0x22c55e : index === total - 1 ? 0xef4444 : 0x60a5fa;
        const m = new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          transparent: true,
          opacity: 0.95
        });
        const node = new THREE.Mesh(g, m);
        node.name = `VizonConduitNode-${index}`;
        (node.userData as any).hideInEditor = true;
        (node.userData as any).__vizonConduitNode = { index };
        node.renderOrder = 999;
        (node.userData as any).__vizonPickTarget = conduit;
        this.helperGroup!.add(node);
        this.nodes.push(node);
      };

      if (pts.length >= 2) {
        for (let i = 0; i < pts.length; i++) createNode(i, pts.length);
      }
    }

    // 将控制点从 conduit 的 local 坐标转换到 world 坐标，并更新 helper 节点位置。
    for (let i = 0; i < this.nodes.length; i++) {
      // 复用临时 Vector3：避免每帧/每次更新时频繁 new。
      this.tmpVec3.set(pts[i].x, pts[i].y, pts[i].z);
      conduit.localToWorld(this.tmpVec3);
      this.nodes[i].position.copy(this.tmpVec3);
      (this.nodes[i].userData as any).__vizonConduitNode.index = i;
    }

    // 更新缓存矩阵：下一帧如果 matrixWorld 不变就可以跳过同步。
    this.lastConduitWorldMatrix.copy(conduit.matrixWorld);
    this.lastConduitWorldMatrixValid = true;
  }

  // 在 dom、activeConduit、helperGroup 都就绪时，把 conduit 专用交互事件绑定到 dom 上。
  private rebindPointerEvents() {
    if (!this.dom) return;
    if (!this.activeConduit || !this.helperGroup) return;
    this.attachPointerEvents(this.dom);
  }

  // 绑定 conduit 节点交互：
  // - pointerdown：选中控制点并进入 dragging（拖拽约束由 dragPlane 决定）
  // - pointermove：实时更新控制点位置 -> recenter -> 重建 tube geometry -> 更新 helper
  // - pointerup：结束拖拽并恢复 orbit
  // - dblclick：在命中位置插入新控制点（并重建）
  private attachPointerEvents(dom: HTMLElement) {
    this.disposePointerEvents();
    this.abort = new AbortController();
    const signal = this.abort.signal;

    // 单击：选择控制点（sphere node）并进入拖拽模式。
    const onPointerDown = (e: PointerEvent) => {
      if (!this.activeConduit || !this.dom) return;
      if (e.button !== 0) return;
      if (this.dragging) return;

      const rect = this.dom.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(1, rect.width);
      const y = (e.clientY - rect.top) / Math.max(1, rect.height);
      this.ndc.set(x * 2 - 1, -(y * 2 - 1));
      this.raycaster.setFromCamera(this.ndc, this.init.camera);

      // 只与控制点 nodes 相交：确保拾取/拖拽的目标是节点点，而非整段 conduit 网格。
      const hits = this.raycaster.intersectObjects(this.nodes, true);
      const hit = hits[0];
      if (!hit) return;

      const node = hit.object as THREE.Object3D;
      const nodeData = (node.userData as any).__vizonConduitNode as { index: number } | undefined;
      if (!nodeData) return;
      if (isNonSelectableInHierarchy(node)) return;

      this.dragging = true;
      this.dragNodeIndex = nodeData.index;

      // 构建拖拽平面：平面法线朝向相机，并穿过命中点 hit.point，
      // 使得指针移动能稳定映射到一个约束平面上的 3D 交点。
      const camDir = new THREE.Vector3();
      this.init.camera.getWorldDirection(camDir);
      this.dragPlane.setFromNormalAndCoplanarPoint(camDir, hit.point);

      // 拖拽期间禁用 OrbitControls，避免相机旋转与点拖拽互相干扰。
      if (this.init.orbit) this.init.orbit.enabled = false;

      // 阻止事件冒泡：避免 core 在 dragging 期间误触发其他选择逻辑。
      e.stopPropagation();
    };

    // 双击：在当前射线命中位置插入新控制点（控制点数量受 maxConduitPoints 限制）。
    const onDoubleClick = (e: MouseEvent) => {
      if (!this.activeConduit) return;
      if (e.button !== 0) return;
      if (this.dragging) return;

      const rect = this.dom!.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(1, rect.width);
      const y = (e.clientY - rect.top) / Math.max(1, rect.height);
      this.ndc.set(x * 2 - 1, -(y * 2 - 1));
      this.raycaster.setFromCamera(this.ndc, this.init.camera);

      const hits = this.raycaster.intersectObject(this.activeConduit, true);
      const hit = hits[0];
      if (!hit) return;

      const pts = ensureConduitPointsLocal(this.activeConduit);
      if (pts.length >= this.maxConduitPoints) return;

      const local = this.activeConduit.worldToLocal(hit.point.clone());

      // 避免在已有点附近重复添加：使用 eps 阈值做最近点距离过滤。
      const eps = 1e-3;
      const localVec = toVec3(fromVec3(local));
      let nearest = Infinity;
      for (const p of pts) {
        const d = localVec.distanceTo(toVec3(p));
        nearest = Math.min(nearest, d);
      }
      if (nearest < eps) return;

      // 将新点插入到“距离最接近线段”的后端：使用相邻点对组成的 segment 计算最短距离。
      let bestSeg = 0;
      let bestDist = Infinity;
      const pVec = localVec;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = toVec3(pts[i]);
        const b = toVec3(pts[i + 1]);
        const ab = b.clone().sub(a);
        const abLenSq = ab.lengthSq();
        if (abLenSq < 1e-12) continue;
        const t = Math.max(0, Math.min(1, pVec.clone().sub(a).dot(ab) / abLenSq));
        const closest = a.add(ab.multiplyScalar(t));
        const dist = closest.distanceTo(pVec);
        if (dist < bestDist) {
          bestDist = dist;
          bestSeg = i;
        }
      }

      const insertIndex = bestSeg + 1;
      pts.splice(insertIndex, 0, fromVec3(local));

      const normalized = this.recenterConduitOrigin(pts);
      const ud = this.activeConduit.userData as any;
      ud.__vizonConduitPointsLocal = normalized;
      ud.__vizonConduitPointsLocalVersion = 2;

      this.rebuildConduitGeometry(normalized);
      this.updateHelpersFromConduit();
      e.stopPropagation();
    };

    // 拖动移动：将 dragPlane 的交点映射回 conduit local，并更新对应控制点。
    const onPointerMove = (e: PointerEvent) => {
      if (!this.activeConduit || !this.dom) return;
      if (!this.dragging || this.dragNodeIndex == null) return;

      const rect = this.dom.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(1, rect.width);
      const y = (e.clientY - rect.top) / Math.max(1, rect.height);
      this.ndc.set(x * 2 - 1, -(y * 2 - 1));
      this.raycaster.setFromCamera(this.ndc, this.init.camera);
      if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.dragHit)) return;

      // 将拖拽平面交点从 world 坐标转换为 conduit 的 local 坐标，再写回 pointsLocal。
      const local = this.activeConduit.worldToLocal(this.dragHit.clone());
      const pts = ensureConduitPointsLocal(this.activeConduit);
      if (pts.length < 2) return;

      const idx = this.dragNodeIndex;
      if (idx >= 0 && idx < pts.length) {
        pts[idx] = fromVec3(local);
      }

      const normalized = this.recenterConduitOrigin(pts);

      const ud = this.activeConduit.userData as any;
      ud.__vizonConduitPointsLocal = normalized;
      ud.__vizonConduitPointsLocalVersion = 2;
      this.rebuildConduitGeometry(normalized);
      this.updateHelpersFromConduit();
      e.stopPropagation();
    };

    // 抬起：结束拖拽并恢复 OrbitControls，避免相机一直保持禁用状态。
    const onPointerUp = (e: PointerEvent) => {
      if (!this.activeConduit) return;
      if (!this.dragging) return;
      this.dragging = false;
      this.dragNodeIndex = null;
      if (this.init.orbit) this.init.orbit.enabled = true;
      e.stopPropagation();
    };

    dom.addEventListener('pointerdown', onPointerDown, { capture: true, signal });
    dom.addEventListener('pointermove', onPointerMove, { capture: true, signal });
    dom.addEventListener('pointerup', onPointerUp, { capture: true, signal });
    dom.addEventListener('dblclick', onDoubleClick, { capture: true, signal });
  }

  // 根据 pointsLocal 重建导线 TubeGeometry：
  // - 2 点：生成直线 Tube
  // - >=3 点：生成 CatmullRom 曲线 Tube
  private rebuildConduitGeometry(pointsLocal: ConduitPoint[]) {
    const conduit = this.activeConduit;
    if (!conduit) return;

    const geom: any = (conduit as any).geometry;
    const TubeGeometryCtor = geom?.constructor;
    if (!TubeGeometryCtor) return;

    const params = readTubeParams(conduit);

    let nextGeom: any = null;
    // 2 点：直线（LineCurve3）
    // >=3：曲线（CatmullRomCurve3）
    if (pointsLocal.length === 2) {
      nextGeom = buildStraightTubeGeometry(
        pointsLocal[0],
        pointsLocal[1],
        TubeGeometryCtor,
        (THREE as any).LineCurve3,
        params
      );
    } else {
      nextGeom = buildTubeGeometryFromPoints(
        pointsLocal,
        TubeGeometryCtor,
        (THREE as any).CatmullRomCurve3,
        params
      );
    }

    if (!nextGeom) return;
    try {
      (conduit as any).geometry = nextGeom;
    } finally {
      geom?.dispose?.();
    }
    conduit.updateMatrixWorld(true);
  }

  /**
   * 用点集的中心作为“基准”重建 local 坐标系，并把 mesh transform 平移到该中心。
   * 这样做的目标是：
   * - 保持世界空间下导线的曲线形状不发生跳变；
   * - 让对象 origin（以及 transform gizmo）跟随导线“视觉中心”移动，编辑体验更直观。
   */
  private recenterConduitOrigin(pointsLocal: ConduitPoint[]) {
    const conduit = this.activeConduit;
    if (!conduit || pointsLocal.length === 0) return pointsLocal;

    const centerLocal = computeAverageCenterVec3(pointsLocal);
    if (centerLocal.lengthSq() < 1e-12) return pointsLocal;

    const centerWorld = conduit.localToWorld(centerLocal.clone());
    if (conduit.parent) {
      conduit.position.copy(conduit.parent.worldToLocal(centerWorld.clone()));
    } else {
      conduit.position.copy(centerWorld);
    }
    conduit.updateMatrixWorld(true);

    return pointsLocal.map((p) => ({
      x: p.x - centerLocal.x,
      y: p.y - centerLocal.y,
      z: p.z - centerLocal.z
    }));
  }

  private disposePointerEvents() {
    // 中止当前 dom 上的 conduit 交互事件监听（切换 selected 或销毁时会触发）。
    this.abort?.abort();
    this.abort = null;
  }
}

