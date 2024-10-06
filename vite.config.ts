import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

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
      src: path.resolve(__dirname, './src'),
      crypto: 'crypto-browserify',
    },
  },
});
