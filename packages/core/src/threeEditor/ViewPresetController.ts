import * as THREE from 'three';
import type { OrbitControls } from 'three-stdlib';
import type { ViewPreset, ViewTransitionOptions } from '../ThreeEditor';
import { easeInOutCubic } from '../utils/math';

/**
 * ViewPresetController：
 * 负责把 `ViewPreset` 切换转为相机（position + orbit.target）的动画变换。
 *
 * 它不直接处理 UI，仅提供：
 * - `setViewPreset`：执行视角切换（可选 immediate/渐变）
 * - `cancel`：停止正在进行的 RAF 动画
 */
export class ViewPresetController {
  private viewPreset: ViewPreset = 'default';
  private viewTransitionRaf: number | null = null;

  constructor(private camera: THREE.PerspectiveCamera, private orbit: OrbitControls) {}

  /**
   * 当 core 因 renderer 重建导致 orbit 实例变化时，需要把最新 orbit 注入进来。
   */
  setOrbit(nextOrbit: OrbitControls) {
    this.orbit = nextOrbit;
  }

  setCamera(nextCamera: THREE.PerspectiveCamera) {
    this.camera = nextCamera;
  }

  /**
   * 获取最近一次设置的视角预设（不反推用户自由旋转后的变化）。
   */
  getViewPreset() {
    return this.viewPreset;
  }

  /**
   * 切换视图预设：以 `orbit.target` 为中心保持半径不变，
   * 然后将相机方位调整为常见前/后/左/右/上/下视角。
   */
  setViewPreset(preset: ViewPreset, opts?: ViewTransitionOptions) {
    this.viewPreset = preset;

    const easing = opts?.easing ?? easeInOutCubic;
    const durationMs = Math.max(0, opts?.durationMs ?? 260);
    const animateTarget = opts?.animateTarget ?? true;

    const targetTo = this.orbit.target.clone();
    const radius = Math.max(1e-6, this.camera.position.distanceTo(targetTo));

    const dir = new THREE.Vector3();
    switch (preset) {
      case 'front':
        dir.set(0, 0, 1);
        break;
      case 'back':
        dir.set(0, 0, -1);
        break;
      case 'left':
        dir.set(-1, 0, 0);
        break;
      case 'right':
        dir.set(1, 0, 0);
        break;
      case 'top':
        dir.set(0, 1, 0);
        break;
      case 'bottom':
        dir.set(0, -1, 0);
        break;
      case 'default':
      default:
        // 轻量“等轴/斜视”默认视角：兼顾体感与可读性
        dir.set(1, 0.8, 1).normalize();
        break;
    }

    const posTo = targetTo.clone().addScaledVector(dir.normalize(), radius);

    if (opts?.immediate || durationMs === 0) {
      this.cancel();
      this.camera.position.copy(posTo);
      if (animateTarget) this.orbit.target.copy(targetTo);
      this.camera.lookAt(this.orbit.target);
      this.camera.updateProjectionMatrix();
      this.orbit.update();
      return;
    }

    this.animateViewTo(
      { position: posTo, target: targetTo },
      { durationMs, easing, animateTarget }
    );
  }

  cancel() {
    // 停止未完成的 RAF 动画，避免切换预设后仍继续拉动相机。
    if (this.viewTransitionRaf != null) cancelAnimationFrame(this.viewTransitionRaf);
    this.viewTransitionRaf = null;
  }

  private animateViewTo(
    to: { position: THREE.Vector3; target: THREE.Vector3 },
    opts: { durationMs: number; easing: (t: number) => number; animateTarget: boolean }
  ) {
    this.cancel();

    const fromPos = this.camera.position.clone();
    const fromTarget = this.orbit.target.clone();
    const toPos = to.position.clone();
    const toTarget = to.target.clone();

    const start = performance.now();
    const tick = (now: number) => {
      const rawT = (now - start) / Math.max(1, opts.durationMs);
      const t = rawT >= 1 ? 1 : rawT <= 0 ? 0 : rawT;
      const k = opts.easing(t);

      this.camera.position.lerpVectors(fromPos, toPos, k);
      if (opts.animateTarget) this.orbit.target.lerpVectors(fromTarget, toTarget, k);

      this.camera.lookAt(this.orbit.target);
      this.camera.updateProjectionMatrix();
      this.orbit.update();

      if (t < 1) {
        this.viewTransitionRaf = requestAnimationFrame(tick);
      } else {
        this.viewTransitionRaf = null;
      }
    };

    this.viewTransitionRaf = requestAnimationFrame(tick);
  }
}

