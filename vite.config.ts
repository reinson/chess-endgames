import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'http'

// Plugin to set correct MIME type for WASM files (Attempt 3)
const wasmContentTypePlugin = (): Plugin => {
  return {
    name: 'enforce-wasm-content-type',
    // Apply this middleware before Vite's internal static file serving
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        // Check more broadly first, maybe the path assumption is wrong
        if (req.url?.endsWith('.wasm')) {
           console.log(`[wasm pre-plugin] Setting Content-Type for: ${req.url}`);
           res.setHeader('Content-Type', 'application/wasm');
        }
        next();
      });
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/chess-endgames/',
  plugins: [
    // Add our plugin *before* react()
    wasmContentTypePlugin(),
    react()
  ],
  assetsInclude: ['**/*.wasm'],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: {
    target: 'esnext'
  }
})
