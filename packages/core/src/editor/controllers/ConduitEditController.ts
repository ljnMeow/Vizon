import * as THREE from 'three';
import { isNonSelectableInHierarchy } from '../picking/objectGuards';
import { configureRaycasterForScenePicking } from '../picking/pickLayers';

type ConduitPoint = { x: number; y: number; z: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toVec3(p: ConduitPoint) {
  return new THREE.Vector3(p.x, p.y, p.z);
}

function fromVec3(v: THREE.Vector3): ConduitPoint {
  return { x: v.x, y: v.y, z: v.z };
}

function computePointsCenterLocal(points: ConduitPoint[]) {
  if (points.length === 0) return new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const p of points) c.add(toVec3(p));
  c.multiplyScalar(1 / points.length);
  return c;
}

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
    // Match defaults in `packages/core/src/defaults/defaultModels.ts`
    pts = [fromVec3(new THREE.Vector3(-0.6, 0, -0.2)), fromVec3(new THREE.Vector3(0.6, 0, 0))];
  }

  ud.__vizonConduitPointsLocal = pts;
  ud.__vizonConduitPointsLocalVersion = CURRENT_POINTS_VERSION;
  return pts;
}

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

function buildTubeGeometryFromPoints(
  pointsLocal: ConduitPoint[],
  TubeGeometryCtor: any,
  CurveCtor: any,
  opts: { tubularSegments: number; radius: number; radialSegments: number; closed: boolean }
) {
  const pts = pointsLocal.map(toVec3);
  const curve = new CurveCtor(pts);
  return new TubeGeometryCtor(curve, opts.tubularSegments, opts.radius, opts.radialSegments, opts.closed);
}

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

  /** Called every frame from editor render loop. */
  update() {
    if (!this.activeConduit) return;
    this.updateHelpersFromConduit();
  }

  /** Called when selection might have changed. */
  syncFromSelection(selected: THREE.Object3D | null) {
    const conduit = this.resolveConduit(selected);
    if (conduit !== this.activeConduit) {
      this.activeConduit = conduit;
      this.remountHelpers();
    }

    // Keep helpers in sync if active
    if (this.activeConduit) {
      this.updateHelpersFromConduit();
      this.rebindPointerEvents();
    } else {
      this.disposePointerEvents();
    }
  }

  private resolveConduit(selected: THREE.Object3D | null): THREE.Mesh | null {
    if (!selected) return null;
    const obj: any = selected;
    const isConduit = obj?.userData?.__vizonDefaultModelKey === 'theConduit';
    const enabled = Boolean(obj?.userData?.__vizonConduitEditEnabled);
    if (isConduit && enabled && (obj as any).isMesh) return obj as THREE.Mesh;
    return null;
  }

  private remountHelpers() {
    if (this.helperGroup) {
      this.helperGroup.parent?.remove(this.helperGroup);
      // dispose node geometries/materials
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
    // keep visible in overlay layer so it draws above; but still pickable? (raycaster excludes overlay)
    // We instead keep it in content layer but apply overlay-ish style on material (depthTest=false).
    group.renderOrder = 998;
    // IMPORTANT:
    // Don't attach helpers as a child of the conduit mesh.
    // ThreeEditor selection box helper uses `selected.children.length` to decide whether to show BoxHelper.
    // If helpers are children, it will show BoxHelper incorrectly.
    this.init.scene.add(group);
    this.helperGroup = group;

    this.nodes = [];
    this.updateHelpersFromConduit();
  }

  private updateHelpersFromConduit() {
    const conduit = this.activeConduit;
    if (!conduit || !this.helperGroup) return;
    const pts = ensureConduitPointsLocal(conduit);

    // Recreate nodes if count mismatch
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

    // Position nodes (scene root => local->world)
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodes[i].position.copy(conduit.localToWorld(toVec3(pts[i])));
      (this.nodes[i].userData as any).__vizonConduitNode.index = i;
    }
  }

  private rebindPointerEvents() {
    if (!this.dom) return;
    if (!this.activeConduit || !this.helperGroup) return;
    this.attachPointerEvents(this.dom);
  }

  private attachPointerEvents(dom: HTMLElement) {
    this.disposePointerEvents();
    this.abort = new AbortController();
    const signal = this.abort.signal;

    const onPointerDown = (e: PointerEvent) => {
      if (!this.activeConduit || !this.dom) return;
      if (e.button !== 0) return;
      if (this.dragging) return;

      const rect = this.dom.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(1, rect.width);
      const y = (e.clientY - rect.top) / Math.max(1, rect.height);
      this.ndc.set(x * 2 - 1, -(y * 2 - 1));
      this.raycaster.setFromCamera(this.ndc, this.init.camera);

      // Only raycast nodes
      const hits = this.raycaster.intersectObjects(this.nodes, true);
      const hit = hits[0];
      if (!hit) return;

      const node = hit.object as THREE.Object3D;
      const nodeData = (node.userData as any).__vizonConduitNode as { index: number } | undefined;
      if (!nodeData) return;
      if (isNonSelectableInHierarchy(node)) return;

      this.dragging = true;
      this.dragNodeIndex = nodeData.index;

      // Build drag plane facing camera through hit point
      const camDir = new THREE.Vector3();
      this.init.camera.getWorldDirection(camDir);
      this.dragPlane.setFromNormalAndCoplanarPoint(camDir, hit.point);

      // Disable orbit during drag
      if (this.init.orbit) this.init.orbit.enabled = false;

      // Prevent core pointerdown selecting other things while dragging
      e.stopPropagation();
    };

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

      // Avoid adding near existing points
      const eps = 1e-3;
      const localVec = toVec3(fromVec3(local));
      let nearest = Infinity;
      for (const p of pts) {
        const d = localVec.distanceTo(toVec3(p));
        nearest = Math.min(nearest, d);
      }
      if (nearest < eps) return;

      // Insert after closest segment
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

    const onPointerMove = (e: PointerEvent) => {
      if (!this.activeConduit || !this.dom) return;
      if (!this.dragging || this.dragNodeIndex == null) return;

      const rect = this.dom.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(1, rect.width);
      const y = (e.clientY - rect.top) / Math.max(1, rect.height);
      this.ndc.set(x * 2 - 1, -(y * 2 - 1));
      this.raycaster.setFromCamera(this.ndc, this.init.camera);
      if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.dragHit)) return;

      // Convert world hit to conduit-local point
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

  private rebuildConduitGeometry(pointsLocal: ConduitPoint[]) {
    const conduit = this.activeConduit;
    if (!conduit) return;

    const geom: any = (conduit as any).geometry;
    const TubeGeometryCtor = geom?.constructor;
    if (!TubeGeometryCtor) return;

    const params = readTubeParams(conduit);

    let nextGeom: any = null;
    // 2 points => straight line, >=3 => CatmullRom
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
   * Re-base local points around their center and move mesh transform to that center in world space.
   * This keeps world-space conduit shape unchanged while making object origin (and transform gizmo)
   * follow the edited conduit.
   */
  private recenterConduitOrigin(pointsLocal: ConduitPoint[]) {
    const conduit = this.activeConduit;
    if (!conduit || pointsLocal.length === 0) return pointsLocal;

    const centerLocal = computePointsCenterLocal(pointsLocal);
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
    this.abort?.abort();
    this.abort = null;
  }
}

