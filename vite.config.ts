import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Keep shared dependencies in automatic chunks so a lazy Firebase
          // chunk cannot pull unrelated eagerly used modules into its runtime.
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            const moduleId = id.replace(/\\/g, '/');
            if (/\/node_modules\/(?:@firebase\/auth|firebase\/auth)\//.test(moduleId)) {
              return 'firebase-auth';
            }
            if (/\/node_modules\/(?:@firebase\/(?:firestore|webchannel-wrapper)|firebase\/firestore)\//.test(moduleId)) {
              return 'firebase-firestore';
            }
            // App, component, logger, and util form the common SDK runtime.
            // Keeping them together avoids Auth/Firestore dependency cycles.
            if (/\/node_modules\/(?:@firebase\/(?:app|component|logger|util)|firebase\/app)\//.test(moduleId)) {
              return 'firebase-app';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
