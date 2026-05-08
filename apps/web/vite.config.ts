import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'vizon-3d-core': path.resolve(__dirname, '../../packages/core/src'),
      '@repo/utils': path.resolve(__dirname, '../../packages/utils/src'),
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * - 把稳定、体积大的依赖拆到独立 chunk，提升浏览器缓存命中率
         * - 把 3D 相关依赖单独拆出，避免普通页面（如登录页）首屏背重包
         *
         * 注意：
         * - 本项目通过 alias 直接引用 `packages/core/src`，它不是 node_modules；
         *   所以对 `vizon-3d-core` 的拆分要依赖“实际 import 的模块 id”命中规则。
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('/react-router-dom/') || id.includes('/react-router/')) return 'vendor-router';
          if (id.includes('/react-dom/') || id.includes('/react/')) return 'vendor-react';

          // three.js 生态（如果 core 内部依赖了 three，这里会命中）
          if (id.includes('/three/')) return 'vendor-three';

          // 其他第三方依赖兜底
          return 'vendor';
        }
      }
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
