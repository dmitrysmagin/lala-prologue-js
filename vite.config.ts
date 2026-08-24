import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  // Static assets live in `public/` (canonical copy from lala-qb/).
  // Vite serves `public` at `/` in dev and copies it to `dist` on build.
  // No code imports from `lala-qb/` at runtime — `lala-qb/` is reference only (gitignored).
  publicDir: 'public',
  server: {
    port: 3000
  },
  build: {
    outDir: 'dist',
    copyPublicDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  }
})