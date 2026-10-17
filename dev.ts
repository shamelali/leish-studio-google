/**
 * Local development / self-hosted entry point.
 *
 * Vercel does not touch this file — the platform detects `server.ts` (default
 * export) as the Express entry, serves built assets from `outputDirectory`,
 * and invokes the app for every other request.
 */
import path from 'path';
import express from 'express';
import dotenv from 'dotenv';

async function bootstrap() {
  // Load server-only local settings before constructing Gemini/store clients.
  // Explicit environment variables (including deployment secrets) win.
  if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ path: ['.env.local', '.env'], quiet: true });
  }
  const { default: app } = await import('./server.ts');
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Leish! Full-stack server running on http://0.0.0.0:${port}`);
  });

  // Graceful shutdown: drain connections, finish in-flight work, exit cleanly.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[leish] ${signal} received, draining connections...`);
    server.close((err) => {
      if (err) {
        console.error('[leish] Error during shutdown', err);
        process.exit(1);
      }
      process.exit(0);
    });
    // Force exit if connections hang (e.g. long uploads, SSE).
    setTimeout(() => {
      console.error('[leish] Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
