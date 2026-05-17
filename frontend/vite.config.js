import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import frappeuiPlugin from 'frappe-ui/vite'

export default defineConfig({
  plugins: [
    vue(),
    frappeuiPlugin({
      frappeProxy: false,
      jinjaBootData: false,
      buildConfig: false,
    }),
  ],

  base: '/assets/frappe_sheets_next/frappe_sheets_next/',

  build: {
    outDir: '../frappe_sheets_next/public/frappe_sheets_next',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },

  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8001',
      '/assets': 'http://localhost:8001',
    },
  },

  optimizeDeps: {
    include: ['frappe-ui'],
  },
})
