import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// ─── ตรวจจับเวอร์ชันใหม่ (FIX-095) — กันแท็บ POS รันโค้ดเก่าค้างเป็นวันๆ ───
// build id = เวลาตอน build · เขียน dist/version.json + inject เป็น __BUILD_ID__
// หน้าเว็บ poll version.json แล้วเทียบ ถ้าต่าง = มี deploy ใหม่ → เตือนให้โหลด
const BUILD_ID = Date.now().toString();
function versionJsonPlugin(): Plugin {
  return {
    name: 'emit-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ v: BUILD_ID }),
      });
    },
  };
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), versionJsonPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://localhost:8081',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
