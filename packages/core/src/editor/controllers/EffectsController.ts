import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VIZON_STORAGE_KEYS, VIZON_USER_DATA_KEYS } from '../../infra/utils';
import { VIZON_EDITOR_OVERLAY_LAYER, VIZON_SCENE_CONTENT_LAYER } from '../picking/pickLayers';

// Inspector 写入到 mesh.userData 的特效配置。
type BorderSettings = {
  borderEnabled: boolean;
  borderWidth: number;
  borderColor: string;
  glowEnabled: boolean;
  glowColor: string;
  glowRange: number;
  glowBrightness: number;
};

const DEFAULT_BORDER: BorderSettings = {
  borderEnabled: false,
  borderWidth: 1,
  borderColor: '#ff0000',
  glowEnabled: false,
  glowColor: '#66ccff',
  glowRange: 30,
  glowBrightness: 1
};

type BorderHelperRecord = {
  line: LineSegments2;
  geometry: LineSegmentsGeometry;
  material: LineMaterial;
};

/**
 * 最终混合 shader：
 * - `baseTexture`：正常场景渲染结果
 * - `bloomTexture`：经过 UnrealBloomPass 扩散后的贴图
 * - `glowSourceTexture`：未模糊的辉光源本体
 *
 * 这里不是简单 `base + bloom`，而是先做 `bloom - source`，只保留真正的外扩 halo，
 * 避免把辉光源本体再叠亮一遍，导致“整个物体/整帧一起变白”。
 */
const MIX_SHADER = {
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: null },
    glowSourceTexture: { value: null },
    bloomFactor: { value: 0.9 },
    haloThreshold: { value: 0.02 },
    haloSoftness: { value: 0.06 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: `
    uniform sampler2D baseTexture;
    uniform sampler2D bloomTexture;
    uniform sampler2D glowSourceTexture;
    uniform float bloomFactor;
    uniform float haloThreshold;
    uniform float haloSoftness;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D( baseTexture, vUv );
      vec3 bloom = texture2D( bloomTexture, vUv ).rgb;
      vec3 glowSource = texture2D( glowSourceTexture, vUv ).rgb;
      vec3 haloRaw = max( bloom - glowSource, vec3( 0.0 ) );
      float haloLevel = max( max( haloRaw.r, haloRaw.g ), haloRaw.b );
      float haloMask = smoothstep( haloThreshold, haloThreshold + haloSoftness, haloLevel );
      vec3 halo = haloRaw * haloMask * bloomFactor;
      gl_FragColor = vec4( base.rgb + halo, base.a );
    }
  `
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// UI 的“范围”滑杆是 0~60，运行时统一归一化到 0~1 再映射到具体 pass 参数。
function normalizeGlowRange(v: number) {
  return clamp(v / 60, 0, 1);
}

// UI 的“亮度”滑杆是 0~2；0 表示无效果，1 是默认值，2 为当前配置上限。
function normalizeGlowBrightness(v: number) {
  return clamp(v / 2, 0, 1);
}

// UnrealBloomPass.strength 的手感曲线。这里故意抬高中段，让默认值 1.0 也能稳定出光。
function mapGlowStrength(v: number) {
  const brightnessNorm = normalizeGlowBrightness(v);
  // 把 0~2 的中段抬起来，让默认值 1.0 也能有稳定可见的 bloom。
  return clamp(Math.pow(brightnessNorm, 0.82) * 0.92, 0, 0.92);
}

// UnrealBloomPass.radius 负责“扩散半径”，不是世界空间距离，因此这里做的是视觉手感映射。
function mapGlowRadius(v: number) {
  // UnrealBloomPass.radius 对 0~0.4 区间变化不明显，放大映射让“范围”更可感知。
  return clamp(normalizeGlowRange(v) * 0.9, 0, 0.9);
}

// 最终混合阶段的 halo 强度。与 bloom strength 分开控制，便于单独压制“整帧发白”。
function mapGlowMixFactor(range: number, brightness: number) {
  const rangeNorm = normalizeGlowRange(range);
  const brightnessNorm = normalizeGlowBrightness(brightness);
  // 合成阶段使用轻微“提中段”的曲线，保证默认 1.0 已经明显，但 2.0 仍有上升空间。
  return clamp(Math.pow(brightnessNorm, 0.78) * (0.28 + rangeNorm * 0.18), 0, 0.52);
}

// 高亮提取阈值。selective bloom 只看辉光源本体，因此阈值可以压得比通用 bloom 更低。
function mapGlowThreshold(_range: number, brightness: number) {
  const brightnessNorm = normalizeGlowBrightness(brightness);
  // selective bloom 只看辉光源本身，可以把阈值压低，保证默认亮度 1 就能稳定出光。
  return clamp(0.1 - brightnessNorm * 0.06, 0.04, 0.1);
}

// halo 二次裁切阈值：用于砍掉很淡的 bloom 雾，避免把网格/背景轻微洗亮。
function mapHaloThreshold(range: number) {
  const rangeNorm = normalizeGlowRange(range);
  // 稍微放低 halo 裁切，让默认亮度下的近物体光晕更容易被看见。
  return clamp(0.012 + rangeNorm * 0.022, 0.012, 0.034);
}

// halo 裁切的软边范围，防止阈值边界过硬导致光晕断层。
function mapHaloSoftness(range: number) {
  const rangeNorm = normalizeGlowRange(range);
  return clamp(0.035 + rangeNorm * 0.03, 0.035, 0.065);
}

// 对 userData 做统一兜底和裁剪，避免 UI 或导入旧数据把 runtime 搞脏。
function normalizeBorder(raw: any): BorderSettings {
  const borderEnabled = Boolean(raw?.borderEnabled ?? DEFAULT_BORDER.borderEnabled);
  const borderWidthRaw = raw?.borderWidth;
  const borderWidth = Number.isFinite(borderWidthRaw) ? Number(borderWidthRaw) : DEFAULT_BORDER.borderWidth;
  const borderColorRaw = typeof raw?.borderColor === 'string' ? raw.borderColor.trim() : DEFAULT_BORDER.borderColor;
  const borderColor = /^#([0-9a-fA-F]{6})$/.test(borderColorRaw) ? borderColorRaw : DEFAULT_BORDER.borderColor;
  const glowEnabled = Boolean(raw?.glowEnabled ?? DEFAULT_BORDER.glowEnabled);
  const glowColorRaw = typeof raw?.glowColor === 'string' ? raw.glowColor.trim() : DEFAULT_BORDER.glowColor;
  const glowColor = /^#([0-9a-fA-F]{6})$/.test(glowColorRaw) ? glowColorRaw : DEFAULT_BORDER.glowColor;
  const glowRangeRaw = raw?.glowRange;
  const glowRange = Number.isFinite(glowRangeRaw) ? Number(glowRangeRaw) : DEFAULT_BORDER.glowRange;
  const glowBrightnessRaw = raw?.glowBrightness;
  const glowBrightness = Number.isFinite(glowBrightnessRaw) ? Number(glowBrightnessRaw) : DEFAULT_BORDER.glowBrightness;
  return {
    borderEnabled,
    borderWidth: clamp(borderWidth, 1, 20),
    borderColor,
    glowEnabled,
    glowColor,
    glowRange: clamp(glowRange, 0, 60),
    glowBrightness: clamp(glowBrightness, 0, 2)
  };
}

function readBorderSettings(obj: THREE.Object3D): BorderSettings {
  return normalizeBorder((obj.userData as any)?.[VIZON_STORAGE_KEYS.EFFECTS]);
}

// 编辑器叠加层对象不应参与业务特效，否则选中 gizmo/辅助框时会污染 bloom 结果。
function isEditorOverlayObject(obj: THREE.Object3D) {
  if ((obj as any).isTransformControls) return true;
  if (obj.type === 'TransformControlsGizmo' || obj.type === 'TransformControlsPlane') return true;
  if (obj.name === 'TransformControlsEditor') return true;
  return obj.layers.isEnabled(VIZON_EDITOR_OVERLAY_LAYER) && !obj.layers.isEnabled(VIZON_SCENE_CONTENT_LAYER);
}

// 特效系统统一的“黑名单”：helper、隐藏编辑器对象、不可选装饰对象都从边框/辉光里排除。
function shouldExcludeFromEffects(obj: THREE.Object3D) {
  if (isEditorOverlayObject(obj)) return true;
  if ((obj.userData as any)?.[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE]) return true;
  if ((obj.userData as any)?.[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR]) return true;
  return false;
}

// 仅真实业务 mesh 参与特效；编辑器内部 helper 需要排除。
function isEffectTargetMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  if (!(obj as any)?.isMesh) return false;
  if (shouldExcludeFromEffects(obj)) return false;
  return true;
}

export class EffectsController {
  // 当前视口信息会同时影响 composer 尺寸和 fat line 的屏幕空间线宽。
  private viewportWidth = 1;
  private viewportHeight = 1;
  private pixelRatio = 1;
  // glowSourceTarget 保存“未模糊的辉光源本体”，供最终 shader 做 bloom-source 的差值。
  private glowSourceTarget: THREE.WebGLRenderTarget | null = null;
  // bloomComposer 只跑 selective bloom；finalComposer 负责正常场景 + halo 混合输出。
  private bloomComposer: EffectComposer | null = null;
  private finalComposer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private mixPass: ShaderPass | null = null;
  // bloom pass 中非辉光 mesh 会暂时换成纯黑材质，以保留遮挡但不贡献亮度。
  private readonly darkMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  // bloom pass 期间需要临时篡改场景对象的 material/visible，渲染后再恢复。
  private readonly originalMaterials = new Map<string, THREE.Material | THREE.Material[]>();
  private readonly originalVisibility = new Map<string, boolean>();
  // 按“颜色|亮度”缓存辉光材质，避免每帧为 bloom pass 分配新材质。
  private readonly glowMaterials = new Map<string, THREE.MeshBasicMaterial>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera
  ) {}

  /**
   * 与 renderer 建立后处理链。
   *
   * 这里维护两条链路：
   * 1. bloomComposer：只渲染 selective bloom 结果
   * 2. finalComposer：正常场景 RenderPass + 自定义 mix shader + OutputPass
   *
   * renderer 重建时必须重建这套资源，因为内部 render target 与像素比都和 renderer 绑定。
   */
  bindRenderer(renderer: THREE.WebGLRenderer) {
    const size = renderer.getSize(new THREE.Vector2());
    this.viewportWidth = Math.max(1, size.x);
    this.viewportHeight = Math.max(1, size.y);
    this.pixelRatio = Math.max(0.1, renderer.getPixelRatio());

    this.disposeComposersOnly();

    // UnrealBloomPass 的构造初始值只是占位；真正的参数会在每帧 render() 中按当前配置覆盖。
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(this.viewportWidth, this.viewportHeight), 0.35, 0.25, 0.92);
    bloomPass.threshold = 0.92;
    bloomPass.strength = 0.35;
    bloomPass.radius = 0.25;

    // 这张贴图不做 blur，只存“辉光源本体”，供 mix shader 扣出纯 halo。
    const glowSourceTarget = new THREE.WebGLRenderTarget(
      Math.max(1, Math.round(this.viewportWidth * this.pixelRatio)),
      Math.max(1, Math.round(this.viewportHeight * this.pixelRatio)),
      { type: THREE.HalfFloatType }
    );
    glowSourceTarget.texture.name = 'EffectsController.glowSource';

    // bloomComposer 不直接上屏，只生成 bloomTexture。
    const bloomComposer = new EffectComposer(renderer);
    bloomComposer.renderToScreen = false;
    bloomComposer.setPixelRatio(this.pixelRatio);
    bloomComposer.setSize(this.viewportWidth, this.viewportHeight);
    bloomComposer.addPass(new RenderPass(this.scene, this.camera));
    bloomComposer.addPass(bloomPass);

    // mixPass 读取正常场景和两张离屏纹理，合成最终可见结果。
    const mixPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: bloomComposer.renderTarget2.texture },
          glowSourceTexture: { value: glowSourceTarget.texture },
          bloomFactor: { value: 0.9 },
          haloThreshold: { value: 0.02 },
          haloSoftness: { value: 0.06 }
        },
        vertexShader: MIX_SHADER.vertexShader,
        fragmentShader: MIX_SHADER.fragmentShader
      }),
      'baseTexture'
    );
    mixPass.needsSwap = true;

    // finalComposer 始终作为最终输出路径，避免“有无辉光时渲染管线不同”导致观感跳变。
    const finalComposer = new EffectComposer(renderer);
    finalComposer.setPixelRatio(this.pixelRatio);
    finalComposer.setSize(this.viewportWidth, this.viewportHeight);
    finalComposer.addPass(new RenderPass(this.scene, this.camera));
    finalComposer.addPass(mixPass);
    finalComposer.addPass(new OutputPass());

    this.bloomPass = bloomPass;
    this.glowSourceTarget = glowSourceTarget;
    this.bloomComposer = bloomComposer;
    this.mixPass = mixPass;
    this.finalComposer = finalComposer;
  }

  /**
   * 同步视口尺寸：
   * - composer / render target 的尺寸
   * - LineMaterial 的 resolution（屏幕空间线宽依赖它）
   */
  resize(width: number, height: number, pixelRatio: number) {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.pixelRatio = Math.max(0.1, pixelRatio);
    this.bloomComposer?.setPixelRatio(this.pixelRatio);
    this.finalComposer?.setPixelRatio(this.pixelRatio);
    this.bloomComposer?.setSize(this.viewportWidth, this.viewportHeight);
    this.finalComposer?.setSize(this.viewportWidth, this.viewportHeight);
    this.glowSourceTarget?.setSize(
      Math.max(1, Math.round(this.viewportWidth * this.pixelRatio)),
      Math.max(1, Math.round(this.viewportHeight * this.pixelRatio))
    );

    this.scene.traverse((obj) => {
      if (!(obj as any).isMesh) return;
      const ud = obj.userData as Record<string, any> | undefined;
      const existing = ud?.[VIZON_USER_DATA_KEYS.HELPERS.BORDER_LINE_HELPER] as BorderHelperRecord | undefined;
      if (!existing) return;
      existing.material.resolution.set(this.viewportWidth, this.viewportHeight);
    });
  }

  /**
   * 单帧特效渲染主流程。
   *
   * 执行顺序：
   * 1. 遍历业务 mesh，收集 glowMap，并同步边框 helper
   * 2. 若没有可用后处理链，则回退到普通 renderer.render
   * 3. 若当前没有任何辉光对象，则仍走 finalComposer，但把 bloomFactor 置 0
   * 4. 若有辉光对象：
   *    - 先临时改写场景，让非辉光对象不贡献亮度但保留遮挡
   *    - 渲染 glowSourceTarget（本体）
   *    - 渲染 bloomComposer（扩散结果）
   *    - 恢复场景
   *    - 用 mix shader 合成 base + halo
   */
  render(renderer: THREE.WebGLRenderer) {
    let glowCount = 0;
    let glowRangeSum = 0;
    let glowBrightnessSum = 0;
    const glowMap = new Map<string, BorderSettings>();

    this.scene.traverse((obj) => {
      if (!isEffectTargetMesh(obj)) return;
      const mesh = obj;
      const effects = readBorderSettings(obj);
      // 边框 helper 没有单独的更新时机，所以放在 render 前做“懒同步”。
      if (effects.borderEnabled) {
        this.ensureBorderHelper(mesh, effects);
      } else {
        this.removeBorderHelper(mesh);
      }
      if (effects.glowEnabled) {
        glowMap.set(mesh.uuid, effects);
        glowCount += 1;
        glowRangeSum += effects.glowRange;
        glowBrightnessSum += effects.glowBrightness;
      }
    });

    // 如果后处理链还没绑好，说明 renderer 可能还在初始化/重建过程中，直接回退普通渲染。
    if (!this.bloomComposer || !this.finalComposer || !this.bloomPass || !this.mixPass || !this.glowSourceTarget) {
      renderer.render(this.scene, this.camera);
      return;
    }

    const mixUniforms = (this.mixPass.material as THREE.ShaderMaterial | undefined)?.uniforms as
      | Record<string, { value: unknown }>
      | undefined;

    // 没有任何 glow 对象时，不再跑 bloom，但仍走 finalComposer，避免开关特效导致整条管线变掉。
    if (glowCount === 0) {
      if (mixUniforms?.['bloomFactor']) mixUniforms['bloomFactor'].value = 0;
      this.finalComposer.render();
      return;
    }

    const avgGlowRange = glowRangeSum / glowCount;
    const avgGlowBrightness = glowBrightnessSum / glowCount;

    this.bloomPass.radius = mapGlowRadius(avgGlowRange);
    this.bloomPass.strength = mapGlowStrength(avgGlowBrightness);
    this.bloomPass.threshold = mapGlowThreshold(avgGlowRange, avgGlowBrightness);

    // selective bloom 期间把背景/雾都临时清掉，防止它们进入 bloom 结果。
    const oldBackground = this.scene.background;
    const oldFog = this.scene.fog;
    const oldClearColor = renderer.getClearColor(new THREE.Color());
    const oldClearAlpha = renderer.getClearAlpha();
    this.scene.background = null;
    this.scene.fog = null;
    renderer.setClearColor(0x000000, 1);

    // bloom pass 中非辉光 mesh 仍保留黑色占位，避免直接隐藏后丢失遮挡关系。
    // 顺序上先渲染 glowSource，再渲染 bloom，这样 mix shader 才能正确提取 halo。
    this.scene.traverse((obj) => this.prepareBloomScene(obj, glowMap));
    renderer.setRenderTarget(this.glowSourceTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.bloomComposer.render();
    this.scene.traverse((obj) => this.restoreBloomScene(obj));
    renderer.setRenderTarget(null);

    this.scene.background = oldBackground;
    this.scene.fog = oldFog;
    renderer.setClearColor(oldClearColor, oldClearAlpha);

    // 把本帧计算出的强度/阈值回填到 mix shader，最后统一从 finalComposer 输出。
    if (mixUniforms?.['bloomTexture']) mixUniforms['bloomTexture'].value = this.bloomComposer.renderTarget2.texture;
    if (mixUniforms?.['glowSourceTexture']) mixUniforms['glowSourceTexture'].value = this.glowSourceTarget.texture;
    if (mixUniforms?.['bloomFactor']) mixUniforms['bloomFactor'].value = mapGlowMixFactor(avgGlowRange, avgGlowBrightness);
    if (mixUniforms?.['haloThreshold']) mixUniforms['haloThreshold'].value = mapHaloThreshold(avgGlowRange);
    if (mixUniforms?.['haloSoftness']) mixUniforms['haloSoftness'].value = mapHaloSoftness(avgGlowRange);
    this.finalComposer.render();
    return;

    renderer.render(this.scene, this.camera);
  }

  /**
   * 释放控制器持有的 GPU 资源与运行时 helper。
   * 注意：这里只负责 EffectsController 自己创建出来的对象。
   */
  dispose() {
    this.disposeComposersOnly();
    this.darkMaterial.dispose();
    for (const m of this.glowMaterials.values()) m.dispose();
    this.glowMaterials.clear();
    this.originalMaterials.clear();
    this.originalVisibility.clear();

    this.scene.traverse((obj) => {
      if (!(obj as any).isMesh) return;
      this.removeBorderHelper(obj as THREE.Mesh);
    });
  }

  /**
   * 确保某个 mesh 拥有“边框线 helper”。
   *
   * 实现方式不是改原材质，而是：
   * - 从 mesh.geometry 提取一份 EdgesGeometry
   * - 转成 LineSegments2 + LineMaterial
   * - 作为子对象挂回 mesh
   *
   * 这样边框与原始材质解耦，也更容易按需创建/销毁。
   */
  private ensureBorderHelper(mesh: THREE.Mesh, border: BorderSettings) {
    const ud = (mesh.userData ??= {}) as Record<string, any>;
    const existing = ud[VIZON_USER_DATA_KEYS.HELPERS.BORDER_LINE_HELPER] as BorderHelperRecord | undefined;

    // 已存在 helper 时只做参数更新，避免重复分配几何和材质。
    if (existing) {
      const mat = existing.material;
      const curHex = `#${mat.color.getHexString()}`;
      if (curHex.toLowerCase() !== border.borderColor.toLowerCase()) {
        mat.color.set(border.borderColor);
      }
      mat.linewidth = clamp(border.borderWidth, 1, 20);
      mat.resolution.set(this.viewportWidth, this.viewportHeight);
      mat.needsUpdate = true;
      return;
    }

    const sourceGeometry = mesh.geometry;
    if (!sourceGeometry) return;
    // 用 EdgesGeometry 抽出轮廓线，再转成 fat line，才能支持可调的屏幕空间线宽。
    const edges = new THREE.EdgesGeometry(sourceGeometry);
    const pos = edges.getAttribute('position');
    if (!pos) {
      edges.dispose();
      return;
    }
    const positions = new Float32Array(pos.array as ArrayLike<number>);
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    edges.dispose();

    const material = new LineMaterial({
      color: border.borderColor,
      linewidth: clamp(border.borderWidth, 1, 20),
      worldUnits: false,
      dashed: false,
      alphaToCoverage: true,
      toneMapped: false
    });
    material.resolution.set(this.viewportWidth, this.viewportHeight);

    // 作为 mesh 子对象挂载，天然跟随原对象的 transform。
    const line = new LineSegments2(geometry, material);
    line.computeLineDistances();
    line.name = 'VizonBorderLine';
    (line.userData as any)[VIZON_USER_DATA_KEYS.COMMON.NON_SELECTABLE] = true;
    (line.userData as any)[VIZON_USER_DATA_KEYS.COMMON.HIDE_IN_EDITOR] = true;
    line.renderOrder = 999;
    mesh.add(line);
    ud[VIZON_USER_DATA_KEYS.HELPERS.BORDER_LINE_HELPER] = { line, geometry, material } satisfies BorderHelperRecord;
  }

  // 销毁边框 helper 及其 GPU 资源。
  private removeBorderHelper(mesh: THREE.Mesh) {
    const ud = mesh.userData as Record<string, any> | undefined;
    const existing = ud?.[VIZON_USER_DATA_KEYS.HELPERS.BORDER_LINE_HELPER] as BorderHelperRecord | undefined;
    if (!existing) return;
    existing.line.parent?.remove(existing.line);
    existing.geometry.dispose();
    existing.material.dispose();
    delete ud![VIZON_USER_DATA_KEYS.HELPERS.BORDER_LINE_HELPER];
  }

  /**
   * 把场景临时转换成“只为 bloom 服务”的版本。
   *
   * 规则：
   * - 编辑器内部对象：直接隐藏，避免 gizmo/helper 被提亮
   * - 非辉光业务 mesh：替换为黑材质，保留深度/遮挡但不贡献亮度
   * - 辉光业务 mesh：替换为纯色 MeshBasicMaterial，确保 bloom 只由 glowColor/brightness 决定
   * - line / points / sprite：统一隐藏，避免辅助线或精灵污染 bloom
   */
  private prepareBloomScene(obj: THREE.Object3D, glowMap: Map<string, BorderSettings>) {
    if (shouldExcludeFromEffects(obj)) {
      this.originalVisibility.set(obj.uuid, obj.visible);
      obj.visible = false;
      return;
    }

    if ((obj as any).isMesh) {
      const mesh = obj as THREE.Mesh;
      const effects = glowMap.get(mesh.uuid);
      this.originalMaterials.set(mesh.uuid, mesh.material);
      if (!effects) {
        // 不能直接 hidden，否则 glow 会“穿透”本该遮住它的模型。
        mesh.material = this.darkMaterial;
        return;
      }
      // bloom pass 里使用纯色自发光材质，避免原始贴图/灯光把亮度计算搞脏。
      mesh.material = this.getGlowMaterial(effects.glowColor, effects.glowBrightness);
      return;
    }

    const renderable =
      (obj as any).isLine ||
      (obj as any).isLineSegments ||
      (obj as any).isPoints ||
      (obj as any).isSprite;
    if (!renderable) return;
    this.originalVisibility.set(obj.uuid, obj.visible);
    obj.visible = false;
  }

  // 把 prepareBloomScene() 暂存的 visible/material 全部恢复回来。
  private restoreBloomScene(obj: THREE.Object3D) {
    const prevVisible = this.originalVisibility.get(obj.uuid);
    if (prevVisible !== undefined) {
      obj.visible = prevVisible;
      this.originalVisibility.delete(obj.uuid);
    }

    if (!(obj as any).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const original = this.originalMaterials.get(mesh.uuid);
    if (!original) return;
    mesh.material = original;
    this.originalMaterials.delete(mesh.uuid);
  }

  /**
   * 获取 bloom pass 用的“发光源材质”。
   *
   * 这里故意使用 MeshBasicMaterial：
   * - 不受场景灯光影响
   * - 颜色完全由 glowColor / brightness 决定
   * - 更适合拿来做 selective bloom 的稳定输入
   */
  private getGlowMaterial(hex: string, brightness: number) {
    const key = `${hex}|${brightness.toFixed(2)}`;
    const found = this.glowMaterials.get(key);
    if (found) return found;
    // 缓存不同颜色/亮度组合，避免每帧为 bloom pass 创建临时材质。
    const color = new THREE.Color(hex).multiplyScalar(Math.max(0, brightness));
    const material = new THREE.MeshBasicMaterial({ color });
    this.glowMaterials.set(key, material);
    return material;
  }

  // 仅销毁后处理链本身；供 bindRenderer() 重建和 dispose() 最终释放复用。
  private disposeComposersOnly() {
    this.glowSourceTarget?.dispose();
    this.glowSourceTarget = null;
    this.bloomComposer?.dispose();
    this.finalComposer?.dispose();
    this.bloomComposer = null;
    this.finalComposer = null;
    this.bloomPass = null;
    this.mixPass = null;
  }

}
