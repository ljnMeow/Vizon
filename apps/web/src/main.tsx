import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * 应用入口：
 * - 挂载 React 根节点
 * - 包裹路由与全局样式
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter
        /**
         * React Router v7 行为变更的提前对齐开关（用于消除 Future Flag Warning）。
         * - v7_startTransition：路由导致的 state 更新将包裹在 React.startTransition 中
         * - v7_relativeSplatPath：splat（*）路由的相对路径解析行为将发生变化
         */
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
