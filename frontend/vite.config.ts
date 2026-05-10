import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
        // ── Socket.io WebSocket proxy ──────────────────────────────────────
        // Phải proxy '/socket.io' để WebSocket handshake đi qua Vite dev server
        '/socket.io': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          ws: true, // BẮT BUỘC: Enable WebSocket upgrade
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (err: any) => {
              // Bỏ qua lỗi ECONNABORTED do Vite/trình duyệt ngắt kết nối đột ngột
              if (err.code === 'ECONNABORTED') return;
            });
          }
        },
        '/assets': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/fonts': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/bg-removed': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});