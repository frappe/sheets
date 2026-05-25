import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import frappeuiPlugin from 'frappe-ui/vite'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  plugins: [
    vue(),
    frappeuiPlugin({
      frappeProxy: false,
      jinjaBootData: false,
      buildConfig: false,
    }),
  ],

  base: '/assets/sheets/sheets/',

  build: {
    outDir: '../sheets/public/sheets',
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
