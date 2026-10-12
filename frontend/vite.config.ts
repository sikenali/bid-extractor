import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // pdfjs-dist only touches @napi-rs/canvas inside Node-only code paths;
      // stub it so the browser bundle never pulls the native .node binary.
      '@napi-rs/canvas': path.resolve(__dirname, 'src/shims/napi-canvas.ts')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
