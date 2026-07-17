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
      // Proxy frappe / frappe-ui runtime assets to the backend, but let
      // Vite serve the SPA's own base (which lives under /assets too) so
      // dev/HMR works — otherwise every app module gets shadowed by the
      // proxy and forwarded to the backend's built bundle.
      '/assets': {
        target: 'http://localhost:8001',
        bypass: (req) =>
          req.url.startsWith('/assets/sheets/sheets/') ? req.url : undefined,
      },
    },
  },

  optimizeDeps: {
    // feather-icons is a CJS dep pulled in transitively by frappe-ui; without
    // forcing it through Vite's pre-bundler it gets served raw and its ESM
    // `default` import fails at runtime in dev (works in the Rollup build).
    include: ['frappe-ui', 'feather-icons'],
  },
})
