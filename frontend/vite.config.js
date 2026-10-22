import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@napi-rs/canvas': path.resolve(__dirname, 'src/shims/napi-canvas.ts')
        }
    },
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia'],
    },

    // 生产构建产物预览：与开发服务同端口，便于本地以「构建态」联调（秒开）
    preview: {
      host: '127.0.0.1',
      port: 5101,
      headers: { 'Access-Control-Allow-Origin': '*' },
    },

    server: {
        host: '127.0.0.1',
        port: 5101,
        // Wujie 微前端通过 fetch 拉取子应用资源，必须放行跨域
        headers: { 'Access-Control-Allow-Origin': '*' },
        // 预热入口模块，避免首次点击时逐个模块请求造成长时间白屏
        warmup: {
          clientFiles: ['src/main.ts'],
        },
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true
            }
        }
    }
});
