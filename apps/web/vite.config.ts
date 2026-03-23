import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'vizon-3d-core': path.resolve(__dirname, '../../packages/core/src'),
      '@repo/utils': path.resolve(__dirname, '../../packages/utils/src')
    }
  },
  server: {
    port: 5173,
    /**
     * 开发环境代理：用同域 `/api/*` 访问后端，避免浏览器 CORS 限制。
     *
     * 使用方式：
     * - 前端请求：`/api/auth/login/`
     * - Vite 自动转发到：`http://127.0.0.1:5018/api/auth/login/`
     *
     * 注意：若你在 `.env` 配置了 `VITE_API_BASE_URL=http://127.0.0.1:5018/`，
     * 浏览器会直接跨域请求后端（触发 CORS）。开发时建议留空，让请求走代理。
     */
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5018',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
