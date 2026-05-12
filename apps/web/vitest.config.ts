import path from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';

export default mergeConfig(
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
      css: true,
    },
  }),
  {
    plugins: [react()],
    resolve: {
      alias: {
        'vizon-3d-core': path.resolve(__dirname, '../../packages/core/src'),
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
);
