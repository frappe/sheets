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

  base: '/assets/spreadsheet/spreadsheet/',

  build: {
    outDir: '../spreadsheet/public/spreadsheet',
    emptyOutDir: true,
    // Vite emits .vite/manifest.json mapping logical sources (e.g.
    // `index.html`) to their content-hashed output filenames. The
    // Jinja template at spreadsheet/www/spreadsheet.html doesn't load
    // Vite's generated index.html directly — it's a Frappe-rendered
    // page — so spreadsheet/www/spreadsheet.py reads this manifest at
    // request time to inject the current bundle URLs. Without the
    // manifest the page would have no way to discover hashed names.
    manifest: true,
    rollupOptions: {
      output: {
        // Content hashes are the only reliable cache-bust for the
        // long-lived browser / CDN caches in front of this SPA.
        // Dynamic imports keep working because Rollup rewrites the
        // chunk URLs in the emitted JS at build time.
        entryFileNames: 'index.[hash].js',
        chunkFileNames: '[name].[hash].js',
        assetFileNames: '[name].[hash].[ext]',
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
