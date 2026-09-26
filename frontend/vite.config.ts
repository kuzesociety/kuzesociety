import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev: the FastAPI backend runs on :8000; in production it serves the built app itself.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
