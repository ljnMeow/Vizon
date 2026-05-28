/**
 * 全局解码器配置（Draco）。
 *
 * 单例模式：DRACOLoader 内部会创建 Web Worker 池，
 * 共享实例避免重复创建。解码器 WASM 文件放在 apps/web/public/draco/ 下。
 */

import { DRACOLoader } from 'three-stdlib';

let _dracoLoader: DRACOLoader | null = null;

/** 获取或创建共享 DRACOLoader 实例。 */
export function getDRACOLoader(): DRACOLoader {
  if (!_dracoLoader) {
    _dracoLoader = new DRACOLoader();
    _dracoLoader.setDecoderPath('/draco/');
  }
  return _dracoLoader;
}

/** 销毁解码器实例（应用卸载时调用）。 */
export function disposeDecoders(): void {
  _dracoLoader?.dispose();
  _dracoLoader = null;
}
