import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import frappeuiPlugin from 'frappe-ui/vite'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
    // Per-file environment overrides — Vue component tests opt into
    // happy-dom via a `// @vitest-environment happy-dom` header.
    // Default stays `node` so the existing 950+ engine/unit tests
    // don't pay the cost of standing up a DOM on every run.
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
    // Vite emits .vite/manifest.json mapping logical sources (e.g.
    // `index.html`) to their content-hashed output filenames. The
    // Jinja template at sheets/www/sheets.html doesn't load Vite's
    // generated index.html directly — it's a Frappe-rendered page —
    // so sheets/www/sheets.py reads this manifest at request time to
    // inject the current bundle URLs. Without the manifest the page
    // would have no way to discover hashed names.
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
      '/assets': {
        target: 'http://localhost:8001',
        // The app's own base path (`/assets/sheets/sheets/`) overlaps the
        // `/assets` prefix Frappe serves backend static files from. In dev,
        // Vite must serve the app itself under that path — only genuine
        // backend assets (frappe-ui fonts, other apps) should be proxied —
        // so skip proxying anything under the SPA's base.
        bypass: (req) =>
          req.url.startsWith('/assets/sheets/sheets/') ? req.url : null,
      },
    },
  },

  optimizeDeps: {
    // frappe-ui ships its components as source and imports feather-icons,
    // a CommonJS package with no `default` export. Without pre-bundling,
    // Vite serves the raw CJS module and `import feather from 'feather-icons'`
    // (in frappe-ui's FeatherIcon.vue) fails at runtime. Pre-bundling lets
    // esbuild synthesize the default-export interop.
    include: ['frappe-ui', 'feather-icons'],
  },
})
