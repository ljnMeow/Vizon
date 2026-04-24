/// <reference types="vite/client" />

/**
 * Vite 注入到前端运行时的环境变量类型声明。
 *
 * 说明：
 * - 仅 `VITE_` 前缀变量会暴露给浏览器端代码。
 * - 这里声明 `VITE_API_BASE_URL`，便于 `request.ts` 读取时获得类型提示。
 */
interface ImportMetaEnv {
  /**
   * 可选的 API 基础地址。
   * - 为空：默认走同域相对路径（适合配合 Vite proxy）
   * - 非空：直接请求指定后端地址
   */
  readonly VITE_API_BASE_URL?: string;
}

/** 补充 ImportMeta 上的 env 类型，供 `import.meta.env` 使用。 */
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

