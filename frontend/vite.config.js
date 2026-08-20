import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy API calls to the Express backend so the browser stays same-origin.
const target = process.env.VITE_PROXY_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': { target, changeOrigin: true },
      '/api': { target, changeOrigin: true },
      '/assignments': { target, changeOrigin: true },
      '/uploads': { target, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    // Manual chunking keeps the initial bundle small; combined with route-level
    // React.lazy this avoids the "cold" hang on free hosts like Render.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
        },
      },
    },
  },
});
