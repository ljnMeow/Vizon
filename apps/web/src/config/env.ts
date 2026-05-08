/**
 * 浏览器端环境变量访问与校验。
 *
 * 约束：
 * - 只有 `VITE_` 前缀会被 Vite 暴露到前端（安全边界）
 * - 这里集中做“规范化 + 兜底”，避免业务层到处写 `import.meta.env`
 */
export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!raw) return '';

  // 统一去掉末尾 `/`，避免 join 时出现 `//api/...` 的歧义
  const normalized = raw.replace(/\/$/, '');

  // 允许相对路径（例如 `/proxy`），也允许绝对 http(s)
  if (normalized.startsWith('/')) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;

  // 不抛异常：生产环境中“直接白屏”比“回退同域请求”更糟
  return '';
}

