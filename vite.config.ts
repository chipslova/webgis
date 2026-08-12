import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 3000,
    open: false,
    host: true
  },
  optimizeDeps: {
    exclude: ['maplibre-gl']
  },
  build: {
    outDir: 'dist',
    target: 'es2022'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});
