/**
 * 历史操作名称的国际化工具模块。
 *
 * 设计思路：
 * - 历史记录（undo/redo）的操作名在写入时为中文原始字符串
 * - 需要在 UI 展示时按当前语言动态翻译
 * - 提供两种编码格式：
 *   1. I18N_PREFIX 格式：将 {zh-CN, en-US} 序列化为 JSON 嵌入名称，精确翻译
 *   2. OP_PREFIX 格式：结构化操作描述（op/action/targetKind 等），按语言重新拼接
 * - 若两种格式均不匹配，回退到正则替换映射表（translateHistoryNameToEn）
 */
import type { Locale } from '../hooks/useLocale';
import { VIZON_HISTORY_KEYS } from './keys';

/** 历史操作名称的双语结构（存储格式） */
export type HistoryI18nName = {
  'zh-CN': string;
  'en-US': string;
};

/** 带语言前缀的历史名称标识，用于区分编码格式 */
const HISTORY_I18N_PREFIX = VIZON_HISTORY_KEYS.I18N_PREFIX;
/** 带操作结构前缀的历史名称标识，用于区分编码格式 */
const HISTORY_OP_PREFIX = VIZON_HISTORY_KEYS.OP_PREFIX;

/**
 * 将双语名称对象编码为带前缀的字符串，用于写入历史记录。
 * 解码时使用 decodeHistoryI18nName()。
 */
export function encodeHistoryI18nName(name: HistoryI18nName): string {
  return `${HISTORY_I18N_PREFIX}${JSON.stringify(name)}`;
}

/**
 * 将中文历史操作名通过正则映射表翻译为英文。
 * 此映射表覆盖常见的场景操作词汇，作为精确编码不可用时的兜底翻译。
 */
function translateHistoryNameToEn(zhName: string): string {
  const map: Array<[RegExp, string]> = [
    [/修改场景属性/g, 'Modify scene property'],
    [/修改物体属性/g, 'Modify object property'],
    [/修改正交相机属性/g, 'Modify orthographic camera property'],
    [/修改透视相机属性/g, 'Modify perspective camera property'],
    [/修改相机属性/g, 'Modify camera property'],
    [/修改平行光属性/g, 'Modify directional light property'],
    [/修改点光源属性/g, 'Modify point light property'],
    [/修改聚光灯属性/g, 'Modify spot light property'],
    [/修改环境光属性/g, 'Modify ambient light property'],
    [/修改半球光属性/g, 'Modify hemisphere light property'],
    [/修改矩形光属性/g, 'Modify rect area light property'],
    [/修改灯光属性/g, 'Modify light property'],
    [/拖拽物体/g, 'Move object'],
    [/旋转物体/g, 'Rotate object'],
    [/缩放物体/g, 'Scale object'],
    [/基础设置/g, 'Basic settings'],
    [/场景名称/g, 'Scene Name'],
    [/详细描述/g, 'Description'],
    [/环境强度/g, 'Environment Strength'],
    [/环境/g, 'Environment'],
    [/背景模式/g, 'Background mode'],
    [/背景颜色/g, 'Background color'],
    [/环境强度/g, 'Environment strength'],
    [/HDRI/g, 'HDRI'],
    [/纯色/g, 'Solid'],
    [/天空盒/g, 'Skybox'],
    [/相机/g, 'Camera'],
    [/FOV/g, 'FOV'],
    [/近平面/g, 'Near'],
    [/远平面/g, 'Far'],
    [/目标/g, 'Target'],
    [/位置/g, 'Position'],
    [/旋转/g, 'Rotation'],
    [/缩放/g, 'Scale'],
    [/重置/g, 'Reset'],
    [/名称/g, 'Name'],
    [/类型/g, 'Type'],
    [/可见/g, 'Visible'],
    [/可拾取/g, 'Pickable'],
    [/冻结/g, 'Frozen'],
    [/渲染层级/g, 'Render order'],
    [/产生阴影/g, 'Cast shadow'],
    [/接收阴影/g, 'Receive shadow'],
    [/视锥裁剪/g, 'Frustum culling'],
    [/可见 = true/g, 'Visible = true'],
    [/可见 = false/g, 'Visible = false'],
    [/可拾取 = true/g, 'Pickable = true'],
    [/可拾取 = false/g, 'Pickable = false'],
    [/冻结 = true/g, 'Frozen = true'],
    [/冻结 = false/g, 'Frozen = false'],
    [/产生阴影 = true/g, 'Cast shadow = true'],
    [/产生阴影 = false/g, 'Cast shadow = false'],
    [/接收阴影 = true/g, 'Receive shadow = true'],
    [/接收阴影 = false/g, 'Receive shadow = false'],
    [/视锥裁剪 = true/g, 'Frustum culling = true'],
    [/视锥裁剪 = false/g, 'Frustum culling = false'],
    [/网格/g, 'Grid'],
    [/显示开关/g, 'Visible'],
    [/颜色/g, 'Color'],
    [/不透明度/g, 'Opacity'],
    [/透明度/g, 'Opacity'],
    [/辅助器/g, 'Helpers'],
    [/坐标轴开关/g, 'Axes enabled'],
    [/坐标轴尺寸/g, 'Axes size'],
    [/渲染器/g, 'Renderer'],
    [/抗锯齿/g, 'Antialias'],
    [/输出色彩空间/g, 'Output color space'],
    [/色调映射/g, 'Tone mapping'],
    [/曝光/g, 'Exposure'],
    [/阴影类型/g, 'Shadow Type'],
    [/阴影开关/g, 'Shadow enabled'],
    [/阴影自动更新/g, 'Shadow auto update'],
    [/雾化开关/g, 'Fog enabled'],
    [/雾颜色/g, 'Fog color'],
    [/雾近距/g, 'Fog near'],
    [/雾远距/g, 'Fog far'],
    [/材质-材质类型/g, 'Material-Material type'],
    [/材质-混合模式/g, 'Material-Blending mode'],
    [/材质-透明开关/g, 'Material-Transparency'],
    [/材质-强制单通道/g, 'Material-Force single channel'],
    [/材质-不透明度/g, 'Material-Opacity'],
    [/材质-线框/g, 'Material-Wireframe'],
    [/材质-深度测试/g, 'Material-Depth test'],
    [/材质-深度写入/g, 'Material-Depth write'],
    [/材质-颜色/g, 'Material-Color'],
    [/材质-面/g, 'Material-Side'],
    [/材质-AlphaTest/g, 'Material-Alpha test'],
    [/名称/g, 'Name'],
    [/材质/g, 'Material'],
    [/正面/g, 'Front'],
    [/背面/g, 'Back'],
    [/双面/g, 'Double'],
    [/边框/g, 'Border'],
    [/辉光/g, 'Glow'],
    [/开关/g, 'Enabled'],
    [/宽度/g, 'Width'],
    [/范围/g, 'Range'],
    [/亮度/g, 'Brightness'],
    [/深度测试/g, 'Depth test'],
    [/深度写入/g, 'Depth write'],
    [/深度/g, 'Depth']
  ];
  let result = zhName;
  for (const [regex, replacement] of map) {
    result = result.replace(regex, replacement);
  }
  // 兜底修复：处理历史上已出现的中英混合（旧版本写入时未完整翻译）
  result = result.replace(/Environment强度/g, 'Environment Strength');
  result = result.replace(/阴影Type/g, 'Shadow Type');
  result = result.replace(/PCF软阴影（柔和）/g, 'PCF Soft');
  result = result.replace(/PCF软阴影/g, 'PCF');
  return result;
}

/**
 * 将历史名称规范化为纯中文（修复旧版混入英文片段的情况）。
 * 用于展示中文 UI 时，保证文本统一可读。
 */
function normalizeHistoryNameToZh(name: string): string {
  let result = name;
  result = result.replace(/Environment强度/g, '环境强度');
  result = result.replace(/阴影Type/g, '阴影类型');
  result = result.replace(/PCF Soft阴影/g, 'PCF软阴影');
  result = result.replace(/纯色\s*\(Solid\)/g, '纯色');
  result = result.replace(/天空盒\s*\(Skybox\)/g, '天空盒');
  result = result.replace(/\bFront\b/g, '正面');
  result = result.replace(/\bBack\b/g, '背面');
  result = result.replace(/\bDouble\b/g, '双面');
  return result;
}

/**
 * 自动将中文操作名编码为双语 I18N 格式。
 * - 若已是编码格式则直接返回，避免重复编码
 * - 英文版本由 translateHistoryNameToEn() 自动生成
 */
export function encodeHistoryI18nNameAuto(zhName: string): string {
  if (zhName.startsWith(HISTORY_I18N_PREFIX)) return zhName;
  return encodeHistoryI18nName({
    'zh-CN': zhName,
    'en-US': translateHistoryNameToEn(zhName)
  });
}

/**
 * 将编码后的历史操作名解码为当前语言的可读文本。
 *
 * 支持三种格式：
 * 1. OP_PREFIX 格式（结构化操作，如 transform/update_property）
 * 2. I18N_PREFIX 格式（双语 JSON 嵌入）
 * 3. 裸中文字符串（旧格式，通过映射表翻译或规范化）
 *
 * @param name   - 编码后的历史操作名
 * @param locale - 当前语言（'zh-CN' | 'en-US'）
 */
export function decodeHistoryI18nName(name: string, locale: Locale): string {
  if (name.startsWith(HISTORY_OP_PREFIX)) {
    const raw = name.slice(HISTORY_OP_PREFIX.length);
    try {
      const payload = JSON.parse(raw) as {
        op?: string;
        action?: string;
        targetKind?: string;
        uuid?: string;
        prop?: string;
        valueText?: string;
      };
      const targetMapZh: Record<string, string> = {
        object: '物体',
        orthographic_camera: '正交相机',
        perspective_camera: '透视相机',
        camera: '相机',
        directional_light: '平行光',
        point_light: '点光源',
        spot_light: '聚光灯',
        ambient_light: '环境光',
        hemisphere_light: '半球光',
        rect_area_light: '矩形光',
        light: '灯光'
      };
      const targetMapEn: Record<string, string> = {
        object: 'object',
        orthographic_camera: 'orthographic camera',
        perspective_camera: 'perspective camera',
        camera: 'camera',
        directional_light: 'directional light',
        point_light: 'point light',
        spot_light: 'spot light',
        ambient_light: 'ambient light',
        hemisphere_light: 'hemisphere light',
        rect_area_light: 'rect area light',
        light: 'light'
      };
      const targetZh = targetMapZh[payload.targetKind ?? 'object'] ?? '物体';
      const targetEn = targetMapEn[payload.targetKind ?? 'object'] ?? 'object';
      if (payload.op === 'transform') {
        const actionZh = payload.action === 'rotate' ? '旋转' : payload.action === 'scale' ? '缩放' : '拖拽';
        const actionEn = payload.action === 'rotate' ? 'Rotate' : payload.action === 'scale' ? 'Scale' : 'Move';
        return locale === 'zh-CN'
          ? `${actionZh}${targetZh} - ${payload.uuid ?? ''}`.trim()
          : `${actionEn} ${targetEn} - ${payload.uuid ?? ''}`.trim();
      }
      if (payload.op === 'update_property') {
        const rawProp = payload.prop ?? '';
        const rawValueText = payload.valueText ?? '';
        const prop = locale === 'zh-CN' ? normalizeHistoryNameToZh(rawProp) : translateHistoryNameToEn(rawProp);
        const localizedValueText =
          typeof rawValueText === 'string'
            ? locale === 'zh-CN'
              ? normalizeHistoryNameToZh(rawValueText)
              : translateHistoryNameToEn(rawValueText)
            : '';
        const valuePart = localizedValueText ? ` = ${localizedValueText}` : '';
        return locale === 'zh-CN'
          ? `修改${targetZh}属性 - ${payload.uuid ?? ''} - ${prop}${valuePart}`
          : `Modify ${targetEn} property - ${payload.uuid ?? ''} - ${prop}${valuePart}`;
      }
    } catch {
      // ignore and fallback to existing decode logic
    }
  }
  if (!name.startsWith(HISTORY_I18N_PREFIX)) {
    return locale === 'en-US' ? translateHistoryNameToEn(name) : normalizeHistoryNameToZh(name);
  }
  const raw = name.slice(HISTORY_I18N_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as Partial<HistoryI18nName>;
    const localized = locale === 'zh-CN' ? parsed['zh-CN'] : parsed['en-US'];
    if (typeof localized === 'string' && localized.trim()) {
      return locale === 'en-US' ? localized : normalizeHistoryNameToZh(localized);
    }
    if (typeof parsed['zh-CN'] === 'string') {
      return locale === 'en-US' ? translateHistoryNameToEn(parsed['zh-CN']) : normalizeHistoryNameToZh(parsed['zh-CN']);
    }
    return locale === 'en-US' ? translateHistoryNameToEn(name) : normalizeHistoryNameToZh(name);
  } catch {
    return locale === 'en-US' ? translateHistoryNameToEn(name) : normalizeHistoryNameToZh(name);
  }
}

