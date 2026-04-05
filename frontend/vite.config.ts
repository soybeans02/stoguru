import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'https://stoguru-api.onrender.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    sourcemap: false,
  },
})
