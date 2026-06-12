import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy WebSocket connections to the backend during development
    proxy: {
      '/ws': {
        target: 'ws://localhost:5000',
        ws: true,
      },
    },
  },
});
