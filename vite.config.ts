import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
  },
  preview: {
    port: 8080,
  },
  plugins: [react(), nodePolyfills()],
  build: {
    outDir: 'build',
  },
  resolve: {
    alias: {
      '@': '/src',
      'App': "/src/App.tsx",
      'app-constants': "/src/app-constants",
      'Icons': "/src/Icons",
      src: "/src",
      assets: "/src/assets",
      cache: "/src/cache",
      components: "/src/components",
      contexts: "/src/contexts",
      environments: "/src/environments",
      hooks: "/src/hooks",
      main: "/src/main",
      middleware: "/src/middleware",
      models: "/src/models",
      pages: "/src/pages",
      'query-hooks': "/src/query-hooks",
      routes: "/src/routes",
      services: "/src/services",
      types: "/src/types",
      utils: "/src/utils",
      views: "/src/views",
      crypto: 'crypto-browserify',
    },
  },
})
